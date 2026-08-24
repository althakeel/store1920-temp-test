import Order from '@/models/Order';
import Product from '@/models/Product';
import { getDisplayOrderNumber } from '@/lib/orderDisplay';
import {
  getZohoOrganizationId,
  isZohoInventoryConfigured,
} from '@/lib/zoho';
import {
  findInventoryItemBySku,
  zohoInventoryRequest,
} from '@/lib/zohoInventoryClient';
import { syncOneProductToZoho } from '@/lib/zohoProductSync';
import { isAwaitingPaymentOrder } from '@/lib/deferredOrderStatus';
import { isFailedOrCancelledOrder } from '@/lib/orderConfirmationPolicy';
import { getOrderFulfillmentKind } from '@/lib/storeReturnLabels';
import {
  buildZohoAddress,
  buildZohoLineDetails,
  buildZohoOrderNotes,
  resolveZohoOrderCustomer,
  resolveZohoOrderDiscount,
  resolveZohoProductSku,
} from '@/lib/zohoOrderDetails';

function buildReferenceNumber(order = {}) {
  const orderNo = getDisplayOrderNumber(order) || String(order._id);
  const prefix = String(process.env.ZOHO_INVENTORY_REFERENCE_PREFIX || 'Store1920-').trim();
  if (!prefix) return orderNo;
  if (orderNo.startsWith(prefix)) return orderNo;
  return `${prefix}${orderNo}`;
}

function isZohoItemImageSyncEnabled() {
  const flag = String(process.env.ZOHO_INVENTORY_SYNC_ITEMS || 'true').trim().toLowerCase();
  return flag !== 'false' && flag !== '0';
}

async function ensureZohoInventoryItem({ product, variantOptions }) {
  const sku = resolveZohoProductSku(product, variantOptions);
  if (!sku) return null;

  if (product?.zoho?.itemId && String(product.zoho.sku || '') === sku) {
    return product.zoho.itemId;
  }

  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const matchedVariant = variants.find((variant) => String(variant?.sku || '').trim() === sku);
  if (matchedVariant?.zoho?.itemId) {
    return matchedVariant.zoho.itemId;
  }

  const existing = await findInventoryItemBySku(sku);
  if (existing?.item_id) return existing.item_id;

  const syncResult = await syncOneProductToZoho(product, { skipImages: false });
  const matched = (syncResult.results || []).find((row) => row.sku === sku && row.itemId);
  if (matched?.itemId) return matched.itemId;

  return null;
}

async function buildLineItems(order = {}) {
  const details = buildZohoLineDetails(order);
  const lineItems = [];

  for (const line of details) {
    const lineItem = {
      name: line.name,
      description: line.description || undefined,
      rate: line.rate,
      quantity: line.quantity,
    };

    if (isZohoItemImageSyncEnabled()) {
      try {
        const itemId = await ensureZohoInventoryItem({
          product: line.product,
          variantOptions: line.variantOptions || {},
        });
        if (itemId) lineItem.item_id = itemId;
      } catch (itemError) {
        console.warn('[zoho-inventory] catalog item link failed:', itemError?.message || itemError);
      }
    }

    lineItems.push(lineItem);
  }

  return lineItems;
}

async function finalizeInventorySalesOrder(salesOrderId) {
  const autoConfirm = String(process.env.ZOHO_INVENTORY_AUTO_CONFIRM || 'true').trim().toLowerCase();
  if (autoConfirm === 'false' || autoConfirm === '0') return 'draft';

  try {
    await zohoInventoryRequest(`/salesorders/${salesOrderId}/status/confirmed`, { method: 'POST' });
    return 'confirmed';
  } catch (confirmError) {
    try {
      await zohoInventoryRequest(`/salesorders/${salesOrderId}/submit`, { method: 'POST' });
      await zohoInventoryRequest(`/salesorders/${salesOrderId}/approve`, { method: 'POST' });
      try {
        await zohoInventoryRequest(`/salesorders/${salesOrderId}/approve/final`, { method: 'POST' });
      } catch {
        // Final approval is optional depending on org settings.
      }
      await zohoInventoryRequest(`/salesorders/${salesOrderId}/status/confirmed`, { method: 'POST' });
      return 'confirmed';
    } catch (approvalError) {
      console.warn(
        '[zoho-inventory] sales order left as draft:',
        approvalError?.message || confirmError?.message,
      );
      return 'draft';
    }
  }
}

