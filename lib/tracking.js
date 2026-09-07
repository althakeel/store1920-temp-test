'use client';

import { resolveOrderLineItems } from '@/lib/gtmEcommerceHelpers';
import { trackCustomerEvent } from '@/lib/trackingClient';
import { trackPurchaseDual } from '@/lib/ecommerceTracking';
import { fireGtmPurchase } from '@/lib/gtmPurchase';
import { runTrackedOnce, hasTrackedPersistently } from '@/lib/trackingDedupe';
import { gtmDedupeKey, GTM_EVENTS } from '@/lib/gtmEvents';
import { isConfirmedPaidOrder } from '@/lib/orderConfirmationPolicy';
import { getMetaPurchaseDedupeKey } from '@/lib/metaPurchase';
import { shouldSendBrowserMetaPurchase } from '@/lib/metaPurchasePolicy';

function normalizeOrder(input = {}) {
  const items = resolveOrderLineItems(input);
  const id = input.id || input._id || input.orderId;

  return {
    ...input,
    _id: id,
    id,
    total: Number(input.total ?? input.value ?? 0),
    orderItems: items,
    items,
    currency: input.currency || 'AED',
  };
}

/**
 * Purchase tracking on order-success — one Meta Purchase (fbq) + one GA4 purchase (GTM).
 */
export function trackPurchase(orderInput = {}, options = {}) {
  const order = normalizeOrder(orderInput);
  const orderId = String(order._id || '').trim();
  if (!orderId || typeof window === 'undefined') return false;
  if (!isConfirmedPaidOrder(order)) return false;

  const { user, metaSkip = false } = options;

  if (metaSkip) {
    const currency = order.currency || 'AED';
    const items = order.orderItems || [];
    runTrackedOnce(`purchase:customer:${orderId}`, () => {
      trackCustomerEvent({
        storeId: order.storeId,
        eventType: 'purchase',
        firebaseUid: user?.uid || order.userId || null,
        userId: user?.uid || order.userId || null,
        pageType: 'order_success',
        pagePath: '/order-success',
        value: order.total,
        currency,
        metadata: {
          orderId,
          orderNumber: order.shortOrderNumber || null,
          itemCount: Array.isArray(items) ? items.length : 0,
          paymentMethod: order.paymentMethod || null,
        },
      });
    });
    return true;
  }

  const purchaseKey = getMetaPurchaseDedupeKey(orderId);
  if (hasTrackedPersistently(purchaseKey)) return false;
  const currency = order.currency || 'AED';
  const items = order.orderItems || [];

  runTrackedOnce(`purchase:customer:${orderId}`, () => {
    trackCustomerEvent({
      storeId: order.storeId,
      eventType: 'purchase',
      firebaseUid: user?.uid || order.userId || null,
      userId: user?.uid || order.userId || null,
      pageType: 'order_success',
      pagePath: '/order-success',
      value: order.total,
      currency,
      metadata: {
        orderId,
        orderNumber: order.shortOrderNumber || null,
        itemCount: Array.isArray(items) ? items.length : 0,
        paymentMethod: order.paymentMethod || null,
      },
    });
  });

  const sendMeta = shouldSendBrowserMetaPurchase(order);

  if (sendMeta) {
    const metaSent = trackPurchaseDual(order, {
      orderId,
      value: order.total,
      currency,
      items,
    }) !== false;

    return metaSent;
  }

  const ga4Key = gtmDedupeKey(GTM_EVENTS.PURCHASE, orderId);
  return runTrackedOnce(ga4Key, () => fireGtmPurchase(order) !== false);
}
