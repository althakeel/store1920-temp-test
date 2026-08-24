'use client';

import { trackMetaPurchase } from '@/lib/metaPixelTracking';
import { trackTikTokPurchase } from '@/lib/tiktokPixelTracking';
import { canTrackMetaPurchaseOnOrderSuccess } from '@/lib/orderConfirmationPolicy';
import { resolveOrderLineItems } from '@/lib/gtmEcommerceHelpers';
import { fireGtmPurchase } from '@/lib/gtmPurchase';
import { runTrackedOnce, hasTrackedPersistently } from '@/lib/trackingDedupe';
import { gtmDedupeKey, GTM_EVENTS } from '@/lib/gtmEvents';
import { waitForTtq } from '@/lib/tiktokPixelClient';
import { getMetaPurchaseDedupeKey } from '@/lib/metaPurchase';

function resolveFbq() {
  if (typeof window === 'undefined') return null;
  const fbq = window.fbq;
  return typeof fbq === 'function' ? fbq : null;
}

export function waitForFbq(maxMs = 10000) {
  return new Promise((resolve) => {
    const started = Date.now();

    const tick = () => {
      if (resolveFbq()) {
        // Brief pause so fbevents.js can finish loading after the stub appears.
        window.setTimeout(() => resolve(true), 150);
        return;
      }
      if (Date.now() - started >= maxMs) {
        resolve(false);
        return;
      }
      window.setTimeout(tick, 50);
    };

    tick();
  });
}

/**
 * Single entry for /order-success: Meta Purchase + TikTok CompletePayment + GA4 purchase (GTM).
 */
export async function trackOrderSuccessPurchaseOnce(order = {}, { onAnalytics } = {}) {
  const orderId = String(order._id || order.id || '').trim();
  if (!orderId || !canTrackMetaPurchaseOnOrderSuccess(order)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Meta] Purchase skipped — order not trackable', {
        orderId: orderId || null,
        status: order?.status,
        paymentMethod: order?.paymentMethod,
      });
    }
    return false;
  }

  const purchaseKey = getMetaPurchaseDedupeKey(orderId);

  if (!hasTrackedPersistently(purchaseKey)) {
    const fbqReady = await waitForFbq(15000);
    if (!fbqReady) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Meta] Purchase skipped — fbq not ready');
      }
      return false;
    }

    const items = resolveOrderLineItems(order);
    const metaSent = trackMetaPurchase({
      orderId,
      value: order.total,
      currency: order.currency || 'AED',
      items,
      order,
    });

    const purchaseRecorded = hasTrackedPersistently(purchaseKey);
    if (!metaSent && !purchaseRecorded) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Meta] Purchase skipped — trackMetaPurchase returned false (deduped, blocked, or queue pending)');
      }
      return false;
    }

    if (!purchaseRecorded) {
      return false;
    }
  } else if (process.env.NODE_ENV === 'development') {
    console.info('[Meta] Purchase already recorded for order', orderId);
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

  const ga4Key = gtmDedupeKey(GTM_EVENTS.GA4_PURCHASE, orderId);
  runTrackedOnce(ga4Key, () => fireGtmPurchase(order) !== false);

  onAnalytics?.();
  return true;
}
