/**
 * GTM / dataLayer event names — official GA4 ecommerce names.
 */
export const GTM_EVENTS = Object.freeze({
  PAGE_VIEW: 'page_view',
  VIEW_ITEM_LIST: 'view_item_list',
  SELECT_ITEM: 'select_item',
  VIEW_ITEM: 'view_item',
  ADD_TO_CART: 'add_to_cart',
  REMOVE_FROM_CART: 'remove_from_cart',
  VIEW_CART: 'view_cart',
  BEGIN_CHECKOUT: 'begin_checkout',
  ADD_SHIPPING_INFO: 'add_shipping_info',
  ADD_PAYMENT_INFO: 'add_payment_info',
  PURCHASE: 'purchase',
  REFUND: 'refund',
  SEARCH: 'search',
  LOGIN: 'login',
  SIGN_UP: 'sign_up',
  WHATSAPP_CLICK: 'whatsapp_click',
  /**
   * Aliases kept so existing callers keep compiling.
   * Both map to the official GA4 names above.
   */
  GA4_BEGIN_CHECKOUT: 'begin_checkout',
  GA4_PURCHASE: 'purchase',
});

/** Client-side GTM purchase fires only on this route. */
export const GTM_PURCHASE_PATH = '/order-success';

/** Funnel pages that fire a dedicated ecommerce event — skip extra page_view. */
export const GTM_SKIP_PAGE_VIEW_PATHS = [
  '/cart',
  '/checkout',
  '/order-success',
];

export function shouldSkipGtmPageView(pathname) {
  if (!pathname) return false;
  const path = pathname.split('?')[0];
  return GTM_SKIP_PAGE_VIEW_PATHS.some(
    (skip) => path === skip || path.startsWith(`${skip}/`),
  );
}

export function gtmDedupeKey(event, suffix) {
  return `gtm:${event}:${suffix}`;
}

export function toGa4EventName(gtmEvent) {
  return String(gtmEvent || '').replace(/\s+/g, '_');
}
