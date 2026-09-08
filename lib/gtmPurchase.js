import { GTM_EVENTS } from '@/lib/gtmEvents';
import { pushGtmEcommerceEvent } from '@/lib/pushGtmEcommerceEvent';
import { getMetaOrderEventId } from '@/lib/metaPurchase';
import { orderItemsToGtmItems, resolveOrderLineItems, resolvePurchaseTransactionId } from '@/lib/gtmEcommerceHelpers';
import {
  GA4_CURRENCY,
  resolveGa4Tax,
  sumGa4ItemsValue,
  toGa4PaymentType,
} from '@/lib/ga4Item';
import { hasTrackedPersistently, markTrackedPersistently } from '@/lib/trackingDedupe';

/**
 * Push GTM `purchase` to dataLayer from a confirmed order (not cart).
 * Deduped by transaction_id in localStorage so refresh does not fire again.
 */
export function fireGtmPurchase(order) {
  if (typeof window === 'undefined') return false;

  const orderId = String(order?._id || order?.id || '').trim();
  if (!orderId) return false;

  const items = orderItemsToGtmItems(resolveOrderLineItems(order), order);
  const transactionId = resolvePurchaseTransactionId(order) || orderId;
  const persistKey = `ga4:purchase:${orderId}`;
  if (hasTrackedPersistently(persistKey) || hasTrackedPersistently(`ga4:purchase:${transactionId}`)) {
    return false;
  }

  const metaEventId = getMetaOrderEventId(orderId);
  const coupon = String(order.coupon?.code || order.couponCode || '').trim();
  const paymentType = toGa4PaymentType(order.paymentMethod);
  const shipping = Number(order.shippingFee ?? order.shipping ?? 0);
  const value = items.length
    ? sumGa4ItemsValue(items)
    : Math.max(0, Number((Number(order.total ?? 0) - shipping).toFixed(2)));
  const tax = resolveGa4Tax(order, value);

  const ok = pushGtmEcommerceEvent(GTM_EVENTS.PURCHASE, {
    transaction_id: transactionId,
    value,
    currency: GA4_CURRENCY,
    shipping: Number(shipping.toFixed(2)),
    tax,
    coupon,
    payment_type: paymentType,
    items: coupon
      ? items.map((item) => ({ ...item, coupon }))
      : items,
  }, null, {
    event_id: metaEventId,
    meta_browser_purchase: 'handled',
    skip_meta_purchase: true,
  });

  if (ok) {
    markTrackedPersistently(persistKey);
    markTrackedPersistently(`ga4:purchase:${transactionId}`);
  }
  return ok;
}

export function hasGa4PurchaseTracked(order = {}) {
  const orderId = String(order?._id || order?.id || '').trim();
  const transactionId = resolvePurchaseTransactionId(order) || orderId;
  if (orderId && hasTrackedPersistently(`ga4:purchase:${orderId}`)) return true;
  if (transactionId && hasTrackedPersistently(`ga4:purchase:${transactionId}`)) return true;
  return false;
}