async function findInventoryCustomer(customer = {}) {
  if (customer.email) {
    const byEmail = await zohoInventoryRequest('/contacts', {
      query: { email: customer.email, contact_type: 'customer' },
    });
    const match = Array.isArray(byEmail?.contacts) ? byEmail.contacts[0] : null;
    if (match?.contact_id) return match.contact_id;
  }

  if (customer.phone) {
    const byPhone = await zohoInventoryRequest('/contacts', {
      query: { phone: customer.phone, contact_type: 'customer' },
    });
    const match = Array.isArray(byPhone?.contacts) ? byPhone.contacts[0] : null;
    if (match?.contact_id) return match.contact_id;
  }

  return null;
}

async function upsertInventoryCustomer(customer = {}) {
  if (!customer.contactName) {
    throw new Error('Customer name is required for Zoho Inventory');
  }

  const address = buildZohoAddress(customer);
  const contactPayload = {
    contact_name: customer.contactName,
    contact_type: 'customer',
    customer_sub_type: 'individual',
    email: customer.email || undefined,
    phone: customer.phone || undefined,
    mobile: customer.alternatePhone || undefined,
    billing_address: address,
    shipping_address: address,
  };

  const existingId = await findInventoryCustomer(customer);
  if (existingId) {
    try {
      await zohoInventoryRequest(`/contacts/${existingId}`, {
        method: 'PUT',
        body: {
          email: customer.email || undefined,
          phone: customer.phone || undefined,
          mobile: customer.alternatePhone || undefined,
          billing_address: address,
          shipping_address: address,
        },
      });
    } catch (updateError) {
      console.warn('[zoho-inventory] contact address update skipped:', updateError?.message || updateError);
    }
    return existingId;
  }

  const response = await zohoInventoryRequest('/contacts', {
    method: 'POST',
    body: contactPayload,
  });

  const contactId = response?.contact?.contact_id
    || response?.contacts?.[0]?.contact_id
    || null;
  if (!contactId) {
    throw new Error('Zoho Inventory contact create did not return contact_id');
  }
  return contactId;
}

async function createInventorySalesOrder(order = {}, customerId) {
  const lineItems = await buildLineItems(order);
  if (!lineItems.length) {
    throw new Error('Order has no line items for Zoho Inventory sales order');
  }

  const referenceNumber = buildReferenceNumber(order);
  const orderDate = new Date(order.createdAt || Date.now()).toISOString().slice(0, 10);
  const discount = resolveZohoOrderDiscount(order);
  const courier = String(order.courier || '').trim();

  const body = {
    customer_id: customerId,
    date: orderDate,
    reference_number: referenceNumber,
    line_items: lineItems,
    shipping_charge: Number(order.shippingFee || 0),
    notes: buildZohoOrderNotes(order),
  };

  if (discount > 0) {
    body.discount = discount;
    body.is_discount_before_tax = true;
    body.discount_type = 'entity_level';
  }
  if (courier) body.delivery_method = courier;

  const response = await zohoInventoryRequest('/salesorders', {
    method: 'POST',
    body,
  });

  const salesOrder = response?.salesorder || response?.salesorders?.[0] || null;
  const salesOrderId = salesOrder?.salesorder_id || null;
  if (!salesOrderId) {
    throw new Error('Zoho Inventory sales order create did not return salesorder_id');
  }

  const zohoStatus = await finalizeInventorySalesOrder(salesOrderId);

  return {
    salesOrderId,
    salesOrderNumber: salesOrder?.salesorder_number || null,
    referenceNumber,
    zohoStatus,
  };
}

export async function testZohoInventoryConnection() {
  const orgData = await zohoInventoryRequest('/organizations', { skipOrgId: true });
  const organizations = Array.isArray(orgData?.organizations) ? orgData.organizations : [];
  const configuredOrgId = getZohoOrganizationId();
  const matchedOrg = organizations.find(
    (org) => String(org.organization_id) === configuredOrgId,
  ) || null;

  return {
    connected: true,
    organizationCount: organizations.length,
    organizations: organizations.map((org) => ({
      organization_id: org.organization_id,
      name: org.name,
      is_default: org.is_default,
    })),
    configuredOrganizationId: configuredOrgId || null,
    configuredOrganizationMatched: Boolean(matchedOrg),
    configuredOrganizationName: matchedOrg?.name || null,
  };
}

