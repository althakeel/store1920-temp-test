import Order from '@/models/Order';
import ReturnRequest from '@/models/ReturnRequest';
import ReturnCounter from '@/models/ReturnCounter';
import { getDisplayOrderNumber, getOrderLineItemDisplayName, getOrderLineProduct } from '@/lib/orderDisplay';
import { resolveOrderLineItems, resolveOrderLinePrice, resolveOrderLineProductId } from '@/lib/gtmEcommerceHelpers';
import { formatVariantOptionsLabel, matchVariantByOptions } from '@/lib/productVariantOptions';
import { restockOrderInventory } from '@/lib/orderStockRestock';
import { toPlainReturns, patchOrder } from '@/lib/orderSafePersist';

export const RETURN_WINDOW_DAYS = 7;
export const REPLACEMENT_WINDOW_DAYS = 15;

export const RETURN_STATUSES = {
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  INFO_REQUIRED: 'INFO_REQUIRED',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
  PICKUP_SCHEDULED: 'PICKUP_SCHEDULED',
  RIDER_ASSIGNED: 'RIDER_ASSIGNED',
  PICKUP_IN_PROGRESS: 'PICKUP_IN_PROGRESS',
  ITEM_PICKED_UP: 'ITEM_PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  RECEIVED: 'RECEIVED',
  QC_PENDING: 'QC_PENDING',
  QC_PASSED: 'QC_PASSED',
  QC_FAILED: 'QC_FAILED',
  REFUND_APPROVED: 'REFUND_APPROVED',
  REFUND_INITIATED: 'REFUND_INITIATED',
  REFUND_COMPLETED: 'REFUND_COMPLETED',
  REPLACEMENT_SHIPPED: 'REPLACEMENT_SHIPPED',
  COMPLETED: 'COMPLETED',
};

export const RETURN_STATUS_LABELS = {
  SUBMITTED: 'Request Submitted',
  UNDER_REVIEW: 'Under Review',
  NOT_ELIGIBLE: 'Return Not Eligible',
  INFO_REQUIRED: 'Information Required',
  REJECTED: 'Rejected',
  APPROVED: 'Return Approved',
  PICKUP_SCHEDULED: 'Pickup Scheduled',
  RIDER_ASSIGNED: 'Rider Assigned',
  PICKUP_IN_PROGRESS: 'Pickup In Progress',
  ITEM_PICKED_UP: 'Item Picked Up',
  IN_TRANSIT: 'In Transit to Warehouse',
  RECEIVED: 'Received at Warehouse',
  QC_PENDING: 'Quality Check Pending',
  QC_PASSED: 'QC Passed',
  QC_FAILED: 'QC Failed',
  REFUND_APPROVED: 'Refund Approved',
  REFUND_INITIATED: 'Refund Initiated',
  REFUND_COMPLETED: 'Refund Completed',
  REPLACEMENT_SHIPPED: 'Replacement Shipment',
  COMPLETED: 'Return Completed',
};

const STATUS_RANK = {
  SUBMITTED: 10,
  UNDER_REVIEW: 20,
  INFO_REQUIRED: 25,
  NOT_ELIGIBLE: 30,
  REJECTED: 30,
  APPROVED: 40,
  PICKUP_SCHEDULED: 50,
  RIDER_ASSIGNED: 60,
  PICKUP_IN_PROGRESS: 70,
  ITEM_PICKED_UP: 80,
  IN_TRANSIT: 90,
  RECEIVED: 100,
  QC_PENDING: 110,
  QC_PASSED: 120,
  QC_FAILED: 120,
  REFUND_APPROVED: 130,
  REFUND_INITIATED: 140,
  REFUND_COMPLETED: 150,
  REPLACEMENT_SHIPPED: 150,
  COMPLETED: 160,
};

const OPEN_CASE_STATUSES = new Set([
  'SUBMITTED',
  'UNDER_REVIEW',
  'INFO_REQUIRED',
  'APPROVED',
  'PICKUP_SCHEDULED',
  'RIDER_ASSIGNED',
  'PICKUP_IN_PROGRESS',
  'ITEM_PICKED_UP',
  'IN_TRANSIT',
  'RECEIVED',
  'QC_PENDING',
  'QC_PASSED',
  'REFUND_APPROVED',
  'REFUND_INITIATED',
]);

const NEW_REQUEST_STATUSES = new Set(['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUIRED']);
const PICKUP_TAB_STATUSES = new Set([
  'APPROVED',
  'PICKUP_SCHEDULED',
  'RIDER_ASSIGNED',
  'PICKUP_IN_PROGRESS',
  'ITEM_PICKED_UP',
  'IN_TRANSIT',
]);
const WAREHOUSE_TAB_STATUSES = new Set(['RECEIVED', 'QC_PENDING', 'QC_PASSED', 'QC_FAILED']);
const REFUND_TAB_STATUSES = new Set(['REFUND_APPROVED', 'REFUND_INITIATED', 'REFUND_COMPLETED']);

const DELIVERED_STATUSES = new Set(['DELIVERED']);

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function getReturnStatusLabel(status, type = 'RETURN') {
  const key = String(status || '').toUpperCase();
  if (key === 'APPROVED' && String(type).toUpperCase() === 'REPLACEMENT') {
    return 'Replacement Approved';
  }
  if (key === 'COMPLETED' && String(type).toUpperCase() === 'REPLACEMENT') {
    return 'Replacement Completed';
  }
  if (key === 'NOT_ELIGIBLE' && String(type).toUpperCase() === 'REPLACEMENT') {
    return 'Replacement Not Eligible';
  }
  return RETURN_STATUS_LABELS[key] || key || 'Request Submitted';
}

export function coarseOrderReturnStatus(workflowStatus) {
  const key = String(workflowStatus || '').toUpperCase();
  if (['NOT_ELIGIBLE', 'REJECTED', 'QC_FAILED'].includes(key)) return 'REJECTED';
  if (['COMPLETED', 'REFUND_COMPLETED', 'REPLACEMENT_SHIPPED'].includes(key)) return 'COMPLETED';
  if (STATUS_RANK[key] >= STATUS_RANK.APPROVED) return 'APPROVED';
  return 'REQUESTED';
}

export function formatReturnLongDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Dubai',
  }).format(date);
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setTime(next.getTime() + days * 24 * 60 * 60 * 1000);
  return next;
}

