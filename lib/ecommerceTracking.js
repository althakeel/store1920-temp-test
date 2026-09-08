'use client';

/**
 * Dual-channel ecommerce tracking:
 * - GA4 via GTM dataLayer (pushGtmEcommerceEvent / fireGtmPurchase)
 * - Meta Pixel for funnel events (view content, cart, add to cart) via metaPixelTracking
 *
 * Meta funnel (required for ads): AddToCart → InitiateCheckout → Purchase (once).
 * TikTok Pixel mirrors the same funnel via ttq (CompletePayment on purchase).
 */

import { pushGtmEcommerceEvent } from '@/lib/pushGtmEcommerceEvent';
import { fireGtmPurchase } from '@/lib/gtmPurchase';
import { runTrackedOnce, hasTrackedOnce, markTrackedOnce, claimTrackedOnce } from '@/lib/trackingDedupe';
import { gtmDedupeKey, GTM_EVENTS } from '@/lib/gtmEvents';
import {
  trackAddToCart,
  trackInitiateCheckout,
  trackMetaPurchase,
  trackViewCart,
  trackViewContent,
} from '@/lib/metaPixelTracking';
import {
  trackTikTokAddToCart,
  trackTikTokInitiateCheckout,
  trackTikTokPurchase,
  trackTikTokViewContent,
} from '@/lib/tiktokPixelTracking';
import { STORE_CURRENCY } from '@/lib/storeCurrency';
import { GA4_CURRENCY, productToGa4Item } from '@/lib/ga4Item';

export function trackViewCartDual({
  value,
  currency,
  gtmItems,
  metaItems,
  numItems,
  pageKey = '/cart',
}) {
  const gtmKey = gtmDedupeKey(GTM_EVENTS.VIEW_CART, pageKey);

  const gtmTracked = runTrackedOnce(gtmKey, () => {
    pushGtmEcommerceEvent(GTM_EVENTS.VIEW_CART, {
      currency,
      value,
      items: gtmItems,
    });
    return true;
  });

  const metaTracked = trackViewCart({
    value,
    currency,
    items: metaItems,
    numItems,
    dedupeKey: pageKey,
  }) !== false;

  return gtmTracked || metaTracked;
}

function resolveMetaInitiateCheckoutEventId(pageKey = '/checkout') {
  if (typeof window === 'undefined') {
    return `ic:${pageKey}:ssr`;
  }

  let sessionId = '';
  try {
    sessionId = String(sessionStorage.getItem('meta_ic_session') || '').trim();
  } catch {
    sessionId = '';
  }

  if (!sessionId) {
    sessionId = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    try {
      sessionStorage.setItem('meta_ic_session', sessionId);
    } catch {
      // Ignore storage failures; in-memory id still works for this page load.
    }
  }

  return `ic:${pageKey}:${sessionId}`;
}

export function trackBeginCheckoutDual({
  value,
  currency,
  gtmItems,
  metaItems = [],
  pageKey = '/checkout',
  coupon = '',
}) {
  // Push GA4-only event name so GTM Facebook tags on `begin_checkout` do not
  // double-count Meta InitiateCheckout (app already fires InitiateCheckout via fbq).
  const gtmKey = gtmDedupeKey(GTM_EVENTS.BEGIN_CHECKOUT, pageKey);
  const metaSessionKey = `meta:InitiateCheckout:${pageKey}`;

  const gtmTracked = runTrackedOnce(gtmKey, () => {
    pushGtmEcommerceEvent(GTM_EVENTS.BEGIN_CHECKOUT, {
      currency: GA4_CURRENCY,
      value,
      coupon: String(coupon || '').trim(),
      items: gtmItems,
    });
    return true;
  });

  // Claim before fbq so React Strict Mode remounts cannot send a second IC.
  let metaTracked = false;
  if (claimTrackedOnce(metaSessionKey)) {
    metaTracked = trackInitiateCheckout({
      value,
      currency,
      items: metaItems,
      dedupeKey: pageKey,
      eventID: resolveMetaInitiateCheckoutEventId(pageKey),
    }) !== false;
  }

  const tiktokTracked = trackTikTokInitiateCheckout({
    value,
    currency,
    items: metaItems,
    dedupeKey: pageKey,
  }) !== false;

  return gtmTracked || metaTracked || tiktokTracked;
}

