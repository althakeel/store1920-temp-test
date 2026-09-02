import {
  buildTrackOrderPageUrl,
  getDisplayOrderNumber,
  getOrderLineItemDisplayName,
  getOrderLineProduct,
} from '@/lib/orderDisplay';
import {
  getEmxTrackingNumber,
  getReturnEmxTrackingNumber,
  buildEmxTrackingUrl,
  getWaslahCourierStatus,
  getWaslahCourierReason,
} from '@/lib/waslahTracking';
import { formatWarehousePacking } from '@/lib/warehouseOrderPacking';
import { formatWarehouseReturn } from '@/lib/warehouseReturnCollect';
import { getLabelDownloadCount, isWaslahLabelReadyOrder } from '@/lib/waslahReceipts';
import { getProductThumbnailUrl } from '@/lib/productMedia';
import { getCustomerSiteUrl } from '@/lib/appUrl';

function ensureAbsoluteHttpsUrl(url) {
  const value = String(url || '').trim();
  if (!value || value === '/placeholder.png') return '';
  if (/^https:\/\//i.test(value)) return value;
  if (/^http:\/\//i.test(value)) return value.replace(/^http:/i, 'https:');
  const base = String(getCustomerSiteUrl() || 'https://store1920.com').replace(/\/+$/, '');
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `${base}${value}`;
  return `${base}/${value.replace(/^\//, '')}`;
}

function lineProductId(item) {
  return String(item?.productId?._id || item?.productId?.id || item?.productId || '').trim();
}

/** True when order line still has a raw ObjectId (no images/sku yet). */
function lineNeedsProductHydration(item) {
  const product = getOrderLineProduct(item);
  if (product?._id || product?.images || product?.image || product?.sku) return false;
  const id = lineProductId(item);
  return Boolean(id && /^[a-f\d]{24}$/i.test(id));
}

/**
 * Batch-load Product docs onto orderItems.productId when missing.
 * Packing/returns APIs sometimes load lean orders without populate — that
 * strips thumbnails and SKUs from the warehouse app payload.
 */
export async function ensureWarehouseOrdersProducts(orders = []) {
  const list = Array.isArray(orders) ? orders.filter(Boolean) : [];
  if (!list.length) return list;

  const missingIds = new Set();
  for (const order of list) {
    for (const item of order?.orderItems || []) {
      if (!lineNeedsProductHydration(item)) continue;
      missingIds.add(lineProductId(item));
    }
  }
  if (!missingIds.size) return list;

  const Product = (await import('@/models/Product')).default;
  const products = await Product.find({ _id: { $in: [...missingIds] } })
    .select('name sku images image')
    .lean();
  const byId = new Map(products.map((product) => [String(product._id), product]));

  return list.map((order) => {
    const items = Array.isArray(order?.orderItems) ? order.orderItems : [];
    let changed = false;
    const nextItems = items.map((item) => {
      if (!lineNeedsProductHydration(item)) return item;
      const product = byId.get(lineProductId(item));
      if (!product) return item;
      changed = true;
      return typeof item?.toObject === 'function'
        ? { ...item.toObject(), productId: product }
        : { ...item, productId: product };
    });
    if (!changed) return order;
    if (typeof order?.toObject === 'function') {
      return { ...order.toObject(), orderItems: nextItems };
    }
    return { ...order, orderItems: nextItems };
  });
}

export async function ensureWarehouseOrderProducts(order) {
  if (!order) return order;
  const [hydrated] = await ensureWarehouseOrdersProducts([order]);
  return hydrated || order;
}

function serializeLineItems(order = {}) {
  return (order.orderItems || []).map((item, index) => {
    const product = getOrderLineProduct(item);
    const productId = String(product?._id || item?.productId?._id || item?.productId || '').trim() || null;
    const image = ensureAbsoluteHttpsUrl(
      getProductThumbnailUrl(product, {
        fallback: item?.image || item?.thumbnail || '',
      }),
    );
    return {
      itemIndex: index,
      productId,
      name: getOrderLineItemDisplayName(item, product),
      quantity: Number(item?.quantity) || 1,
      sku: String(item?.sku || product?.sku || '').trim() || null,
      image: image || null,
      variantOptions: item?.variantOptions || null,
    };
  });
}

/**
 * Compact tracking payload for warehouse / pickup apps.
 * Prefer `serializeWarehouseTrackingOrderHydrated` when the order may be lean.
 */
export function serializeWarehouseTrackingOrder(order = {}) {
  const emxTrackingNumber = getEmxTrackingNumber(order) || '';
  const returnPickupAwb = getReturnEmxTrackingNumber(order)
    || String(order?.waslahReturn?.trackingNumber || '').trim()
    || null;
  const waslahOrderId = String(order?.waslah?.orderId || '').trim() || null;
  const shortOrderNumber = getDisplayOrderNumber(order) || null;
  const labelDownloadCount = getLabelDownloadCount(order);
  const packing = formatWarehousePacking(order);
  const liveStatus = getWaslahCourierStatus(order)
    || order?.waslah?.appStatus
    || order?.waslah?.carrierStatus
    || null;
  const courierReason = getWaslahCourierReason(order);

  return {
    orderId: String(order?._id || ''),
    shortOrderNumber,
    status: String(order?.status || '').toUpperCase() || null,
    courier: order?.courier || (waslahOrderId ? 'EMX' : null),
    trackingNumber: emxTrackingNumber || null,
    emxTrackingNumber: emxTrackingNumber || null,
    waslahTrackingNumber: String(order?.waslah?.waslahTrackingNumber || '').trim() || null,
    trackingUrl: buildEmxTrackingUrl(emxTrackingNumber) || order?.trackingUrl || null,
    trackOrderPageUrl: buildTrackOrderPageUrl(order),
    labelReady: isWaslahLabelReadyOrder(order),
    labelDownloadCount,
    labelPrintedAt: order?.waslah?.labelPrintedAt || null,
    labelUrl: order?.waslah?.labelUrl || null,
    courierReason: courierReason?.reason || null,
    courierReasonLabel: courierReason?.label || null,
    courierReasonIsFailure: Boolean(courierReason?.isFailure),
    pickup: {
      requested: Boolean(order?.waslah?.pickupRequestedAt),
      requestedAt: order?.waslah?.pickupRequestedAt || null,
      type: order?.waslah?.pickupType || null,
      date: order?.waslah?.pickupDate || null,
      time: order?.waslah?.pickupTime || null,
      vehicle: order?.waslah?.pickupVehicle || null,
    },
    warehousePacking: packing,
    returnCollected: formatWarehouseReturn(order),
    returnPickup: order?.waslahReturn?.orderId || returnPickupAwb
      ? {
        orderId: String(order?.waslahReturn?.orderId || '').trim() || null,
        trackingNumber: returnPickupAwb,
        reference: order?.waslahReturn?.reference || null,
        originalTrackingNumber: order?.waslahReturn?.originalTrackingNumber || emxTrackingNumber || null,
        trackingUrl: returnPickupAwb ? buildEmxTrackingUrl(returnPickupAwb) : null,
      }
      : null,
    waslah: {
      orderId: waslahOrderId,
      serviceId: order?.waslah?.serviceId || null,
      reference: order?.waslah?.reference || null,
      liveStatus,
      currentStatus: order?.waslah?.currentStatus || null,
      currentSubtag: order?.waslah?.currentSubtag || null,
      lastLocation: order?.waslah?.lastLocation || null,
      lastEventAt: order?.waslah?.lastEventAt || null,
      events: Array.isArray(order?.waslah?.events) ? order.waslah.events : [],
      cancelledAt: order?.waslah?.cancelledAt || null,
    },
    customer: {
      name: order?.guestName
        || order?.userId?.name
        || [order?.shippingAddress?.firstName, order?.shippingAddress?.lastName].filter(Boolean).join(' ')
        || null,
      phone: order?.guestPhone || order?.userId?.phone || order?.shippingAddress?.phone || null,
      email: order?.guestEmail || order?.userId?.email || null,
    },
    shippingAddress: order?.shippingAddress || null,
    paymentMethod: order?.paymentMethod || null,
    total: order?.total ?? null,
    currency: order?.currency || 'AED',
    items: serializeLineItems(order),
    createdAt: order?.createdAt || null,
    updatedAt: order?.updatedAt || null,
  };
}

/** Same as serializeWarehouseTrackingOrder, but hydrates product images first. */
export async function serializeWarehouseTrackingOrderHydrated(order) {
  const hydrated = await ensureWarehouseOrderProducts(order);
  return serializeWarehouseTrackingOrder(hydrated);
}

export async function serializeWarehouseTrackingOrdersHydrated(orders = []) {
  const hydrated = await ensureWarehouseOrdersProducts(orders);
  return hydrated.map(serializeWarehouseTrackingOrder);
}

export const WAREHOUSE_TRACKING_QUEUE_STATUSES = [
  'WAITING_FOR_PICKUP',
  'PICKUP_REQUESTED',
  'PROCESSING',
  'ORDER_PLACED',
  'SHIPPED',
];
