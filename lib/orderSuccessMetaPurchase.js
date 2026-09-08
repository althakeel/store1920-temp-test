'use client';

import { trackMetaPurchase } from '@/lib/metaPixelTracking';
import { trackTikTokPurchase } from '@/lib/tiktokPixelTracking';
import { canTrackMetaPurchaseOnOrderSuccess, isConfirmedPaidOrder } from '@/lib/orderConfirmationPolicy';
import { resolveOrderLineItems } from '@/lib/gtmEcommerceHelpers';
import { fireGtmPurchase, hasGa4PurchaseTracked } from '@/lib/gtmPurchase';
import { waitForGa4CategoryCache } from '@/lib/ga4CategoryLookup';
import { runTrackedOnce, hasTrackedPersistently } from '@/lib/trackingDedupe';
import { gtmDedupeKey, GTM_EVENTS } from '@/lib/gtmEvents';
import { waitForTtq } from '@/lib/tiktokPixelClient';
import { getMetaPurchaseDedupeKey } from '@/lib/metaPurchase';
import { markOrderPurchaseIdentifiersSent } from '@/lib/metaPurchaseGuard';
import { waitForFbqFullyLoaded } from '@/lib/metaPixelClient';

async function fireGa4Purchase(order) {
  if (!isConfirmedPaidOrder(order)) return hasGa4PurchaseTracked(order);
  if (hasGa4PurchaseTracked(order)) return true;
  await waitForGa4CategoryCache(1200);
  const orderId = String(order._id || order.id || '').trim();
  const ga4Key = gtmDedupeKey(GTM_EVENTS.PURCHASE, orderId);
  runTrackedOnce(ga4Key, () => fireGtmPurchase(order) !== false);
  return hasGa4PurchaseTracked(order);
}

/**
 * Single entry for /order-success: Meta Purchase + TikTok CompletePayment + GA4 purchase (GTM).
 * GA4 purchase is independent of Meta pixel readiness and only fires after payment is confirmed.
 */
export async function trackOrderSuccessPurchaseOnce(order = {}, { onAnalytics } = {}) {
  const orderId = String(order._id || order.id || '').trim();
  if (!orderId) return false;

  const ga4Ready = await fireGa4Purchase(order);

  if (!canTrackMetaPurchaseOnOrderSuccess(order)) {
    if (ga4Ready) onAnalytics?.();
    return ga4Ready;
  }

  const purchaseKey = getMetaPurchaseDedupeKey(orderId);

  if (!hasTrackedPersistently(purchaseKey)) {
    const fbqReady = await waitForFbqFullyLoaded(15000);
    if (!fbqReady) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Meta] Purchase skipped — fbq not ready');
      }
      if (ga4Ready) onAnalytics?.();
      return ga4Ready;
    }

    const items = resolveOrderLineItems(order);
    // Lock + id marks before fbq so GTM purchase cannot fire a 2nd Meta Purchase.
    markOrderPurchaseIdentifiersSent(order);
    if (typeof window !== 'undefined') {
      window.__store1920MetaPurchaseHandled = true;
    }

    const metaSent = trackMetaPurchase({
      orderId,
      value: order.total,
      currency: order.currency || 'AED',
      items,
      order,
    });

    const purchaseRecorded = hasTrackedPersistently(purchaseKey);
    if (!metaSent && !purchaseRecorded) {
      if (typeof window !== 'undefined') {
        window.__store1920MetaPurchaseHandled = false;
      }
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Meta] Purchase skipped — trackMetaPurchase returned false (deduped, blocked, or not ready)');
      }
      if (ga4Ready) onAnalytics?.();
      return ga4Ready;
    }

    if (!purchaseRecorded) {
      if (typeof window !== 'undefined') {
        window.__store1920MetaPurchaseHandled = false;
      }
      if (ga4Ready) onAnalytics?.();
      return ga4Ready;
    }
  } else if (process.env.NODE_ENV === 'development') {
    console.info('[Meta] Purchase already recorded for order', orderId);
  }

  markOrderPurchaseIdentifiersSent(order);
  if (typeof window !== 'undefined') {
    window.__store1920MetaPurchaseHandled = true;
  }

  const items = resolveOrderLineItems(order);

  const ttqReady = await waitForTtq(10000);
  if (ttqReady) {
    trackTikTokPurchase({
      orderId,
      value: order.total,
      currency: order.currency || 'AED',
      items,
      order,
    });
  }

  const ga4ReadyAfterMeta = await fireGa4Purchase(order);
  onAnalytics?.();
  return ga4ReadyAfterMeta || ga4Ready || hasTrackedPersistently(purchaseKey);
}
