import { GTM_EVENTS, GTM_PURCHASE_PATH } from '@/lib/gtmEvents';
import { pushGtmEcommerceEvent } from '@/lib/pushGtmEcommerceEvent';
import { getMetaOrderEventId } from '@/lib/metaPurchase';
import { orderItemsToGtmItems, resolveOrderLineItems, resolvePurchaseTransactionId } from '@/lib/gtmEcommerceHelpers';

/**
 * Push GTM `purchase` to dataLayer from a confirmed order (not cart).
 * Call only from /order-success inside a runTrackedOnce guard.
 */
export function fireGtmPurchase(order) {
  if (typeof window === 'undefined') return false;

  const orderId = String(order?._id || order?.id || '').trim();
  if (!orderId) return false;

  const items = orderItemsToGtmItems(resolveOrderLineItems(order), order);
  const transactionId = resolvePurchaseTransactionId(order) || orderId;
  const metaEventId = getMetaOrderEventId(orderId);
  const value = Number(order.total ?? 0);

  return pushGtmEcommerceEvent(GTM_EVENTS.GA4_PURCHASE, {
    transaction_id: transactionId,
    event_id: metaEventId,
    meta_browser_purchase: 'handled',
    skip_meta_purchase: true,
    order_id: metaEventId,
    value: Number.isFinite(value) ? value : 0,
    currency: order.currency || 'AED',
    shipping: Number(order.shippingFee ?? order.shipping ?? 0),
    tax: Number(order.tax ?? 0),
    coupon: order.coupon?.code || '',
    items,
    page_path: GTM_PURCHASE_PATH,
    page_location: typeof window !== 'undefined' ? window.location.href : GTM_PURCHASE_PATH,
  }, `gtm:${GTM_EVENTS.GA4_PURCHASE}:${orderId}`);
}
