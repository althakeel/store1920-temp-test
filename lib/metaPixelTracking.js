'use client';

import { trackMetaEvent } from '@/lib/metaPixelClient';
import {
  buildMetaPurchaseItems,
  getMetaOrderEventId,
  getMetaPurchaseDedupeKey,
} from '@/lib/metaPurchase';
import { hasTrackedPersistently } from '@/lib/trackingDedupe';
import { resolvePurchaseTransactionId } from '@/lib/gtmEcommerceHelpers';

export { getMetaOrderEventId };

function buildSingleContent({ productId, name, price, quantity = 1 } = {}) {
  const id = String(productId || '').trim();
  if (!id) return { content_ids: [], contents: [] };

  const qty = Number(quantity || 1);
  const unitPrice = Number(price || 0);

  return {
    content_ids: [id],
    contents: [{ id, quantity: qty, item_price: unitPrice }],
    content_name: name || undefined,
  };
}

export function trackPageView({ pagePath } = {}) {
  if (typeof window === 'undefined') return false;

  const raw = String(
    pagePath || `${window.location.pathname}${window.location.search || ''}`
  );
  const routeKey = raw.split('?')[0] || '/';

  return trackMetaEvent('PageView', {
    page_path: routeKey,
  }, {
    // Unique eventID for Meta; stable dedupeKey blocks Strict Mode double-fire.
    eventID: `pv:${routeKey}:${Date.now().toString(36)}`,
    dedupeKey: `meta:PageView:${routeKey}`,
    dedupeMode: 'burst',
    burstMs: 1000,
  });
}

export function trackViewCart({
  value,
  currency = 'AED',
  items = [],
  numItems,
  dedupeKey = '',
} = {}) {
  const contents = Array.isArray(items) ? items : [];
  const ids = contents
    .map((item) => String(item?.productId || item?.id || item?.item_id || '').trim())
    .filter(Boolean);
  const signature = dedupeKey
    || `cart:${ids.join(',')}:${Number(value || 0)}`;

  return trackMetaEvent('ViewCart', {
    value: Number(value || 0),
    currency,
    content_type: 'product',
    content_ids: ids,
    num_items: Number.isFinite(Number(numItems))
      ? Number(numItems)
      : contents.reduce((sum, item) => sum + Number(item?.quantity || 0), 0),
  }, {
    eventID: `vcart:${signature}:${Date.now().toString(36)}`,
    dedupeKey: `meta:ViewCart:${signature}`,
    // Once per cart visit (Strict Mode / remount safe); revisit after burst still tracks.
    dedupeMode: 'burst',
    burstMs: 2000,
  });
}

export function trackViewContent({
  productId,
  name,
  price,
  currency = 'AED',
  dedupeKey = '',
} = {}) {
  const content = buildSingleContent({ productId, name, price, quantity: 1 });
  const id = String(productId || '').trim();
  const signature = dedupeKey || id;

  return trackMetaEvent('ViewContent', {
    content_type: 'product',
    value: Number(price || 0),
    currency,
    ...content,
  }, {
    eventID: `vc:${signature}:${Date.now().toString(36)}`,
    dedupeKey: `meta:ViewContent:${signature}`,
    dedupeMode: 'burst',
    burstMs: 1000,
  });
}

export function trackAddToCart({
  productId,
  name,
  price,
  quantity = 1,
  currency = 'AED',
  dedupeKey = '',
} = {}) {
  const qty = Number(quantity || 1);
  const unitPrice = Number(price || 0);
  const content = buildSingleContent({ productId, name, price: unitPrice, quantity: qty });
  const id = String(productId || '').trim();
  const signature = dedupeKey || `add:${id}:${qty}:${unitPrice}`;

  return trackMetaEvent('AddToCart', {
    content_type: 'product',
    value: unitPrice * qty,
    currency,
    num_items: qty,
    ...content,
  }, {
    eventID: `atc:${signature}:${Date.now().toString(36)}`,
    // Stable per product — blocks React double-invoke; real re-adds after burst still fire.
    dedupeKey: `meta:AddToCart:${id}`,
    dedupeMode: 'burst',
    burstMs: 500,
  });
}

export function trackInitiateCheckout({
  value,
  currency = 'AED',
  items = [],
  contentIds = [],
  numItems,
  dedupeKey = '',
  eventID = '',
} = {}) {
  const contents = Array.isArray(items) && items.length
    ? items
        .map((item) => {
          const id = String(item?.productId || item?.id || item?.item_id || '').trim();
          if (!id) return null;
          return {
            id,
            quantity: Number(item?.quantity || 1),
            item_price: Number(item?.price || item?.item_price || 0),
          };
        })
        .filter(Boolean)
    : (Array.isArray(contentIds) ? contentIds : [])
        .map((id) => String(id).trim())
        .filter(Boolean)
        .map((id) => ({ id, quantity: 1, item_price: 0 }));

  const ids = contents.map((entry) => entry.id);
  const signature = dedupeKey
    || `checkout:${ids.join(',')}:${Number(value || 0)}:${contents.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0)}`;
  const stableEventId = String(eventID || '').trim() || `ic:${signature}`;

  return trackMetaEvent('InitiateCheckout', {
    value: Number(value || 0),
    currency,
    content_type: 'product',
    content_ids: ids,
    contents,
    num_items: Number.isFinite(Number(numItems))
      ? Number(numItems)
      : contents.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0),
  }, {
    // Stable eventID per browser session — pairs browser + any future CAPI.
    eventID: stableEventId,
    dedupeKey: `meta:InitiateCheckout:${signature}`,
  });
}

/** Browser Meta Purchase — paired with GTM dataLayer purchase for GA4. */
export function trackMetaPurchase({
  orderId,
  value,
  currency = 'AED',
  items = [],
  order = null,
} = {}) {
  const eventId = getMetaOrderEventId(orderId);
  if (!eventId) return false;

  const persistentKey = getMetaPurchaseDedupeKey(orderId);
  if (hasTrackedPersistently(persistentKey)) {
    return false;
  }

  const contents = buildMetaPurchaseItems(items, order);
  const transactionId = resolvePurchaseTransactionId(order) || eventId;

  const tracked = trackMetaEvent(
    'Purchase',
    {
      value: Number(value || 0),
      currency,
      content_type: 'product',
      content_ids: contents.map((entry) => entry.id),
      contents,
      order_id: eventId,
      transaction_id: transactionId,
      num_items: contents.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0),
    },
    {
      eventID: eventId,
      dedupeKey: persistentKey,
    },
  );

  return tracked;
}
