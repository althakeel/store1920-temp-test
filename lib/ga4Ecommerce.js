import { pushGtmEcommerceEvent, pushGtmEvent } from '@/lib/pushGtmEcommerceEvent';
import { GTM_EVENTS, gtmDedupeKey } from '@/lib/gtmEvents';
import { hasTrackedPersistently, markTrackedPersistently } from '@/lib/trackingDedupe';
import {
  GA4_CURRENCY,
  inferItemListFromPath,
  productToGa4Item,
} from '@/lib/ga4Item';
import { ensureGa4CategoryCache } from '@/lib/ga4CategoryLookup';

export { GA4_CURRENCY, productToGa4Item, inferItemListFromPath } from '@/lib/ga4Item';
export { toGa4PaymentType } from '@/lib/ga4Item';

const listBuffers = new Map();
const seenListItems = new Set();
const listTimers = new Map();

function flushItemList(listKey) {
  const buffer = listBuffers.get(listKey);
  if (!buffer?.items?.length) return;
  listBuffers.delete(listKey);
  pushGtmEcommerceEvent(GTM_EVENTS.VIEW_ITEM_LIST, {
    item_list_id: buffer.item_list_id,
    item_list_name: buffer.item_list_name,
    currency: GA4_CURRENCY,
    items: buffer.items,
  }, gtmDedupeKey(
    GTM_EVENTS.VIEW_ITEM_LIST,
    `${listKey}:${buffer.items.map((item) => item.item_id).join(',')}`,
  ));
}

export function registerItemListImpression(source, {
  itemListId,
  itemListName,
  index,
  pathname,
} = {}) {
  if (typeof window === 'undefined') return;
  ensureGa4CategoryCache();
  const inferred = inferItemListFromPath(pathname || window.location.pathname);
  const item_list_id = itemListId || inferred.item_list_id;
  const item_list_name = itemListName || inferred.item_list_name;
  const item = productToGa4Item(source, { quantity: 1 });
  if (!item.item_id) return;

  const seenKey = `${item_list_id}:${item.item_id}`;
  if (seenListItems.has(seenKey)) return;
  seenListItems.add(seenKey);

  const listKey = item_list_id;
  const current = listBuffers.get(listKey) || { item_list_id, item_list_name, items: [] };
  current.items.push({
    ...item,
    index: Number(index || current.items.length) + 1,
    item_list_id,
    item_list_name,
  });
  listBuffers.set(listKey, current);

  if (listTimers.has(listKey)) window.clearTimeout(listTimers.get(listKey));
  listTimers.set(listKey, window.setTimeout(() => flushItemList(listKey), 400));
}

export function trackSelectItem(source, {
  itemListId,
  itemListName,
  index,
  pathname,
} = {}) {
  if (typeof window === 'undefined') return false;
  const inferred = inferItemListFromPath(pathname || window.location.pathname);
  const item_list_id = itemListId || inferred.item_list_id;
  const item_list_name = itemListName || inferred.item_list_name;
  const item = productToGa4Item(source, { quantity: 1 });
  if (!item.item_id) return false;
  return pushGtmEcommerceEvent(GTM_EVENTS.SELECT_ITEM, {
    item_list_id,
    item_list_name,
    currency: GA4_CURRENCY,
    items: [{
      ...item,
      index: Number(index || 0) + 1,
      item_list_id,
      item_list_name,
    }],
  });
}

export function trackWhatsAppClick({
  linkUrl = '',
  itemId = '',
  itemName = '',
} = {}) {
  return pushGtmEvent(GTM_EVENTS.WHATSAPP_CLICK, {
    link_url: String(linkUrl || '').split('?')[0],
    item_id: String(itemId || ''),
    item_name: String(itemName || ''),
  });
}

export function trackGa4Refund({
  transactionId,
  value,
  items = [],
} = {}) {
  const transaction_id = String(transactionId || '').trim();
  if (!transaction_id) return false;
  const persistKey = `ga4:refund:${transaction_id}:${Number(value || 0)}`;
  if (hasTrackedPersistently(persistKey)) return false;
  const ok = pushGtmEcommerceEvent(GTM_EVENTS.REFUND, {
    transaction_id,
    currency: GA4_CURRENCY,
    value: Number(value || 0),
    items: (Array.isArray(items) ? items : []).map((item) => productToGa4Item(item)),
  }, gtmDedupeKey(GTM_EVENTS.REFUND, persistKey));
  if (ok) markTrackedPersistently(persistKey);
  return ok;
}
