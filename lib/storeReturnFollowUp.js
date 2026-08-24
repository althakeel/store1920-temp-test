import Order from '@/models/Order';
import { allocateShortOrderNumber } from '@/lib/orderNumber';
import { getDisplayOrderNumber } from '@/lib/orderDisplay';
import { isWaslahConfigured } from '@/lib/waslah';
import { shipOrderWithWaslah, shipReversePickupForOriginalOrder } from '@/lib/waslahShipmentService';
import { notifyCustomerOfOrderStatusChange } from '@/lib/orderStatusCustomerNotify';
import { toPlainReturns, patchOrder } from '@/lib/orderSafePersist';

function cloneOrderItems(order = {}, overrideItems = null) {
  if (Array.isArray(overrideItems) && overrideItems.length) {
    return overrideItems.map((item) => {
      const productId = item?.productId && typeof item.productId === 'object'
        ? (item.productId._id || item.productId.id)
        : item?.productId;
      return {
        productId: productId || undefined,
        name: item?.name || item?.productName || '',
        price: Number(item?.price || 0),
        quantity: Math.max(1, Number(item?.quantity || 1)),
        variantOptions: item?.variantOptions || null,
      };
    }).filter((item) => item.name || item.productId);
  }

  const lines = Array.isArray(order.orderItems) && order.orderItems.length
    ? order.orderItems
    : (Array.isArray(order.items) ? order.items : []);

  return lines.map((item) => {
    const productId = item?.productId && typeof item.productId === 'object'
      ? (item.productId._id || item.productId.id)
      : item?.productId;
    return {
      productId: productId || undefined,
      name: item?.name || item?.productName || '',
      price: Number(item?.price || 0),
      quantity: Math.max(1, Number(item?.quantity || 1)),
      variantOptions: item?.variantOptions || null,
    };
  }).filter((item) => item.name || item.productId);
}

function pickupAddressFromCase(returnCase, sourceOrder) {
  const pickup = returnCase?.pickupAddress && typeof returnCase.pickupAddress === 'object'
    ? returnCase.pickupAddress
    : null;
  if (pickup && (pickup.street || pickup.city || pickup.phone || pickup.name)) {
    return pickup;
  }
  return sourceOrder.shippingAddress || {};
}

export async function createReturnFollowUpOrder({
  sourceOrder,
  kind,
  returnIndex = 0,
  actor = {},
  items: overrideItems = null,
  shippingAddress = null,
  sourceReturnRequestId = null,
  sourceReturnNumber = '',
} = {}) {
  const type = String(kind || '').toUpperCase() === 'REPLACEMENT' ? 'REPLACEMENT' : 'RETURN';
  const sourceNumber = getDisplayOrderNumber(sourceOrder) || String(sourceOrder?._id || '');
  const items = cloneOrderItems(sourceOrder, overrideItems);
  if (!items.length) {
    throw new Error('Original order has no products to copy');
  }

  const shortOrderNumber = await allocateShortOrderNumber(String(sourceOrder.storeId));
  const actorName = String(actor.name || actor.email || 'Store staff').trim();
  const label = type === 'REPLACEMENT'
    ? `Replacement for order #${sourceNumber}`
    : `Return of order #${sourceNumber}`;
  const notes = type === 'REPLACEMENT'
    ? `${label}. Ship this order to the customer. Created by ${actorName}.`
    : `${label}. Send/schedule EMX pickup from the customer. Created by ${actorName}.`;

  const followUp = await Order.create({
    storeId: sourceOrder.storeId,
    userId: sourceOrder.userId || undefined,
    addressId: sourceOrder.addressId || undefined,
    total: Number(sourceOrder.total || 0),
    shippingFee: 0,
    status: type === 'REPLACEMENT' ? 'ORDER_PLACED' : 'PICKUP_REQUESTED',
    paymentMethod: sourceOrder.paymentMethod || 'COD',
    paymentStatus: 'PAID',
    isPaid: true,
    isCouponUsed: false,
    isGuest: Boolean(sourceOrder.isGuest),
    guestName: sourceOrder.guestName || sourceOrder.shippingAddress?.name || '',
    guestEmail: sourceOrder.guestEmail || sourceOrder.shippingAddress?.email || '',
    guestPhone: sourceOrder.guestPhone || sourceOrder.shippingAddress?.phone || '',
    alternatePhone: sourceOrder.alternatePhone || '',
    alternatePhoneCode: sourceOrder.alternatePhoneCode || '',
    shippingAddress: shippingAddress || sourceOrder.shippingAddress || {},
    orderItems: items,
    notes,
    shortOrderNumber,
    fulfillmentKind: type,
    sourceOrderId: sourceOrder._id,
    sourceOrderNumber: sourceNumber,
    sourceReturnIndex: returnIndex,
    sourceReturnRequestId: sourceReturnRequestId || null,
    sourceReturnNumber: sourceReturnNumber || '',
    manualStoreOrder: true,
    storeCreatedByUid: actor.uid || null,
    storeCreatedByName: actorName,
    attribution: {
      utmSource: 'store_admin',
      utmMedium: type === 'REPLACEMENT' ? 'replacement_order' : 'return_order',
      utmCampaign: String(sourceOrder._id),
    },
    waslah: {
      autoShipEnrolled: false,
    },
  });

  return followUp;
}

