'use client';

import { trackTtqEvent } from '@/lib/tiktokPixelClient';
import {
  buildMetaPurchaseItems,
  getMetaOrderEventId,
} from '@/lib/metaPurchase';
import { hasTrackedPersistently, claimBurstDedupe } from '@/lib/trackingDedupe';

function buildTikTokContents(items = [], order = null) {
  return buildMetaPurchaseItems(items, order).map((entry) => ({
    content_id: String(entry.id),
    content_type: 'product',
    content_name: entry.item_name || undefined,
    quantity: entry.quantity,
    price: entry.item_price,
  }));
}

function buildSingleTikTokContent({ productId, name, price, quantity = 1 } = {}) {
  const id = String(productId || '').trim();
  if (!id) return [];

  return [{
    content_id: id,
    content_type: 'product',
    content_name: name || undefined,
    quantity: Number(quantity || 1),
    price: Number(price || 0),
  }];
}

export function trackTikTokPageView({ pagePath } = {}) {
  if (typeof window === 'undefined') return false;

  const routeKey = String(pagePath || window.location.pathname || '/').split('?')[0] || '/';
  if (!claimBurstDedupe(`tiktok:PageView:${routeKey}`, 800)) return false;

  return trackTtqEvent('PageView', {
    page_path: routeKey,
  }, {
    dedupeKey: `tiktok:PageView:${routeKey}:${Date.now().toString(36)}`,
  });
}

export function trackTikTokViewContent({
  productId,
  name,
  price,
  currency = 'AED',
  dedupeKey = '',
} = {}) {
  const id = String(productId || '').trim();
  const signature = dedupeKey || id;
  if (!claimBurstDedupe(`tiktok:ViewContent:${signature}`, 800)) return false;
  const contents = buildSingleTikTokContent({ productId: id, name, price, quantity: 1 });

  return trackTtqEvent('ViewContent', {
    contents,
    content_id: id,
    content_ids: [id],
    value: Number(price || 0),
    currency,
    content_type: 'product',
  }, {
    dedupeKey: `tiktok:ViewContent:${signature}:${Date.now().toString(36)}`,
  });
}

export function trackTikTokAddToCart({
  productId,
  name,
  price,
  quantity = 1,
  currency = 'AED',
  dedupeKey = '',
} = {}) {
  const id = String(productId || '').trim();
  const qty = Number(quantity || 1);
  const unitPrice = Number(price || 0);
  if (!claimBurstDedupe(`tiktok:AddToCart:${id}`, 250)) return false;
  const contents = buildSingleTikTokContent({ productId: id, name, price: unitPrice, quantity: qty });

  return trackTtqEvent('AddToCart', {
    contents,
    content_id: id,
    content_ids: [id],
    value: unitPrice * qty,
    currency,
    content_type: 'product',
  }, {
    dedupeKey: `tiktok:AddToCart:${id}:${Date.now().toString(36)}`,
  });
}

export function trackTikTokInitiateCheckout({
  value,
  currency = 'AED',
  items = [],
  dedupeKey = '',
} = {}) {
  const contents = (Array.isArray(items) ? items : [])
    .map((item) => {
      const id = String(item?.productId || item?.id || item?.item_id || '').trim();
      if (!id) return null;
      return {
        content_id: id,
        content_type: 'product',
        quantity: Number(item?.quantity || 1),
        price: Number(item?.price || item?.item_price || 0),
      };
    })
    .filter(Boolean);

  const ids = contents.map((entry) => entry.content_id);
  const signature = dedupeKey
    || `checkout:${ids.join(',')}:${Number(value || 0)}`;

  return trackTtqEvent('InitiateCheckout', {
    contents,
    content_id: contents[0]?.content_id,
    content_ids: ids,
    value: Number(value || 0),
    currency,
    content_type: 'product',
  }, {
    dedupeKey: `tiktok:InitiateCheckout:${signature}`,
  });
}

/** TikTok purchase — CompletePayment on /order-success. */
export function trackTikTokPurchase({
  orderId,
  value,
  currency = 'AED',
  items = [],
  order = null,
} = {}) {
  const eventId = getMetaOrderEventId(orderId);
  if (!eventId) return false;

  const persistentKey = `tiktok:CompletePayment:${eventId}`;
  if (hasTrackedPersistently(persistentKey)) {
    return false;
  }

  const contents = buildTikTokContents(items, order);

  return trackTtqEvent(
    'CompletePayment',
    {
      contents,
      content_id: contents[0]?.content_id,
      content_ids: contents.map((entry) => entry.content_id),
      value: Number(value || 0),
      currency,
      content_type: 'product',
    },
    {
      eventID: eventId,
      dedupeKey: persistentKey,
    },
  );
}
