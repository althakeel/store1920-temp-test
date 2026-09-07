import { hasTrackedOnce, markTrackedOnce } from '@/lib/trackingDedupe';
import { productToGa4Item } from '@/lib/ga4Item';

export function toGtmItem(item, overrides = {}) {
  return productToGa4Item(item, overrides);
}

function pushToDataLayer(payload) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

export function pushGtmEcommerceEvent(event, ecommerce = {}, dedupeKey = null) {
  if (typeof window === 'undefined' || !event) return false;
  if (dedupeKey && hasTrackedOnce(dedupeKey)) return false;

  pushToDataLayer({ ecommerce: null });
  pushToDataLayer({ event, ecommerce });

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