async function shipFollowUpToEmx(followUp, { storeId, skipPickup = true } = {}) {
  if (!isWaslahConfigured()) {
    return { skipped: true, reason: 'waslah_not_configured' };
  }
  try {
    const result = await shipOrderWithWaslah({
      orderId: String(followUp._id),
      storeId: String(storeId || followUp.storeId),
      skipPickup,
      allowFallbackReference: true,
    });
    return {
      success: Boolean(result?.success !== false),
      skipped: false,
      message: result?.message || null,
      trackingNumber: result?.trackingNumber || result?.order?.trackingId || null,
      waslahOrderId: result?.waslahOrderId || result?.order?.waslah?.orderId || null,
    };
  } catch (error) {
    console.error('[return-follow-up] EMX ship failed:', error?.message || error);
    return {
      success: false,
      skipped: false,
      error: error?.message || 'Failed to send return/replacement to EMX',
    };
  }
}

async function shipReversePickupOnOriginal(order, {
  storeId,
  pickupAddress = null,
  returnReason = '',
  returnRequestNumber = '',
} = {}) {
  if (!isWaslahConfigured()) {
    return { skipped: true, reason: 'waslah_not_configured' };
  }
  try {
    const result = await shipReversePickupForOriginalOrder({
      orderId: String(order._id),
      storeId: String(storeId || order.storeId),
      pickupAddress,
      returnReason,
      returnRequestNumber,
    });
    return {
      success: Boolean(result?.success !== false),
      skipped: Boolean(result?.skipped),
      alreadyProcessed: Boolean(result?.alreadyProcessed),
      message: result?.message || null,
      trackingNumber: result?.trackingNumber || null,
      waslahOrderId: result?.waslahOrderId || null,
    };
  } catch (error) {
    console.error('[return-follow-up] EMX reverse pickup failed:', error?.message || error);
    return {
      success: false,
      skipped: false,
      error: error?.message || 'Failed to send reverse pickup to EMX',
    };
  }
}

function caseFollowUpItems(returnCase) {
  return (returnCase?.items || []).map((item) => ({
    productId: item.productId || undefined,
    name: item.productName || item.name || '',
    price: Number(item.price || 0),
    quantity: Math.max(1, Number(item.quantity || 1)),
    variantOptions: item.variantOptions || null,
  })).filter((item) => item.name || item.productId);
}

/**
 * Approve a return/replacement: schedule reverse pickup on the original order.
 * Replacement shipment is created later, after warehouse QC passes.
 */
