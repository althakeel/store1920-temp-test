import { getConversionPaymentMethodLabel } from '@/lib/abandonedCartRecoveryPayment';
import {
  getManualStoreOrderCreator,
  isManualStoreDashboardOrder,
} from '@/lib/storeCreateOrder';
import { isAwaitingPaymentOrder } from '@/lib/deferredOrderStatus';
import { isWaslahLabelNotPrinted } from '@/lib/waslahReceipts';
import { formatPaymentFailedFollowUpBadge } from '@/lib/paymentFailedFollowUp';
import { getAbandonedCartTotal } from '@/lib/abandonedCartUtils';
import { getOrderPickupWaitInfo } from '@/lib/storeOrderPickupWait';
import { getOrderFulfillmentBadge, getOriginalReturnRequestTag } from '@/lib/storeReturnLabels';

const TERMINAL_STATUSES = new Set(['DELIVERED', 'RTO', 'RETURN', 'RETURNED', 'CANCELLED']);

const PAYMENT_METHOD_BADGES = {
  COD: {
    label: 'COD',
    className: 'rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800',
  },
  CARD: {
    label: 'Card',
    className: 'rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-800',
  },
  TABBY: {
    label: 'Tabby',
    className: 'rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800',
  },
  TAMARA: {
    label: 'Tamara',
    className: 'rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800',
  },
  WALLET: {
    label: 'Wallet',
    className: 'rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700',
  },
};

export function normalizeStoreOrderPaymentMethod(order) {
  const raw = String(order?.paymentMethod || order?.payment_method || '').trim().toUpperCase();
  if (!raw) return 'OTHER';
  if (raw === 'COD' || raw === 'CASH_ON_DELIVERY' || raw.includes('COD')) return 'COD';
  if (raw === 'TABBY' || raw.includes('TABBY')) return 'TABBY';
  if (raw === 'TAMARA' || raw.includes('TAMARA')) return 'TAMARA';
  if (raw === 'WALLET') return 'WALLET';
  if (
    ['CARD', 'STRIPE', 'RAZORPAY', 'UPI', 'NETBANKING', 'ONLINE', 'PREPAID'].includes(raw)
    || raw.includes('CARD')
    || raw.includes('STRIPE')
  ) {
    return 'CARD';
  }
  return raw;
}