export function trackPurchaseDual(order, {
  orderId,
  value,
  currency = 'AED',
  items = [],
} = {}) {
  const resolvedOrderId = String(orderId || order?._id || order?.id || '').trim();
  if (!resolvedOrderId) return false;

  const ga4Key = gtmDedupeKey(GTM_EVENTS.PURCHASE, resolvedOrderId);

  // Meta dedupe lives in trackMetaEvent (including fbq queue drain). Do not wrap with
  // runTrackedOnce here — that marks the key before fbq loads and drops queued Purchase events.
  const metaTracked = trackMetaPurchase({
    orderId: resolvedOrderId,
    value: value ?? order?.total,
    currency: order?.currency || currency,
    items: items.length ? items : (order?.orderItems || []),
    order,
  }) !== false;

  const tiktokTracked = trackTikTokPurchase({
    orderId: resolvedOrderId,
    value: value ?? order?.total,
    currency: order?.currency || currency,
    items: items.length ? items : (order?.orderItems || []),
    order,
  }) !== false;

  runTrackedOnce(ga4Key, () => fireGtmPurchase(order) !== false);

  return metaTracked || tiktokTracked;
}

export function trackViewContentDual({
  productId,
  name,
  price,
  currency = 'AED',
  gtmItem,
}) {
  const key = String(productId || '').trim();
  if (!key) return false;

  const gtmKey = gtmDedupeKey(GTM_EVENTS.VIEW_ITEM, key);

  const metaTracked = trackViewContent({
    productId,
    name,
    price,
    currency,
    dedupeKey: key,
  }) !== false;

  const tiktokTracked = trackTikTokViewContent({
    productId,
    name,
    price,
    currency,
    dedupeKey: key,
  }) !== false;

  const gtmTracked = runTrackedOnce(gtmKey, () => {
    pushGtmEcommerceEvent(GTM_EVENTS.VIEW_ITEM, {
      currency,
      value: Number(price || 0),
      items: [gtmItem],
    });
    return true;
  });

  return gtmTracked || metaTracked || tiktokTracked;
}

export function trackAddToCartDual({
  productId,
  name,
  price,
  quantity = 1,
  currency = 'AED',
  gtmItem,
}) {
  const id = String(productId || '').trim();
  if (!id) return false;

  const qty = Number(quantity || 1);
  const unitPrice = Number(price || 0);
  const sig = `${id}:${qty}:${unitPrice}`;
  const gtmKey = gtmDedupeKey(GTM_EVENTS.ADD_TO_CART, sig);

  const metaTracked = trackAddToCart({
    productId: id,
    name,
    price: unitPrice,
    quantity: qty,
    currency,
    dedupeKey: sig,
  }) !== false;

  const tiktokTracked = trackTikTokAddToCart({
    productId: id,
    name,
    price: unitPrice,
    quantity: qty,
    currency,
    dedupeKey: sig,
  }) !== false;

  const gtmTracked = runTrackedOnce(gtmKey, () => {
    pushGtmEcommerceEvent(GTM_EVENTS.ADD_TO_CART, {
      currency,
      value: unitPrice * qty,
      items: [gtmItem],
    });
    return true;
  });

  return gtmTracked || metaTracked || tiktokTracked;
}

/** Single entry point for add-to-cart across product cards, PDP, wishlist, bundles. */
export function trackProductAddToCart({
  product,
  productId,
  name,
  price,
  quantity = 1,
  currency = STORE_CURRENCY,
  variantOptions,
} = {}) {
  const source = product || { _id: productId, name, price };
  const ga4Item = productToGa4Item(source, {
    price,
    quantity: Math.max(1, Number(quantity || 1)),
    variantOptions,
  });
  const id = String(productId || source._id || source.id || ga4Item.item_id || '').trim();
  if (!id && !ga4Item.item_id) return false;

  const qty = Math.max(1, Number(quantity || 1));
  const unitPrice = Number(price ?? ga4Item.price ?? 0);

  return trackAddToCartDual({
    productId: id || ga4Item.item_id,
    name: name || ga4Item.item_name || 'Product',
    price: unitPrice,
    quantity: qty,
    currency: currency || GA4_CURRENCY,
    gtmItem: {
      ...ga4Item,
      price: unitPrice,
      quantity: qty,
    },
  });
}