export function shouldSyncOrderToZohoInventory(order = {}) {
  if (!isZohoInventoryConfigured()) return false;
  if (!order?._id) return false;
  if (isFailedOrCancelledOrder(order)) return false;
  if (isAwaitingPaymentOrder(order)) return false;
  if (getOrderFulfillmentKind(order) !== 'SALE') return false;
  if (order.zohoInventory?.salesOrderId) return false;
  return true;
}

export async function syncOrderToZohoInventory(orderOrId, { force = false } = {}) {
  if (!isZohoInventoryConfigured()) {
    return { skipped: true, reason: 'zoho_inventory_disabled' };
  }

  const orderId = typeof orderOrId === 'string' ? orderOrId : orderOrId?._id;
  if (!orderId) {
    return { skipped: true, reason: 'order_not_found' };
  }

  const order = typeof orderOrId === 'object' && orderOrId?.orderItems
    ? orderOrId
    : await Order.findById(orderId)
      .populate({ path: 'orderItems.productId', model: Product })
      .lean();

  const hydratedOrder = order?.orderItems?.some(
    (item) => item?.productId && typeof item.productId !== 'object',
  )
    ? await Order.findById(orderId)
      .populate({ path: 'orderItems.productId', model: Product })
      .lean()
    : order;

  if (!hydratedOrder) {
    return { skipped: true, reason: 'order_not_found' };
  }

  if (!force && !shouldSyncOrderToZohoInventory(hydratedOrder)) {
    if (hydratedOrder.zohoInventory?.salesOrderId) return { skipped: true, reason: 'already_synced' };
    return { skipped: true, reason: 'order_not_eligible' };
  }

  const claim = await Order.findOneAndUpdate(
    {
      _id: orderId,
      ...(force ? {} : { 'zohoInventory.salesOrderId': { $in: [null, ''] } }),
    },
    {
      $set: {
        'zohoInventory.syncStatus': 'syncing',
        'zohoInventory.lastError': null,
      },
    },
    { new: true },
  ).lean();

  if (!claim && !force) {
    return { skipped: true, reason: 'already_synced_or_in_progress' };
  }

  try {
    const customer = resolveZohoOrderCustomer(hydratedOrder);
    const customerId = await upsertInventoryCustomer(customer);
    const salesOrder = await createInventorySalesOrder(hydratedOrder, customerId);

    await Order.findByIdAndUpdate(orderId, {
      $set: {
        zohoInventory: {
          customerId,
          salesOrderId: salesOrder.salesOrderId,
          salesOrderNumber: salesOrder.salesOrderNumber,
          referenceNumber: salesOrder.referenceNumber,
          zohoStatus: salesOrder.zohoStatus || null,
          syncedAt: new Date(),
          syncStatus: 'synced',
          lastError: null,
        },
      },
    });

    return { success: true, ...salesOrder, customerId };
  } catch (error) {
    const message = String(error?.message || error);
    await Order.findByIdAndUpdate(orderId, {
      $set: {
        'zohoInventory.syncStatus': 'failed',
        'zohoInventory.lastError': message,
      },
    });
    console.error('[zoho-inventory] sync failed:', message);
    return { success: false, error: message };
  }
}

export async function syncOrderToZohoInventoryOnce(orderOrId) {
  try {
    return await syncOrderToZohoInventory(orderOrId);
  } catch (error) {
    console.error('[zoho-inventory] unexpected sync error:', error);
    return { success: false, error: error?.message || 'sync_failed' };
  }
}

export function getZohoInventoryPublicConfig() {
  return {
    enabled: isZohoInventoryConfigured(),
    organizationId: getZohoOrganizationId() || null,
    requiredScope: 'ZohoInventory.FullAccess.all',
    docs: 'https://www.zoho.com/inventory/api/v1/oauth/#overview',
  };
}
