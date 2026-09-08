import { hasTrackedOnce, markTrackedOnce } from '@/lib/trackingDedupe';
import { productToGa4Item } from '@/lib/ga4Item';

export function toGtmItem(item, overrides = {}) {
  return productToGa4Item(item, overrides);
}

const TOP_LEVEL_KEYS = new Set([
  'event_id',
  'eventID',
  'meta_browser_purchase',
  'skip_meta_purchase',
  'order_id',
  'page_path',
  'page_location',
]);

function definedEntries(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''),
  );
}

export function splitGa4EcommercePayload(ecommerce = {}, extras = {}) {
  const clean = {};
  const top = { ...extras };
  Object.entries(ecommerce || {}).forEach(([key, value]) => {
    if (TOP_LEVEL_KEYS.has(key)) {
      if (top[key] == null) top[key] = value;
      return;
    }
    clean[key] = value;
  });
  return { ecommerce: clean, extras: definedEntries(top) };
}

function pushToDataLayer(payload) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

export function pushGtmEcommerceEvent(event, ecommerce = {}, dedupeKey = null, extras = {}) {
  if (typeof window === 'undefined' || !event) return false;
  if (dedupeKey && hasTrackedOnce(dedupeKey)) return false;

  const split = splitGa4EcommercePayload(ecommerce, extras);
  pushToDataLayer({ ecommerce: null });
  pushToDataLayer({
    event,
    ecommerce: split.ecommerce,
    ...split.extras,
  });

  if (dedupeKey) {
    markTrackedOnce(dedupeKey);
  }

  return true;
}

export function pushGtmEvent(event, params = {}, dedupeKey = null) {
  if (typeof window === 'undefined' || !event) return false;
  if (dedupeKey && hasTrackedOnce(dedupeKey)) return false;

  pushToDataLayer({ event, ...params });

  if (dedupeKey) {
    markTrackedOnce(dedupeKey);
  }

  return true;
}
