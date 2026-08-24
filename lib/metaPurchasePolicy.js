import { isConfirmedPaidOrder } from '@/lib/orderConfirmationPolicy';
import { isDeferredPaymentMethod, isPrepaidCapturedAtCreate } from '@/lib/deferredOrderStatus';

/**
 * Meta Purchase should fire exactly once per order (Pixel + CAPI share event_id).
 * - COD / wallet / Razorpay card: browser on /order-success
 * - Stripe / Tabby / Tamara: CAPI on payment webhook, plus browser on /order-success
 */
export function shouldSendServerMetaPurchaseOnCreate(order = {}, paymentMethod = '') {
  const method = String(paymentMethod || order.paymentMethod || '').toUpperCase();
  if (method === 'COD' || method === 'WALLET') return false;
  if (isPrepaidCapturedAtCreate(method, order)) return false;
  return isDeferredPaymentMethod(method);
}

export function shouldSendBrowserMetaPurchase(order = {}) {
  return isConfirmedPaidOrder(order);
}