export function isStoreOrderPaid(order = {}) {
  if (isAwaitingPaymentOrder(order)) return false;

  const paymentMethod = normalizeStoreOrderPaymentMethod(order);
  const orderStatus = String(order?.status || '').trim().toUpperCase();
  const paymentStatus = String(order?.paymentStatus || '').trim().toLowerCase();

  if (paymentMethod === 'COD') {
    if (orderStatus === 'DELIVERED') return true;
    if (order?.delhivery?.payment?.is_cod_recovered) return true;
    if (order?.isPaid === true) return true;

    const delhiveryText = [
      order?.delhivery?.current_status,
      order?.delhivery?.events?.[order?.delhivery?.events?.length - 1]?.status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (delhiveryText.includes('delivered')) return true;

    return false;
  }

  if (paymentMethod && paymentMethod !== 'OTHER') {
    const explicitUnpaidStatuses = new Set(['failed', 'payment_failed', 'refunded', 'unpaid', 'pending']);
    if (explicitUnpaidStatuses.has(paymentStatus)) return false;
    if (orderStatus === 'PAYMENT_FAILED') return false;
    return true;
  }

  return !!order?.isPaid;
}

export function getOrderPaymentMethodBadge(order) {
  const method = normalizeStoreOrderPaymentMethod(order);
  const preset = PAYMENT_METHOD_BADGES[method];
  if (preset) {
    return { key: 'payment-method', ...preset };
  }
  if (method === 'OTHER') return null;
  return {
    key: 'payment-method',
    label: method,
    className: 'rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700',
  };
}

export function isTerminalDeliveryStatus(status) {
  return TERMINAL_STATUSES.has(String(status || '').toUpperCase());
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function getOrderExpectedDeliveryDate(order) {
  const raw = order?.delhivery?.expected_delivery_date;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getDeliveryBucket(order, referenceDate = new Date()) {
  if (isTerminalDeliveryStatus(order?.status)) return null;

  const expected = getOrderExpectedDeliveryDate(order);
  if (!expected) return null;

  const today = startOfDay(referenceDate);
  const tomorrow = startOfDay(referenceDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const expectedDay = startOfDay(expected);

  if (expectedDay < today) return 'delayed';
  if (expectedDay.getTime() === today.getTime()) return 'today';
  if (expectedDay.getTime() === tomorrow.getTime()) return 'tomorrow';
  return null;
}

function getOrderCustomerKey(order) {
  if (order?.userId && typeof order.userId === 'object' && order.userId._id) {
    return `user:${order.userId._id}`;
  }
  if (order?.userId && typeof order.userId === 'string') {
    return `user:${order.userId}`;
  }

  const email = String(order?.guestEmail || order?.shippingAddress?.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;

  const phone = String(order?.guestPhone || order?.shippingAddress?.phone || order?.alternatePhone || '').trim();
  if (phone) return `phone:${phone}`;

  return null;
}

function getCartCustomerKey(cart) {
  if (cart?.userId) return `user:${cart.userId}`;
  const email = String(cart?.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const phone = String(cart?.phone || '').trim();
  if (phone) return `phone:${phone}`;
  return null;
}

function totalsAreClose(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= Math.max(5, a * 0.05);
}

function cartMatchesOrder(cart, order) {
  if (cart?.linkedOrderId && String(cart.linkedOrderId) === String(order._id)) {
    return true;
  }

  const cartKey = getCartCustomerKey(cart);
  const orderKey = getOrderCustomerKey(order);
  if (!cartKey || !orderKey || cartKey !== orderKey) return false;

  const convertedAt = cart?.convertedAt ? new Date(cart.convertedAt) : null;
  const orderAt = order?.createdAt ? new Date(order.createdAt) : null;
  if (!convertedAt || !orderAt || Number.isNaN(convertedAt.getTime()) || Number.isNaN(orderAt.getTime())) {
    return false;
  }

  const diffMs = orderAt.getTime() - convertedAt.getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  if (diffMs < -oneDay || diffMs > 14 * oneDay) return false;

  const cartTotal = cart?.convertedCartTotal ?? cart?.cartTotal;
  return totalsAreClose(cartTotal, order?.total);
}

export function isDashboardAbandonedCartConversion(cart) {
  return Boolean(String(cart?.convertedByName || '').trim());
}

export function buildConversionMetaFromOrder(order = {}) {
  const staffName = String(order?.storeCreatedByName || '').trim();
  if (!staffName) return null;

  const medium = String(order?.attribution?.utmMedium || '').toLowerCase();
  const notes = String(order?.notes || '');
  const recoveredMatch = notes.match(/Recovered from abandoned checkout ([a-f0-9]+)/i);
  const isStaffRecovery = medium === 'abandoned_checkout_conversion' || recoveredMatch;
  if (!isStaffRecovery) return null;

  return {
    fromAbandonedCheckout: true,
    cartId: recoveredMatch?.[1]
      || (order.attribution?.utmCampaign ? String(order.attribution.utmCampaign) : null),
    convertedByName: staffName,
    convertedBy: order.storeCreatedByUid ? String(order.storeCreatedByUid) : null,
    convertedAt: order.createdAt || null,
    note: notes.trim() || null,
    discountType: order.manualDiscount?.type === 'percentage'
      ? 'percent'
      : (order.manualDiscount?.amount > 0 ? 'amount' : 'none'),
    discountValue: order.manualDiscount?.value ?? null,
    paymentMethod: order.paymentMethod || null,
    finalTotal: order.total ?? null,
    originalTotal: order.manualDiscount?.originalTotal ?? null,
  };
}

export function isDashboardConvertedOrder(order) {
  return Boolean(String(order?.conversion?.convertedByName || '').trim());
}

export function buildConversionMeta(cart) {
  if (!isDashboardAbandonedCartConversion(cart)) return null;

  const staffName = String(cart?.convertedByName || '').trim();

  return {
    fromAbandonedCheckout: true,
    cartId: String(cart._id),
    convertedByName: staffName || null,
    convertedBy: cart.convertedBy || null,
    convertedAt: cart.convertedAt || null,
    note: cart.conversionNote || null,
    discountType: cart.conversionDiscountType || 'none',
    discountValue: cart.conversionDiscountValue,
    paymentMethod: cart.conversionPaymentMethod || null,
    finalTotal: cart.convertedCartTotal ?? null,
    originalTotal: getAbandonedCartTotal(cart) || (cart.cartTotal ?? null),
  };
}

export function matchConvertedCartsToOrders(orders, convertedCarts) {
  const conversionByOrderId = new Map();
  const usedCartIds = new Set();

  for (const order of orders) {
    const candidates = (convertedCarts || [])
      .filter((cart) => isDashboardAbandonedCartConversion(cart) && !usedCartIds.has(String(cart._id)))
      .filter((cart) => cartMatchesOrder(cart, order))
      .sort((a, b) => {
        const aTime = new Date(a.convertedAt || 0).getTime();
        const bTime = new Date(b.convertedAt || 0).getTime();
        const orderTime = new Date(order.createdAt || 0).getTime();
        return Math.abs(orderTime - aTime) - Math.abs(orderTime - bTime);
      });

    const bestMatch = candidates[0];
    if (!bestMatch) continue;

    usedCartIds.add(String(bestMatch._id));
    conversionByOrderId.set(String(order._id), buildConversionMeta(bestMatch));
  }

  return conversionByOrderId;
}

export function attachConversionToOrders(orders, convertedCarts) {
  const conversionByOrderId = matchConvertedCartsToOrders(orders, convertedCarts);
  return orders.map((order) => {
    const conversion = conversionByOrderId.get(String(order._id))
      || buildConversionMetaFromOrder(order)
      || null;
    return conversion ? { ...order, conversion } : order;
  });
}

export function formatConversionDiscount(conversion, currency = 'AED') {
  if (!conversion) return null;
  const { discountType, discountValue } = conversion;
  if (discountType === 'amount' && discountValue != null) {
    return `${currency} ${Number(discountValue).toFixed(2)} off`;
  }
  if (discountType === 'percent' && discountValue != null) {
    return `${discountValue}% off`;
  }
  if (discountType === 'custom') {
    return 'Custom pricing';
  }
  return null;
}

export function getOrderDiscountLines(order, currency = 'AED') {
  const lines = [];

  if (order?.isCouponUsed && order?.coupon) {
    const code = order.coupon.code || 'Coupon';
    const discount = order.coupon.discount ?? order.coupon.discountAmount;
    const discountAmount = Number(order.coupon.discountAmount || 0);
    const originalTotal = Number(order.coupon.originalTotal || 0);
    let detail = discount != null ? `${code} (${discount}% off)` : code;
    if (String(code).toUpperCase() === 'PREPAID5' && discountAmount > 0) {
      detail = `${code} (${discount}% off — ${currency} ${discountAmount.toFixed(2)})`;
      if (originalTotal > 0) {
        detail += ` · was ${currency} ${originalTotal.toFixed(2)}`;
      }
    }
    lines.push({
      label: String(code).toUpperCase() === 'PREPAID5' ? 'Prepaid 5% off' : 'Coupon',
      detail,
    });
  } else if (order?.coupon?.code) {
    const code = order.coupon.code;
    const discount = order.coupon.discount ?? order.coupon.discountAmount;
    const discountAmount = Number(order.coupon.discountAmount || 0);
    let detail = discount != null ? `${code} (${discount}% off)` : code;
    if (String(code).toUpperCase() === 'PREPAID5' && discountAmount > 0) {
      detail = `${code} (${discount}% off — ${currency} ${discountAmount.toFixed(2)})`;
    }
    lines.push({
      label: String(code).toUpperCase() === 'PREPAID5' ? 'Prepaid 5% off' : 'Coupon',
      detail,
    });
  }

  if (Number(order?.walletDiscount) > 0) {
    lines.push({
      label: 'Wallet',
      detail: `${currency} ${Number(order.walletDiscount).toFixed(2)}`,
    });
  }

  if (Number(order?.coinsRedeemed) > 0) {
    lines.push({
      label: 'Coins redeemed',
      detail: `${order.coinsRedeemed} coins`,
    });
  }

  if (Number(order?.manualDiscount?.amount) > 0) {
    const manual = order.manualDiscount;
    const detail = manual.type === 'percentage'
      ? `${manual.value}% off (${currency} ${Number(manual.amount).toFixed(2)})`
      : `${currency} ${Number(manual.amount).toFixed(2)} off`;
    const fromAbandoned = isDashboardConvertedOrder(order)
      || String(order?.attribution?.utmMedium || '').toLowerCase() === 'abandoned_checkout_conversion'
      || /abandoned checkout/i.test(String(order?.notes || ''));
    lines.push({
      label: fromAbandoned ? 'Customer discount (abandoned cart)' : 'Staff discount',
      detail,
    });
  }

  if (order?.conversion?.convertedByName) {
    const conversionDiscount = formatConversionDiscount(order.conversion, currency);
    // Avoid a second line when the abandoned discount is already shown via manualDiscount.
    if (conversionDiscount && !(Number(order?.manualDiscount?.amount) > 0)) {
      lines.push({
        label: 'Customer discount (abandoned cart)',
        detail: conversionDiscount,
      });
    }
  }

  return lines;
}

export function getConversionPaymentLabel(conversion) {
  if (!conversion?.paymentMethod) return null;
  return getConversionPaymentMethodLabel(conversion.paymentMethod);
}

export function summarizeDeliveryBuckets(orders, referenceDate = new Date()) {
  const summary = { today: 0, tomorrow: 0, delayed: 0 };
  for (const order of orders) {
    const bucket = getDeliveryBucket(order, referenceDate);
    if (bucket) summary[bucket] += 1;
  }
  return summary;
}

/** Badge rows for the Tags column on /store/orders. */
export function getOrderTableTags(order, currency = 'AED') {
  const tags = [];
  const fulfillmentBadge = getOrderFulfillmentBadge(order);
  if (fulfillmentBadge) tags.push(fulfillmentBadge);

  const originalReturnTag = getOriginalReturnRequestTag(order);
  if (originalReturnTag) tags.push(originalReturnTag);

  if (isManualStoreDashboardOrder(order) && !fulfillmentBadge) {
    tags.push({
      key: 'store-dashboard',
      label: 'Store dashboard',
      className: 'rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-white',
    });

    const creator = getManualStoreOrderCreator(order);
    if (creator?.name) {
      tags.push({
        key: 'created-by',
        label: `Created by ${creator.name}`,
        className: 'rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-800',
        title: creator.uid ? `UID: ${creator.uid}` : undefined,
      });
    }
  }

  if (isAwaitingPaymentOrder(order)) {
    tags.push({
      key: 'awaiting-payment',
      label: 'Awaiting payment',
      className: 'rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800',
    });
  }

  const paymentFailedFollowUpBadge = formatPaymentFailedFollowUpBadge(order, currency);
  if (paymentFailedFollowUpBadge) {
    tags.push(paymentFailedFollowUpBadge);
  }

  if (isDashboardConvertedOrder(order)) {
    const staffName = String(order.conversion.convertedByName).trim();
    tags.push({
      key: 'converted',
      label: `Converted · ${staffName}`,
      className: 'rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800',
      title: order.conversion?.note
        || (order.conversion?.cartId ? `From abandoned checkout ${order.conversion.cartId}` : 'From abandoned checkout'),
    });

    const conversionDiscount = formatConversionDiscount(order.conversion, currency);
    // Prefer the getOrderDiscountLines customer-discount tag below when manualDiscount exists.
    if (conversionDiscount && !(Number(order?.manualDiscount?.amount) > 0)) {
      tags.push({
        key: 'conversion-discount',
        label: `Customer discount · ${conversionDiscount}`,
        className: 'rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800',
      });
    }
  }

  getOrderDiscountLines(order, currency)
    .forEach((line) => {
      tags.push({
        key: `discount-${line.label}`,
        label: line.label,
        className: 'rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800',
        title: line.detail || undefined,
      });
    });

  const deliveryBucket = getDeliveryBucket(order);
  if (deliveryBucket === 'today') {
    tags.push({
      key: 'delivery-today',
      label: 'Today',
      className: 'rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800',
    });
  } else if (deliveryBucket === 'tomorrow') {
    tags.push({
      key: 'delivery-tomorrow',
      label: 'Tomorrow',
      className: 'rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800',
    });
  } else if (deliveryBucket === 'delayed') {
    tags.push({
      key: 'delivery-delayed',
      label: 'Delayed',
      className: 'rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800',
    });
  }

  if (order?.isGuest) {
    tags.push({
      key: 'guest',
      label: 'Guest',
      className: 'rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700',
    });
  }

  if (isWaslahLabelNotPrinted(order)) {
    tags.push({
      key: 'label-not-printed',
      label: 'Not printed',
      className: 'rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700 ring-1 ring-red-200',
      title: 'Shipping label has not been printed yet',
    });
  }

  if (order?.warehousePacking?.packed === true) {
    const packedAt = order.warehousePacking?.packedAt
      ? new Date(order.warehousePacking.packedAt)
      : null;
    const packedBy = String(order.warehousePacking?.packedByName || '').trim();
    tags.push({
      key: 'warehouse-packed',
      label: 'Packed',
      className: 'rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-bold text-teal-800 ring-1 ring-teal-200',
      title: [
        'Order packed in warehouse',
        packedBy ? `by ${packedBy}` : '',
        packedAt && !Number.isNaN(packedAt.getTime())
          ? packedAt.toLocaleString('en-GB')
          : '',
      ].filter(Boolean).join(' · '),
    });
  }

  const pickupWait = getOrderPickupWaitInfo(order);
  if (pickupWait?.overdue) {
    tags.push({
      key: 'pickup-overdue',
      label: `Pickup overdue · ${pickupWait.hoursWaiting}h`,
      className: 'rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 ring-1 ring-amber-300',
      title: [
        'Pickup requested but not picked up within 24 hours',
        pickupWait.pickupDate ? `Slot ${pickupWait.pickupDate}` : '',
        pickupWait.pickupTime || '',
      ].filter(Boolean).join(' · '),
    });
  } else if (pickupWait) {
    tags.push({
      key: 'pickup-waiting',
      label: `Pickup waiting · ${pickupWait.hoursWaiting}h`,
      className: 'rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] font-semibold text-yellow-900 ring-1 ring-yellow-200',
      title: [
        'Pickup requested — waiting for courier',
        pickupWait.pickupDate ? `Slot ${pickupWait.pickupDate}` : '',
        pickupWait.pickupTime || '',
      ].filter(Boolean).join(' · '),
    });
  }

  return tags;
}