export function getOrderDeliveredAt(order = {}) {
  const candidates = [
    order.orderDelivered,
    order.whatsappSentAt?.orderDelivered,
    order.deliveredAt,
    order.waslah?.deliveredAt,
  ];
  for (const value of candidates) {
    if (!value) continue;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const status = String(order.status || '').toUpperCase();
  const courier = String(order.waslah?.appStatus || order.waslah?.carrierStatus || '').toUpperCase();
  if (DELIVERED_STATUSES.has(status) || courier === 'DELIVERED') {
    const fallback = order.updatedAt ? new Date(order.updatedAt) : new Date();
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }
  return null;
}

export function isOrderDelivered(order = {}) {
  const status = String(order.status || '').toUpperCase();
  const courier = String(order.waslah?.appStatus || order.waslah?.carrierStatus || '').toUpperCase();
  if (DELIVERED_STATUSES.has(status) || courier === 'DELIVERED') return true;
  return Boolean(getOrderDeliveredAt(order));
}

function lineQuantity(item = {}) {
  const qty = Number(item.quantity);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function linePrice(item = {}) {
  const fromHelper = Number(resolveOrderLinePrice(item));
  if (Number.isFinite(fromHelper) && fromHelper > 0) return fromHelper;
  const price = Number(item.price || item.AED || 0);
  return Number.isFinite(price) ? price : 0;
}

function lineProductId(item = {}) {
  return String(resolveOrderLineProductId(item) || '').trim();
}

function lineSku(item = {}, product = {}) {
  const variant = item?.variantOptions && Array.isArray(product?.variants)
    ? matchVariantByOptions(product.variants, item.variantOptions)
    : null;
  return String(variant?.sku || item.sku || product.sku || '').trim();
}

function lineStock(product = {}, item = {}) {
  const variant = item?.variantOptions && Array.isArray(product?.variants)
    ? matchVariantByOptions(product.variants, item.variantOptions)
    : null;
  if (variant && Number.isFinite(Number(variant.stock))) return Number(variant.stock);
  if (Number.isFinite(Number(product.stockQuantity))) return Number(product.stockQuantity);
  return product.inStock === false ? 0 : 1;
}

export function buildReturnLineFromOrder(order, itemIndex, quantity) {
  const lines = resolveOrderLineItems(order);
  const item = lines[itemIndex];
  if (!item) return null;
  const product = getOrderLineProduct(item);
  const qty = Math.max(1, Number(quantity || item.quantity || 1));
  return {
    itemIndex: Number(itemIndex),
    productId: lineProductId(item),
    productName: getOrderLineItemDisplayName(item, product),
    sku: lineSku(item, product),
    price: linePrice(item),
    quantity: qty,
    orderedQuantity: lineQuantity(item),
    variantLabel: formatVariantOptionsLabel(item.variantOptions || {}) || '',
    variantOptions: item.variantOptions || null,
    allowReturn: product?.allowReturn !== false,
    allowReplacement: product?.allowReplacement !== false,
    inStock: product?.inStock !== false,
    stockQuantity: lineStock(product, item),
  };
}

function normalizeRequestedItems(order, rawItems) {
  const lines = resolveOrderLineItems(order);
  const requested = Array.isArray(rawItems) && rawItems.length
    ? rawItems
    : lines.map((_, index) => ({ itemIndex: index, quantity: lineQuantity(lines[index]) }));

  return requested.map((entry) => {
    const itemIndex = Number(entry.itemIndex ?? entry.index ?? 0);
    const quantity = Math.max(1, Number(entry.quantity || 1));
    return buildReturnLineFromOrder(order, itemIndex, quantity);
  }).filter(Boolean);
}

function orderItemSubtotal(order = {}) {
  return money(resolveOrderLineItems(order).reduce((sum, item) => (
    sum + linePrice(item) * lineQuantity(item)
  ), 0));
}

function orderDiscountTotal(order = {}) {
  const coupon = Number(
    order?.coupon?.discountAmount
    ?? order?.coupon?.discount
    ?? 0,
  );
  const wallet = Number(order?.walletDiscount || 0);
  const manual = Number(order?.manualDiscount?.amount || 0);
  return money(Math.max(0, coupon) + Math.max(0, wallet) + Math.max(0, manual));
}

export function calculateReturnRefund(order, items = []) {
  const productAmount = money(items.reduce((sum, item) => (
    sum + Number(item.price || 0) * Number(item.quantity || 0)
  ), 0));
  const subtotal = orderItemSubtotal(order);
  const discountTotal = orderDiscountTotal(order);
  const share = subtotal > 0 ? productAmount / subtotal : 0;
  const discountAmount = money(discountTotal * share);
  const nonRefundableAmount = 0;
  const adjustmentAmount = 0;
  const finalAmount = money(Math.max(0, productAmount - discountAmount - nonRefundableAmount + adjustmentAmount));
  return {
    productAmount,
    discountAmount,
    nonRefundableAmount,
    adjustmentAmount,
    finalAmount,
    currency: 'AED',
  };
}

export async function allocateReturnNumber(storeId) {
  const counter = await ReturnCounter.findOneAndUpdate(
    { storeId: String(storeId) },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  const seq = Math.max(1, Number(counter?.seq || 1));
  return {
    seq,
    returnNumber: `RET-1920-${String(seq).padStart(6, '0')}`,
  };
}

function pickupFromOrder(order = {}, override = {}) {
  const shipping = order.shippingAddress || {};
  const addressDoc = order.addressId && typeof order.addressId === 'object' ? order.addressId : {};
  const src = { ...addressDoc, ...shipping, ...override };
  return {
    name: src.name || order.guestName || '',
    phone: src.phone || order.guestPhone || '',
    email: src.email || order.guestEmail || '',
    street: src.street || src.address || '',
    city: src.city || '',
    state: src.state || '',
    district: src.district || '',
    zip: src.zip || src.postalCode || '',
    country: src.country || 'United Arab Emirates',
    instructions: src.instructions || '',
  };
}

function customerFromOrder(order = {}) {
  const shipping = order.shippingAddress || {};
  return {
    name: shipping.name || order.guestName || '',
    email: shipping.email || order.guestEmail || '',
    phone: shipping.phone || order.guestPhone || '',
  };
}

export async function loadOrderForReturn(orderId) {
  return Order.findById(orderId)
    .populate({ path: 'orderItems.productId', model: 'Product' })
    .populate('addressId')
    .exec();
}

export async function evaluateReturnEligibility(order, {
  type = 'RETURN',
  items = [],
  skipDuplicateCheck = false,
} = {}) {
  const reasons = [];
  const kind = String(type || 'RETURN').toUpperCase() === 'REPLACEMENT' ? 'REPLACEMENT' : 'RETURN';
  const deliveredAt = getOrderDeliveredAt(order);
  const windowDays = kind === 'REPLACEMENT' ? REPLACEMENT_WINDOW_DAYS : RETURN_WINDOW_DAYS;
  const deadline = deliveredAt ? addDays(deliveredAt, windowDays) : null;

  if (!isOrderDelivered(order)) {
    reasons.push('This order has not been delivered yet.');
  }

  if (deliveredAt && deadline && Date.now() > deadline.getTime()) {
    reasons.push(
      kind === 'REPLACEMENT'
        ? `Replacement period expired on ${formatReturnLongDate(deadline)}.`
        : `Return period expired on ${formatReturnLongDate(deadline)}.`,
    );
  }

  if (!items.length) {
    reasons.push('Select at least one product.');
  }

  const lines = resolveOrderLineItems(order);
  for (const item of items) {
    const ordered = lines[item.itemIndex];
    if (!ordered) {
      reasons.push(`Product line ${item.itemIndex + 1} was not found on this order.`);
      continue;
    }
    const product = getOrderLineProduct(ordered);
    const name = item.productName || getOrderLineItemDisplayName(ordered, product);
    if (kind === 'RETURN' && product?.allowReturn === false) {
      reasons.push(`${name} is marked non-returnable.`);
    }
    if (kind === 'REPLACEMENT' && product?.allowReplacement === false) {
      reasons.push(`${name} is not eligible for replacement.`);
    }
    const orderedQty = lineQuantity(ordered);
    if (!Number.isFinite(Number(item.quantity)) || item.quantity < 1) {
      reasons.push(`Enter a valid quantity for ${name}.`);
    } else if (item.quantity > orderedQty) {
      reasons.push(`Quantity for ${name} cannot exceed ${orderedQty}.`);
    }
    if (kind === 'REPLACEMENT') {
      const stock = lineStock(product, ordered);
      const inStock = product?.inStock !== false && stock >= Number(item.quantity || 1);
      if (!inStock) {
        reasons.push(`Replacement stock is not available for ${name}.`);
      }
    }
  }

  if (!skipDuplicateCheck && items.length) {
    const existing = await ReturnRequest.find({
      orderId: String(order._id),
      status: { $in: [...OPEN_CASE_STATUSES] },
    }).select('items returnNumber status').lean();

    for (const prior of existing) {
      const overlap = (prior.items || []).some((priorItem) => (
        items.some((item) => Number(item.itemIndex) === Number(priorItem.itemIndex))
      ));
      if (overlap) {
        reasons.push(`A previous return already exists (${prior.returnNumber}).`);
        break;
      }
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    reason: reasons[0] || '',
    deliveredAt,
    deadline,
    windowDays,
    kind,
  };
}

function pushHistory(doc, status, note = '', actor = {}) {
  const entry = {
    status,
    label: getReturnStatusLabel(status, doc.type),
    note: String(note || ''),
    at: new Date(),
    actorUid: actor.uid || actor.userId || null,
    actorName: actor.name || actor.email || 'System',
  };
  doc.history = Array.isArray(doc.history) ? doc.history : [];
  doc.history.push(entry);
  doc.status = status;
}

function applyRefundSnapshot(doc, order) {
  const calc = calculateReturnRefund(order, doc.items || []);
  doc.refund = {
    ...(typeof doc.refund?.toObject === 'function' ? doc.refund.toObject() : (doc.refund || {})),
    ...calc,
    method: doc.refundMethod || 'ORIGINAL',
    currency: 'AED',
  };
  return calc;
}

export async function syncOrderReturnRow(order, doc) {
  if (!order) return;
  order.returns = Array.isArray(order.returns) ? order.returns : [];
  const hasIndex = doc.orderReturnIndex != null && String(doc.orderReturnIndex) !== '';
  const index = hasIndex
    ? Number(doc.orderReturnIndex)
    : order.returns.findIndex((row) => String(row.returnRequestId || '') === String(doc._id));
  const payload = {
    itemIndex: Number(doc.items?.[0]?.itemIndex || 0),
    reason: doc.reason || '',
    type: String(doc.type || 'RETURN').toUpperCase() === 'REPLACEMENT' ? 'REPLACEMENT' : 'RETURN',
    status: coarseOrderReturnStatus(doc.status),
    description: doc.description || '',
    images: doc.images || [],
    requestedAt: doc.createdAt || new Date(),
    approvedAt: doc.history?.find((row) => row.status === 'APPROVED')?.at || undefined,
    rejectionReason: doc.rejectionReason || doc.eligibilityReason || '',
    sellerNotes: doc.sellerNotes || '',
    followUpOrderId: doc.followUpOrderId || null,
    followUpOrderNumber: doc.followUpOrderNumber || '',
    returnPickupOrderId: doc.returnPickupOrderId || null,
    returnPickupOrderNumber: doc.returnPickupOrderNumber || '',
    returnRequestId: doc._id,
    returnNumber: doc.returnNumber,
    workflowStatus: doc.status,
    quantity: Number(doc.items?.[0]?.quantity || 1),
    sku: doc.items?.[0]?.sku || '',
    productName: doc.items?.[0]?.productName || '',
    refundMethod: doc.refundMethod || 'ORIGINAL',
    eligibilityReason: doc.eligibilityReason || '',
  };

  if (index >= 0 && order.returns[index]) {
    const current = typeof order.returns[index].toObject === 'function'
      ? order.returns[index].toObject()
      : { ...order.returns[index] };
    Object.assign(current, payload);
    order.returns[index] = current;
    doc.orderReturnIndex = index;
  } else {
    order.returns.push(payload);
    doc.orderReturnIndex = order.returns.length - 1;
  }
  if (typeof order.markModified === 'function') order.markModified('returns');
}

async function persistLinkedOrder(order, doc) {
  await syncOrderReturnRow(order, doc);
  if (order?._id) {
    const $set = { returns: toPlainReturns(order) };
    if (typeof order.isModified === 'function' ? order.isModified('status') : order?.status) {
      $set.status = order.status;
    } else if (order?.status) {
      $set.status = order.status;
    }
    if (order?.paymentStatus) {
      $set.paymentStatus = order.paymentStatus;
    }
    await patchOrder(order._id, $set);
  }
  await doc.save();
}

async function notifyReturnCustomer(doc, order, intro) {
  try {
    const { sendReturnRequestCustomerEmail } = await import('@/lib/email');
    const email = doc.customerEmail || order?.shippingAddress?.email || order?.guestEmail;
    if (!email) return;
    await sendReturnRequestCustomerEmail({
      email,
      name: doc.customerName || order?.shippingAddress?.name || order?.guestName || 'there',
      order,
      returnNumber: doc.returnNumber,
      title: getReturnStatusLabel(doc.status, doc.type),
      intro,
    });
  } catch (error) {
    console.error('[return-workflow] customer email failed', error?.message || error);
  }
}

export async function createReturnCase({
  order,
  userId,
  type = 'RETURN',
  reason,
  description = '',
  images = [],
  videos = [],
  items: rawItems,
  pickupAddress,
  refundMethod = 'ORIGINAL',
  fastProcess = false,
  productRating = null,
  deliveryRating = null,
  reviewText = null,
  source = 'customer',
  skipEligibility = false,
  actor = {},
  orderReturnIndex = null,
} = {}) {
  const kind = String(type || 'RETURN').toUpperCase() === 'REPLACEMENT' ? 'REPLACEMENT' : 'RETURN';
  const items = normalizeRequestedItems(order, rawItems);
  const eligibility = skipEligibility
    ? { eligible: true, reasons: [], reason: '', deliveredAt: getOrderDeliveredAt(order), deadline: null, kind }
    : await evaluateReturnEligibility(order, { type: kind, items });

  if (!skipEligibility && !eligibility.eligible && /previous return already exists/i.test(eligibility.reason || '')) {
    throw Object.assign(new Error(eligibility.reason), { statusCode: 409 });
  }

  const { seq, returnNumber } = await allocateReturnNumber(order.storeId);
  const customer = customerFromOrder(order);
  const deliveredAt = eligibility.deliveredAt || getOrderDeliveredAt(order);
  const refundCalc = calculateReturnRefund(order, items);
  const initialStatus = eligibility.eligible ? RETURN_STATUSES.UNDER_REVIEW : RETURN_STATUSES.NOT_ELIGIBLE;
  const note = eligibility.eligible
    ? 'Eligibility checks passed. Request is under review.'
    : eligibility.reason;

  const doc = new ReturnRequest({
    storeId: String(order.storeId),
    returnNumber,
    seq,
    orderId: String(order._id),
    userId: String(userId || order.userId || ''),
    type: kind,
    reason: String(reason || '').trim(),
    description: String(description || ''),
    images: images.filter(Boolean),
    videos: videos.filter(Boolean),
    fastProcess: Boolean(fastProcess),
    productRating,
    deliveryRating,
    reviewText,
    items,
    pickupAddress: pickupFromOrder(order, pickupAddress || {}),
    refundMethod: String(refundMethod || 'ORIGINAL').toUpperCase() === 'WALLET' ? 'WALLET' : 'ORIGINAL',
    paymentMethod: order.paymentMethod || '',
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    deliveredAt,
    returnDeadline: deliveredAt ? addDays(deliveredAt, RETURN_WINDOW_DAYS) : null,
    replacementDeadline: deliveredAt ? addDays(deliveredAt, REPLACEMENT_WINDOW_DAYS) : null,
    eligibilityReason: eligibility.eligible ? '' : eligibility.reason,
    refund: {
      ...refundCalc,
      method: String(refundMethod || 'ORIGINAL').toUpperCase() === 'WALLET' ? 'WALLET' : 'ORIGINAL',
    },
    sellerNotes: source === 'store' ? 'Started by store staff' : '',
    orderReturnIndex: Number.isFinite(Number(orderReturnIndex)) ? Number(orderReturnIndex) : undefined,
  });

  pushHistory(doc, RETURN_STATUSES.SUBMITTED, 'Customer submitted the request.', actor);
  pushHistory(doc, initialStatus, note, { name: 'System' });
  await persistLinkedOrder(order, doc);

  const intro = eligibility.eligible
    ? `Your ${kind === 'REPLACEMENT' ? 'replacement' : 'return'} request ${returnNumber} has been received and is under review.`
    : `Your request ${returnNumber} is not eligible. ${eligibility.reason}`;
  await notifyReturnCustomer(doc, order, intro);

  return {
    request: doc,
    eligible: eligibility.eligible,
    eligibility,
  };
}

function followUpItemsFromCase(doc) {
  return (doc.items || []).map((item) => ({
    productId: item.productId || undefined,
    name: item.productName || '',
    price: Number(item.price || 0),
    quantity: Math.max(1, Number(item.quantity || 1)),
    variantOptions: item.variantOptions || null,
  }));
}

export async function ensureReturnCaseFromOrder(order, returnIndex, actor = {}) {
  const row = order?.returns?.[returnIndex];
  if (!row) {
    throw Object.assign(new Error('Return request not found'), { statusCode: 404 });
  }
  if (row.returnRequestId) {
    const existing = await ReturnRequest.findById(row.returnRequestId).exec();
    if (existing) return existing;
  }
  if (row.returnNumber) {
    const existing = await ReturnRequest.findOne({ returnNumber: row.returnNumber }).exec();
    if (existing) return existing;
  }
  const created = await createReturnCase({
    order,
    userId: order.userId,
    type: row.type || 'RETURN',
    reason: row.reason || 'Return request',
    description: row.description || '',
    images: row.images || [],
    items: [{ itemIndex: Number(row.itemIndex || 0), quantity: Number(row.quantity || 1) }],
    refundMethod: row.refundMethod || 'ORIGINAL',
    source: 'legacy',
    skipEligibility: true,
    actor,
    orderReturnIndex: returnIndex,
  });
  return created.request;
}

export async function applyReturnAction(doc, {
  action,
  actor = {},
  rejectionReason = '',
  infoMessage = '',
  qc = {},
  warehouse = {},
  riderName = '',
  riderPhone = '',
  scannedCode = '',
} = {}) {
  const key = String(action || '').toUpperCase();
  const order = await loadOrderForReturn(doc.orderId);
  if (!order) {
    const error = new Error('Order not found');
    error.statusCode = 404;
    throw error;
  }

  if (key === 'REQUEST_INFO' || key === 'REQUEST_MORE_INFORMATION') {
    if (!NEW_REQUEST_STATUSES.has(doc.status) && doc.status !== RETURN_STATUSES.UNDER_REVIEW) {
      throw Object.assign(new Error('This request is not waiting for review.'), { statusCode: 400 });
    }
    doc.infoRequestedMessage = String(infoMessage || rejectionReason || 'Please upload additional photos or details.').trim();
    pushHistory(doc, RETURN_STATUSES.INFO_REQUIRED, doc.infoRequestedMessage, actor);
    await persistLinkedOrder(order, doc);
    await notifyReturnCustomer(
      doc,
      order,
      `We need more information for ${doc.returnNumber}. ${doc.infoRequestedMessage}`,
    );
    return { request: doc, message: 'Customer was asked for more information.' };
  }

  if (key === 'REJECT') {
    const reason = String(rejectionReason || '').trim();
    if (!reason) throw Object.assign(new Error('Rejection reason is required'), { statusCode: 400 });
    doc.rejectionReason = reason;
    pushHistory(doc, RETURN_STATUSES.REJECTED, reason, actor);
    await persistLinkedOrder(order, doc);
    await notifyReturnCustomer(doc, order, `Your request ${doc.returnNumber} was rejected. ${reason}`);
    return { request: doc, message: 'Return request rejected.' };
  }

  if (key === 'APPROVE') {
    if (doc.status === RETURN_STATUSES.NOT_ELIGIBLE) {
      throw Object.assign(new Error(doc.eligibilityReason || 'This request is not eligible.'), { statusCode: 400 });
    }
    if (doc.returnPickupOrderId && STATUS_RANK[doc.status] >= STATUS_RANK.APPROVED) {
      if (order?.waslahReturn?.trackingNumber) {
        return { request: doc, skipped: true, message: `Already approved. Pickup order #${doc.returnPickupOrderNumber} exists.` };
      }
    }
    const isRetry = Boolean(doc.returnPickupOrderId) && STATUS_RANK[doc.status] >= STATUS_RANK.APPROVED;
    const { approveReturnRequestAndCreateFollowUp } = await import('@/lib/storeReturnFollowUp');
    const result = await approveReturnRequestAndCreateFollowUp({
      order,
      returnIndex: Number(doc.orderReturnIndex || 0),
      actor,
      returnCase: doc,
    });
    if (isRetry) {
      pushHistory(doc, doc.status, result.message || 'EMX reverse pickup updated.', actor);
      await persistLinkedOrder(order, doc);
      return { request: doc, message: result.message, followUp: result };
    }
    pushHistory(doc, RETURN_STATUSES.APPROVED, result.message, actor);
    doc.returnPickupOrderId = result.pickupOrder?._id || result.followUpOrder?._id || doc.returnPickupOrderId;
    doc.returnPickupOrderNumber = result.pickupOrder?.shortOrderNumber
      || result.followUpOrder?.shortOrderNumber
      || doc.returnPickupOrderNumber;
    if (String(doc.type).toUpperCase() === 'RETURN') {
      doc.followUpOrderId = doc.returnPickupOrderId;
      doc.followUpOrderNumber = String(doc.returnPickupOrderNumber || '');
    }
    const pickupDate = formatReturnLongDate(addDays(new Date(), 1));
    doc.pickup = {
      ...(typeof doc.pickup?.toObject === 'function' ? doc.pickup.toObject() : (doc.pickup || {})),
      scheduledAt: new Date(),
      scheduledFor: pickupDate,
      instructions: doc.pickupAddress?.instructions || '',
    };
    pushHistory(doc, RETURN_STATUSES.PICKUP_SCHEDULED, `Pickup scheduled for ${pickupDate}.`, actor);
    await persistLinkedOrder(order, doc);
    await notifyReturnCustomer(
      doc,
      order,
      `Your ${String(doc.type).toLowerCase()} request ${doc.returnNumber} was approved. Pickup is scheduled for ${pickupDate}.`,
    );
    return { request: doc, message: result.message, followUp: result };
  }

  if (key === 'ASSIGN_RIDER') {
    doc.pickup = {
      ...(typeof doc.pickup?.toObject === 'function' ? doc.pickup.toObject() : (doc.pickup || {})),
      riderName: String(riderName || '').trim(),
      riderPhone: String(riderPhone || '').trim(),
    };
    pushHistory(doc, RETURN_STATUSES.RIDER_ASSIGNED, doc.pickup.riderName ? `Rider: ${doc.pickup.riderName}` : 'Rider assigned.', actor);
    await persistLinkedOrder(order, doc);
    return { request: doc, message: 'Rider assigned.' };
  }

  if (key === 'RECEIVE' || key === 'WAREHOUSE_RECEIVE') {
    return recordWarehouseReceive(doc, {
      order,
      actor,
      scannedCode,
      notes: warehouse.notes || '',
      packageCondition: warehouse.packageCondition || '',
      quantityReceived: warehouse.quantityReceived,
      warehouseName: warehouse.warehouseName || 'Warehouse',
    });
  }

  if (key === 'QC_PASS' || key === 'QC_PASSED') {
    return completeQualityCheck(doc, { order, actor, passed: true, qc });
  }
  if (key === 'QC_FAIL' || key === 'QC_FAILED') {
    return completeQualityCheck(doc, { order, actor, passed: false, qc });
  }

  if (key === 'PROCESS_REFUND') {
    return processReturnRefund(doc, { order, actor });
  }

  throw Object.assign(new Error('Invalid action'), { statusCode: 400 });
}

export async function addReturnEvidence(doc, { images = [], videos = [], description = '', actor = {} } = {}) {
  if (doc.status !== RETURN_STATUSES.INFO_REQUIRED) {
    throw Object.assign(new Error('Additional evidence can only be added when more information is requested.'), { statusCode: 400 });
  }
  doc.additionalImages = [...(doc.additionalImages || []), ...images.filter(Boolean)];
  doc.additionalVideos = [...(doc.additionalVideos || []), ...videos.filter(Boolean)];
  if (description) {
    doc.description = [doc.description, description].filter(Boolean).join('\n\n');
  }
  const order = await loadOrderForReturn(doc.orderId);
  pushHistory(doc, RETURN_STATUSES.UNDER_REVIEW, 'Customer uploaded additional evidence.', actor);
  await persistLinkedOrder(order, doc);
  return { request: doc, message: 'Additional information received. Request is under review.' };
}

export async function recordWarehouseReceive(doc, {
  order: existingOrder = null,
  actor = {},
  scannedCode = '',
  notes = '',
  packageCondition = '',
  quantityReceived,
  warehouseName = 'Warehouse',
} = {}) {
  const order = existingOrder || await loadOrderForReturn(doc.orderId);
  if (STATUS_RANK[doc.status] >= STATUS_RANK.RECEIVED && doc.status !== RETURN_STATUSES.IN_TRANSIT) {
    return { request: doc, skipped: true, message: 'Already received at warehouse.' };
  }
  const qty = Number.isFinite(Number(quantityReceived))
    ? Number(quantityReceived)
    : (doc.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  doc.warehouse = {
    ...(typeof doc.warehouse?.toObject === 'function' ? doc.warehouse.toObject() : (doc.warehouse || {})),
    receivedAt: new Date(),
    warehouseName,
    staffUid: actor.uid || actor.userId || '',
    staffName: actor.name || actor.email || 'Warehouse staff',
    quantityReceived: qty,
    packageCondition: packageCondition || 'Received',
    notes,
  };
  if (scannedCode) {
    doc.pickup = {
      ...(typeof doc.pickup?.toObject === 'function' ? doc.pickup.toObject() : (doc.pickup || {})),
      scannedCode,
    };
  }
  pushHistory(doc, RETURN_STATUSES.RECEIVED, `Scanned ${doc.returnNumber} at ${warehouseName}.`, actor);
  pushHistory(doc, RETURN_STATUSES.QC_PENDING, 'Waiting for quality check.', { name: 'System' });
  await persistLinkedOrder(order, doc);
  await notifyReturnCustomer(doc, order, `${doc.returnNumber} was received at the warehouse and is waiting for quality check.`);
  return { request: doc, message: 'Received at warehouse. Quality check pending.' };
}

async function completeQualityCheck(doc, { order, actor = {}, passed, qc = {} } = {}) {
  if (!['RECEIVED', 'QC_PENDING'].includes(doc.status)) {
    throw Object.assign(new Error('Quality check is only available after warehouse receive.'), { statusCode: 400 });
  }
  doc.qc = {
    ...(typeof doc.qc?.toObject === 'function' ? doc.qc.toObject() : (doc.qc || {})),
    skuMatch: qc.skuMatch ?? true,
    serialMatch: qc.serialMatch ?? true,
    quantityMatch: qc.quantityMatch ?? true,
    sameItem: qc.sameItem ?? true,
    condition: qc.condition || (passed ? 'UNOPENED' : 'DAMAGED'),
    originalBox: qc.originalBox ?? null,
    accessories: qc.accessories ?? null,
    manual: qc.manual ?? null,
    warrantyCard: qc.warrantyCard ?? null,
    promotionalItems: qc.promotionalItems ?? null,
    notes: qc.notes || '',
    photos: qc.photos || [],
    checkedAt: new Date(),
    checkedByUid: actor.uid || '',
    checkedByName: actor.name || actor.email || 'Warehouse staff',
  };

  if (!passed) {
    pushHistory(doc, RETURN_STATUSES.QC_FAILED, doc.qc.notes || 'Quality check failed.', actor);
    await persistLinkedOrder(order, doc);
    await notifyReturnCustomer(doc, order, `Quality check failed for ${doc.returnNumber}. ${doc.qc.notes || ''}`.trim());
    return { request: doc, message: 'Quality check failed.' };
  }

  pushHistory(doc, RETURN_STATUSES.QC_PASSED, doc.qc.notes || 'Quality check passed.', actor);

  if (!doc.stockRestockedAt) {
    try {
      const restockSource = {
        orderItems: (doc.items || []).map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          variantOptions: item.variantOptions,
          name: item.productName,
        })),
      };
      const stockRestock = await restockOrderInventory(restockSource);
      if (stockRestock?.restocked) {
        doc.stockRestockedAt = new Date();
        doc.stockRestock = {
          productCount: stockRestock.productCount || 0,
          unitCount: stockRestock.unitCount || 0,
          lines: stockRestock.lines || [],
        };
      }
    } catch (error) {
      console.error('[return-workflow] restock after QC failed', error?.message || error);
    }
  }

  const kind = String(doc.type || 'RETURN').toUpperCase();
  if (kind === 'REPLACEMENT') {
    const { createReplacementAfterQc } = await import('@/lib/storeReturnFollowUp');
    const replacement = await createReplacementAfterQc({
      sourceOrder: order,
      actor,
      returnCase: doc,
    });
    doc.followUpOrderId = replacement.followUp?._id || doc.followUpOrderId;
    doc.followUpOrderNumber = String(replacement.followUp?.shortOrderNumber || doc.followUpOrderNumber || '');
    pushHistory(doc, RETURN_STATUSES.REPLACEMENT_SHIPPED, replacement.message, actor);
    pushHistory(doc, RETURN_STATUSES.COMPLETED, 'Replacement shipment created.', { name: 'System' });
    await persistLinkedOrder(order, doc);
    await notifyReturnCustomer(
      doc,
      order,
      `Quality check passed for ${doc.returnNumber}. Your replacement is being prepared${doc.followUpOrderNumber ? ` (order #${doc.followUpOrderNumber})` : ''}.`,
    );
    return { request: doc, message: replacement.message };
  }

  applyRefundSnapshot(doc, order);
  pushHistory(doc, RETURN_STATUSES.REFUND_APPROVED, `Refundable amount AED ${doc.refund.finalAmount}.`, actor);
  await persistLinkedOrder(order, doc);
  await notifyReturnCustomer(
    doc,
    order,
    `Quality check passed for ${doc.returnNumber}. Refund of AED ${Number(doc.refund.finalAmount).toFixed(0)} is approved and waiting to be processed.`,
  );
  return { request: doc, message: 'QC passed. Refund is ready to process.' };
}

async function processReturnRefund(doc, { order, actor = {} } = {}) {
  if (!['QC_PASSED', 'REFUND_APPROVED', 'REFUND_INITIATED'].includes(doc.status)) {
    throw Object.assign(new Error('Refund can be processed after QC passes.'), { statusCode: 400 });
  }
  const calc = applyRefundSnapshot(doc, order);
  const amount = calc.finalAmount;
  const provider = String(order.paymentMethod || '').toUpperCase();
  pushHistory(doc, RETURN_STATUSES.REFUND_INITIATED, `Processing AED ${amount} refund.`, actor);

  let executed = false;
  let refundId = '';
  let errorMessage = '';

  if (['STRIPE', 'CARD'].includes(provider) && amount > 0) {
    try {
      const { createRefundAuthorization } = await import('@/lib/paymentRefundAuth');
      const result = await createRefundAuthorization({
        storeId: String(order.storeId),
        orderId: String(order._id),
        amount,
        reason: `Return ${doc.returnNumber}`,
        requestedByUserId: actor.uid || actor.userId || 'store',
        requestedByEmail: actor.email || '',
      });
      executed = Boolean(result?.executed);
      refundId = result?.refundId || result?.authorization?.providerRefundId || '';
      doc.refund.refundAuthId = String(result?.authorization?._id || '');
      doc.refund.providerRefundId = refundId;
      doc.refund.provider = 'STRIPE';
    } catch (error) {
      errorMessage = error?.message || 'Gateway refund failed';
      doc.refund.error = errorMessage;
    }
  } else {
    executed = true;
    doc.refund.provider = provider || 'MANUAL';
  }

  if (!executed && errorMessage) {
    await persistLinkedOrder(order, doc);
    throw Object.assign(new Error(errorMessage), { statusCode: 400 });
  }

  const methodLabel = doc.refundMethod === 'WALLET' ? 'your wallet' : 'your original payment method';
  doc.refund.completedAt = new Date();
  doc.refund.initiatedAt = doc.refund.initiatedAt || new Date();
  doc.refund.customerMessage = `AED ${Number(amount).toFixed(0)} has been refunded to ${methodLabel}.`;
  pushHistory(doc, RETURN_STATUSES.REFUND_COMPLETED, doc.refund.customerMessage, actor);
  pushHistory(doc, RETURN_STATUSES.COMPLETED, 'Return completed.', { name: 'System' });

  if (String(doc.type || 'RETURN').toUpperCase() === 'RETURN') {
    order.status = 'RETURNED';
    const isFullRefund = amount >= Number(order.total || 0) - 0.01;
    if (isFullRefund) {
      order.paymentStatus = 'REFUNDED';
    }
  }

  await persistLinkedOrder(order, doc);
  await notifyReturnCustomer(doc, order, doc.refund.customerMessage);
  return { request: doc, message: doc.refund.customerMessage };
}

const PICKUP_STATUS_FROM_ORDER = {
  PICKUP_REQUESTED: 'PICKUP_SCHEDULED',
  WAITING_FOR_PICKUP: 'PICKUP_SCHEDULED',
  OUT_FOR_DELIVERY: 'PICKUP_IN_PROGRESS',
  PICKED_UP: 'ITEM_PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  SHIPPED: 'IN_TRANSIT',
  WAREHOUSE_RECEIVED: 'IN_TRANSIT',
};

const RETURN_SHIPMENT_STATUS_FROM_ORDER = {
  ...PICKUP_STATUS_FROM_ORDER,
  DELIVERED: 'IN_TRANSIT',
};

function resolveReturnShipmentOrderStatus(order = {}, liveWaslah = null) {
  const fromLive = String(
    liveWaslah?.waslah?.appStatus
    || liveWaslah?.appStatus
    || order?.waslahReturn?.appStatus
    || '',
  ).trim().toUpperCase();
  if (fromLive) return fromLive;
  return String(order?.status || '').toUpperCase();
}

async function findOpenReturnCaseForOrder(order = {}) {
  if (!order?._id) return null;
  return ReturnRequest.findOne({
    $or: [
      { returnPickupOrderId: order._id },
      { followUpOrderId: order._id },
      { orderId: String(order._id) },
    ],
    status: { $nin: ['COMPLETED', 'REJECTED', 'NOT_ELIGIBLE', 'QC_FAILED'] },
  }).sort({ createdAt: -1 }).exec();
}

export async function syncReturnPickupFromFollowUpOrder(order) {
  if (!order?._id) return null;
  const doc = await ReturnRequest.findOne({
    $or: [
      { returnPickupOrderId: order._id },
      { followUpOrderId: order._id },
    ],
  }).exec();
  if (!doc) return null;
  if (!OPEN_CASE_STATUSES.has(doc.status) && doc.status !== RETURN_STATUSES.APPROVED) return doc;

  const orderStatus = String(order.status || '').toUpperCase();
  const mapped = PICKUP_STATUS_FROM_ORDER[orderStatus];
  if (!mapped) return doc;
  if ((STATUS_RANK[mapped] || 0) <= (STATUS_RANK[doc.status] || 0)) return doc;

  const riderHint = String(order.waslah?.lastLocation || order.waslahReturn?.lastLocation || '').trim();
  if (riderHint && !doc.pickup?.riderName) {
    doc.pickup = {
      ...(typeof doc.pickup?.toObject === 'function' ? doc.pickup.toObject() : (doc.pickup || {})),
      riderName: riderHint,
    };
    if (mapped === 'PICKUP_IN_PROGRESS' || mapped === 'ITEM_PICKED_UP') {
      if ((STATUS_RANK.RIDER_ASSIGNED || 0) > (STATUS_RANK[doc.status] || 0)) {
        pushHistory(doc, RETURN_STATUSES.RIDER_ASSIGNED, `Rider: ${riderHint}`, { name: 'Courier' });
      }
    }
  }
  pushHistory(doc, mapped, order.waslah?.currentStatus || order.waslahReturn?.currentStatus || orderStatus, { name: 'Courier' });
  const source = await loadOrderForReturn(doc.orderId);
  await persistLinkedOrder(source || order, doc);
  return doc;
}

/**
 * Sync return pickup progress from the reverse EMX shipment (waslahReturn) on the original sale order.
 */
export async function syncReturnPickupFromWaslahReturn(order = {}, liveWaslah = null) {
  if (!order?._id || !String(order?.waslahReturn?.orderId || order?.waslahReturn?.trackingNumber || '').trim()) {
    return null;
  }

  const doc = await findOpenReturnCaseForOrder(order);
  if (!doc) return null;
  if (!OPEN_CASE_STATUSES.has(doc.status) && doc.status !== RETURN_STATUSES.APPROVED) return doc;

  let normalized = liveWaslah;
  if (!normalized) {
    try {
      const { getReturnEmxTrackingNumber, fetchNormalizedWaslahTracking } = await import('@/lib/waslahTracking');
      const awb = getReturnEmxTrackingNumber(order) || String(order?.waslahReturn?.trackingNumber || '').trim();
      if (awb) normalized = await fetchNormalizedWaslahTracking(awb);
    } catch (error) {
      console.warn('[return-workflow] return live tracking fetch failed', error?.message || error);
    }
  }

  const shipmentStatus = resolveReturnShipmentOrderStatus(order, normalized);
  const mapped = RETURN_SHIPMENT_STATUS_FROM_ORDER[shipmentStatus];
  if (!mapped) return doc;
  if ((STATUS_RANK[mapped] || 0) <= (STATUS_RANK[doc.status] || 0)) return doc;

  const statusMessage = normalized?.waslah?.currentStatus
    || order?.waslahReturn?.currentStatus
    || shipmentStatus;
  const riderHint = String(normalized?.waslah?.lastLocation || order?.waslahReturn?.lastLocation || '').trim();
  if (riderHint && !doc.pickup?.riderName) {
    doc.pickup = {
      ...(typeof doc.pickup?.toObject === 'function' ? doc.pickup.toObject() : (doc.pickup || {})),
      riderName: riderHint,
    };
    if ((STATUS_RANK.RIDER_ASSIGNED || 0) > (STATUS_RANK[doc.status] || 0)) {
      pushHistory(doc, RETURN_STATUSES.RIDER_ASSIGNED, `Rider: ${riderHint}`, { name: 'Courier' });
    }
  }

  pushHistory(doc, mapped, statusMessage, { name: 'EMX Return' });

  const source = await loadOrderForReturn(doc.orderId);
  const linkedOrder = source || order;
  if (linkedOrder && typeof linkedOrder === 'object') {
    const nextOrderStatus = ['PICKUP_REQUESTED', 'WAITING_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'SHIPPED', 'OUT_FOR_DELIVERY', 'WAREHOUSE_RECEIVED']
      .includes(shipmentStatus)
      ? shipmentStatus
      : linkedOrder.status;
    if (nextOrderStatus && String(linkedOrder.status || '').toUpperCase() !== String(nextOrderStatus).toUpperCase()) {
      linkedOrder.status = nextOrderStatus;
      if (typeof linkedOrder.markModified === 'function') linkedOrder.markModified('status');
    }
  }

  await persistLinkedOrder(linkedOrder, doc);
  return doc;
}

export async function findReturnCaseFromScan({ storeId, q = '', order = null } = {}) {
  const raw = String(q || '').trim().toUpperCase();
  const retMatch = raw.match(/RET-1920-\d+/);
  if (retMatch) {
    const byNumber = await ReturnRequest.findOne({
      storeId: String(storeId),
      returnNumber: retMatch[0],
    }).exec();
    if (byNumber) return byNumber;
  }
  if (order?._id) {
    return ReturnRequest.findOne({
      storeId: String(storeId),
      $or: [
        { orderId: String(order._id) },
        { returnPickupOrderId: order._id },
        { followUpOrderId: order._id },
      ],
      status: { $nin: ['COMPLETED', 'REJECTED', 'NOT_ELIGIBLE'] },
    }).sort({ createdAt: -1 }).exec();
  }
  return null;
}

export function tabForStatus(status) {
  const key = String(status || '').toUpperCase();
  if (NEW_REQUEST_STATUSES.has(key)) return 'new';
  if (PICKUP_TAB_STATUSES.has(key)) return 'pickup';
  if (WAREHOUSE_TAB_STATUSES.has(key)) return 'warehouse';
  if (REFUND_TAB_STATUSES.has(key)) return 'refund';
  return 'all';
}

export function serializeReturnCase(doc, order = null, extras = {}) {
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const type = String(plain.type || 'RETURN').toUpperCase();
  return {
    id: String(plain._id),
    returnNumber: plain.returnNumber,
    orderId: plain.orderId,
    orderNumber: order ? (getDisplayOrderNumber(order) || String(order._id).slice(-8)) : '',
    type,
    status: plain.status,
    statusLabel: getReturnStatusLabel(plain.status, type),
    tab: tabForStatus(plain.status),
    eligibilityReason: plain.eligibilityReason || '',
    reason: plain.reason || '',
    description: plain.description || '',
    images: plain.images || [],
    videos: plain.videos || [],
    additionalImages: plain.additionalImages || [],
    additionalVideos: plain.additionalVideos || [],
    infoRequestedMessage: plain.infoRequestedMessage || '',
    items: plain.items || [],
    pickupAddress: plain.pickupAddress || {},
    refundMethod: plain.refundMethod || 'ORIGINAL',
    paymentMethod: plain.paymentMethod || order?.paymentMethod || '',
    customerName: plain.customerName || order?.shippingAddress?.name || order?.guestName || '',
    customerEmail: plain.customerEmail || order?.shippingAddress?.email || order?.guestEmail || '',
    customerPhone: plain.customerPhone || order?.shippingAddress?.phone || order?.guestPhone || '',
    deliveredAt: plain.deliveredAt || null,
    returnDeadline: plain.returnDeadline || null,
    replacementDeadline: plain.replacementDeadline || null,
    deliveredAtLabel: formatReturnLongDate(plain.deliveredAt),
    returnDeadlineLabel: formatReturnLongDate(plain.returnDeadline),
    pickup: plain.pickup || {},
    warehouse: plain.warehouse || {},
    qc: plain.qc || {},
    refund: plain.refund || {},
    followUpOrderId: plain.followUpOrderId || null,
    followUpOrderNumber: plain.followUpOrderNumber || '',
    returnPickupOrderId: plain.returnPickupOrderId || null,
    returnPickupOrderNumber: plain.returnPickupOrderNumber || '',
    reversePickupTrackingNumber: order?.waslahReturn?.trackingNumber || '',
    reversePickupReady: Boolean(order?.waslahReturn?.trackingNumber),
    rejectionReason: plain.rejectionReason || '',
    sellerNotes: plain.sellerNotes || '',
    history: plain.history || [],
    createdAt: plain.createdAt,
    orderReturnIndex: plain.orderReturnIndex,
    previousReturns: extras.previousReturns || [],
  };
}

export async function listStoreReturnCases(storeId, { tab = 'all', limit = 200 } = {}) {
  const filter = { storeId: String(storeId) };
  const key = String(tab || 'all').toLowerCase();
  if (key === 'new') filter.status = { $in: [...NEW_REQUEST_STATUSES] };
  else if (key === 'pickup') filter.status = { $in: [...PICKUP_TAB_STATUSES] };
  else if (key === 'warehouse') filter.status = { $in: [...WAREHOUSE_TAB_STATUSES] };
  else if (key === 'refund') filter.status = { $in: [...REFUND_TAB_STATUSES] };

  const docs = await ReturnRequest.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 200, 400))
    .exec();

  const orderIds = [...new Set(docs.map((doc) => doc.orderId).filter(Boolean))];
  const orders = orderIds.length
    ? await Order.find({ _id: { $in: orderIds } })
      .populate({ path: 'orderItems.productId', model: 'Product' })
      .lean()
    : [];
  const orderById = new Map(orders.map((order) => [String(order._id), order]));

  const previous = await ReturnRequest.find({
    storeId: String(storeId),
    orderId: { $in: orderIds },
  }).select('orderId returnNumber status type createdAt reason').sort({ createdAt: -1 }).lean();

  return docs.map((doc) => {
    const order = orderById.get(String(doc.orderId));
    const previousReturns = previous
      .filter((row) => String(row.orderId) === String(doc.orderId) && String(row._id) !== String(doc._id))
      .map((row) => ({
        returnNumber: row.returnNumber,
        status: row.status,
        statusLabel: getReturnStatusLabel(row.status, row.type),
        type: row.type,
        createdAt: row.createdAt,
        reason: row.reason,
      }));
    return serializeReturnCase(doc, order, { previousReturns });
  });
}

export { followUpItemsFromCase, pickupFromOrder, OPEN_CASE_STATUSES };