export async function approveReturnRequestAndCreateFollowUp({
  order,
  returnIndex,
  actor = {},
  returnCase = null,
} = {}) {
  const request = order?.returns?.[returnIndex];
  if (!request) {
    throw new Error('Return request not found');
  }

  const kind = String(returnCase?.type || request.type || 'RETURN').toUpperCase() === 'REPLACEMENT'
    ? 'REPLACEMENT'
    : 'RETURN';
  const previousStatus = String(order.status || '').toUpperCase();
  const sourceNumber = getDisplayOrderNumber(order) || String(order._id);
  const alreadyApproved = Boolean(request.approvedAt);

  request.status = 'APPROVED';
  if (!alreadyApproved) {
    request.approvedAt = new Date();
    request.sellerNotes = [
      request.sellerNotes,
      kind === 'REPLACEMENT'
        ? 'Approved — reverse pickup scheduled on this order. Replacement ships after QC.'
        : 'Approved — reverse pickup scheduled on this order and sent to EMX',
    ].filter(Boolean).join(' · ');
  }

  order.status = kind;
  let pickupShipResult = { skipped: true };
  const alreadyShipped = Boolean(order.waslahReturn?.trackingNumber);
  if (alreadyShipped) {
    pickupShipResult = {
      success: true,
      skipped: false,
      alreadyProcessed: true,
      message: 'Reverse pickup already exists for this request.',
    };
  } else {
    pickupShipResult = await shipReversePickupOnOriginal(order, {
      storeId: order.storeId,
      pickupAddress: pickupAddressFromCase(returnCase, order),
      returnReason: String(returnCase?.reason || request.reason || '').trim()
        || (kind === 'REPLACEMENT' ? 'Customer replacement pickup' : 'Customer return'),
      returnRequestNumber: String(returnCase?.returnNumber || request.returnNumber || '').trim(),
    });
  }
  if (
    !request.returnPickupOrderId
    && (alreadyShipped || pickupShipResult?.success || pickupShipResult?.alreadyProcessed || pickupShipResult?.waslahOrderId)
  ) {
    request.returnPickupOrderId = order._id;
    request.returnPickupOrderNumber = sourceNumber;
    if (kind === 'RETURN') {
      request.followUpOrderId = order._id;
      request.followUpOrderNumber = sourceNumber;
    }
  }

  if (typeof order.markModified === 'function') {
    order.markModified('returns');
  }
  await patchOrder(order._id, {
    status: kind,
    returns: toPlainReturns(order),
  });

  if (!alreadyApproved) {
    try {
      const plain = typeof order.toObject === 'function' ? order.toObject() : order;
      await notifyCustomerOfOrderStatusChange(plain, kind, {
        previousStatus,
        source: kind === 'REPLACEMENT' ? 'store_replacement_approve' : 'store_return_approve',
        force: true,
        actor: {
          uid: actor.uid,
          name: actor.name || actor.email || 'Store staff',
          email: actor.email || '',
        },
      });
    } catch (emailError) {
      console.error('[return-follow-up] customer email failed', emailError?.message || emailError);
    }
  }

  let message = kind === 'REPLACEMENT'
    ? `Approved replacement for #${sourceNumber}. EMX will collect the item from the customer.`
    : `Approved return for #${sourceNumber}. EMX will collect the item from the customer.`;
  message += pickupShipResult?.alreadyProcessed
    ? ' Reverse pickup was already on EMX.'
    : pickupShipResult?.success
      ? ' Pickup was sent to EMX and scheduled.'
      : pickupShipResult?.skipped
        ? ' Open this order to send/schedule EMX pickup.'
        : pickupShipResult?.error
          ? ` EMX pickup failed: ${pickupShipResult.error}.`
          : '';

  return {
    success: true,
    kind,
    message,
    followUpOrder: {
      _id: order._id,
      shortOrderNumber: order.shortOrderNumber,
      status: order.status,
      fulfillmentKind: 'SALE',
    },
    pickupOrder: {
      _id: order._id,
      shortOrderNumber: order.shortOrderNumber,
      status: order.status,
      fulfillmentKind: 'SALE',
    },
    emx: pickupShipResult,
    pickupEmx: pickupShipResult,
    order: {
      _id: order._id,
      status: order.status,
      returns: order.returns,
    },
  };
}

export async function createReplacementAfterQc({
  sourceOrder,
  actor = {},
  returnCase = null,
} = {}) {
  const items = caseFollowUpItems(returnCase);
  const followUp = await createReturnFollowUpOrder({
    sourceOrder,
    kind: 'REPLACEMENT',
    returnIndex: Number(returnCase?.orderReturnIndex || 0),
    actor,
    items: items.length ? items : null,
    shippingAddress: sourceOrder.shippingAddress || {},
    sourceReturnRequestId: returnCase?._id || null,
    sourceReturnNumber: returnCase?.returnNumber || '',
  });
  const shipResult = await shipFollowUpToEmx(followUp, {
    storeId: sourceOrder.storeId,
    skipPickup: true,
  });
  const number = String(followUp.shortOrderNumber || followUp._id);
  let message = `Replacement order #${number} created.`;
  message += shipResult?.success
    ? ' Sent to EMX for delivery.'
    : shipResult?.skipped
      ? ' Open the replacement order to send it to EMX.'
      : ` EMX send failed: ${shipResult?.error || 'unknown error'}.`;
  return { followUp, emx: shipResult, message };
}
