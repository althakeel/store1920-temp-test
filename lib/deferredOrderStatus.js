export const AWAITING_PAYMENT_STATUS = 'AWAITING_PAYMENT';

export const DEFERRED_PAYMENT_METHODS = new Set(['STRIPE', 'TAMARA', 'TABBY', 'CARD']);

export function isDeferredPaymentMethod(paymentMethod) {
  return DEFERRED_PAYMENT_METHODS.has(String(paymentMethod || '').toUpperCase());
}

/** Razorpay card checkout captures payment before the order document is created. */
export function isPrepaidCapturedAtCreate(paymentMethod, orderData = {}) {
  const method = String(paymentMethod || orderData.paymentMethod || '').toUpperCase();
  return method === 'CARD' && Boolean(orderData.razorpayPaymentId);
}

export function shouldDeferPaymentAtCreate(paymentMethod, orderData = {}) {
  return isDeferredPaymentMethod(paymentMethod) && !isPrepaidCapturedAtCreate(paymentMethod, orderData);
}

export function isAwaitingPaymentOrder(order = {}) {
  const status = String(order?.status || '').toUpperCase();
  if (status === AWAITING_PAYMENT_STATUS) return true;

  const method = String(order?.paymentMethod || '').toUpperCase();
  const paymentStatus = String(order?.paymentStatus || '').toLowerCase();
  const isPaid = order?.isPaid === true || paymentStatus === 'paid';
  if (!isPaid && isDeferredPaymentMethod(method) && status === 'ORDER_PLACED') {
    return true;
  }

  return false;
}

export function isVisibleStoreOrder(order = {}) {
  const status = String(order?.status || '').toUpperCase();
  if (status === 'PAYMENT_FAILED' || status === 'CANCELLED' || status === 'REFUNDED') return false;
  return !isAwaitingPaymentOrder(order);
}

export function applyDeferredPaymentOrderDefaults(orderData = {}, paymentMethod = '') {
  if (!isDeferredPaymentMethod(paymentMethod)) return orderData;

  return {
    ...orderData,
    status: AWAITING_PAYMENT_STATUS,
    isPaid: false,
    paymentStatus: String(orderData.paymentStatus || 'PENDING').toUpperCase() === 'PAID'
      ? 'PENDING'
      : (orderData.paymentStatus || 'PENDING'),
  };
}
