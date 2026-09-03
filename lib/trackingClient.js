'use client';

import { getMetaBrowserCookies } from '@/lib/metaBrowserAttribution';
import { getEmailTrackingToken } from '@/lib/emailTrackClient';

const ANONYMOUS_ID_KEY = 'anonymous_id';
const SESSION_ID_KEY = 'session_id';
const STORE_ID_CACHE_KEY = 'tracking_store_id';

let cachedCustomerProfile = {
  name: null,
  email: null,
};

export function setTrackingCustomerProfile(profile = {}) {
  cachedCustomerProfile = {
    name: profile?.name ? String(profile.name).trim() : null,
    email: profile?.email ? String(profile.email).trim() : null,
  };
}

export function getTrackingCustomerProfile() {
  return { ...cachedCustomerProfile };
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function getOrCreateAnonymousId() {
  if (typeof window === 'undefined') return null;

  let anonymousId = localStorage.getItem(ANONYMOUS_ID_KEY);
  if (!anonymousId) {
    anonymousId = createId();
    localStorage.setItem(ANONYMOUS_ID_KEY, anonymousId);
  }

  return anonymousId;
}

export function getOrCreateSessionId() {
  if (typeof window === 'undefined') return null;

  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = createId();
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }

  return sessionId;
}

export async function getTrackingStoreId() {
  if (typeof window === 'undefined') return null;

  const cached = sessionStorage.getItem(STORE_ID_CACHE_KEY);
  if (cached) return cached;

  try {
    const response = await fetch('/api/public/tracking-context', { cache: 'no-store' });
    if (!response.ok) return null;

    const data = await response.json();
    const storeId = data?.storeId ? String(data.storeId) : null;
    if (storeId) {
      sessionStorage.setItem(STORE_ID_CACHE_KEY, storeId);
    }
    return storeId;
  } catch {
    return null;
  }
}

export function getPageType(pathname = '') {
  const path = String(pathname || '');

  if (path === '/') return 'home';
  if (path.startsWith('/product/') || /^\/products\/[^/]+/.test(path)) return 'product_detail';
  if (path.startsWith('/shop')) return 'shop';
  if (path === '/cart') return 'cart';
  if (path === '/checkout') return 'checkout';
  if (path.startsWith('/category/')) return 'category';
  if (path.startsWith('/search')) return 'search';
  return 'other';
}

export function extractProductSlug(pathname = '') {
  const path = String(pathname || '');
  const productMatch = path.match(/^\/product\/([^/?#]+)/);
  if (productMatch) return decodeURIComponent(productMatch[1]);
  const productsMatch = path.match(/^\/products\/([^/?#]+)/);
  return productsMatch ? decodeURIComponent(productsMatch[1]) : null;
}

export function getUtmMetadata() {
  if (typeof window === 'undefined') return {};

  try {
    const raw = localStorage.getItem('utm_data');
    if (!raw) return {};
    const utm = JSON.parse(raw);
    return {
      utmSource: utm.source || null,
      utmMedium: utm.medium || null,
      utmCampaign: utm.campaign || null,
      utmContent: utm.content || null,
      utmTerm: utm.term || null,
      utmId: utm.id || null,
      utmReferrer: utm.referrer || null,
    };
  } catch {
    return {};
  }
}

export function getDeviceMetadata() {
  if (typeof window === 'undefined') return {};

  const ua = navigator.userAgent || '';
  const isMobile = /Mobi|Android/i.test(ua);
  return {
    deviceType: isMobile ? 'mobile' : 'desktop',
    browserLanguage: navigator.language || null,
    platform: navigator.platform || null,
  };
}

export function getOrderTrackingFields() {
  const metaCookies = getMetaBrowserCookies();

  return {
    trackingContext: {
      anonymousId: getOrCreateAnonymousId(),
      sessionId: getOrCreateSessionId(),
      fbp: metaCookies.fbp,
      fbc: metaCookies.fbc,
      eventSourceUrl: typeof window !== 'undefined' ? window.location.href : null,
      emailTrackingToken: getEmailTrackingToken(),
    },
    attribution: getUtmMetadata(),
  };
}

export function withOrderTrackingFields(payload = {}) {
  return {
    ...payload,
    ...getOrderTrackingFields(),
  };
}

export function trackAddToCartFromPayload(payload = {}) {
  const productId = String(payload?.productId || '').trim();
  const price = Number(payload?.price || 0);
  const quantity = Number(payload?.quantity || 1);

  return trackCustomerEvent({
    eventType: 'add_to_cart',
    productId: productId || null,
    pageType: typeof window !== 'undefined' ? getPageType(window.location.pathname) : null,
    pagePath: typeof window !== 'undefined' ? window.location.pathname : null,
    value: Number.isFinite(price) ? price * quantity : 0,
    currency: 'AED',
    metadata: {
      quantity: Number.isFinite(quantity) ? quantity : 1,
      price: Number.isFinite(price) ? price : 0,
      source: 'cart_action',
    },
  });
}

export async function trackCustomerEvent({
  eventType,
  storeId,
  firebaseUid = null,
  userId = null,
  productId = null,
  pageType = null,
  pagePath = null,
  value = 0,
  currency = 'AED',
  metadata = {},
} = {}) {
  if (typeof window === 'undefined' || !eventType) return null;

  const resolvedStoreId = storeId || (await getTrackingStoreId());
  if (!resolvedStoreId) return null;

  const anonymousId = getOrCreateAnonymousId();
  const sessionId = getOrCreateSessionId();
  const currentPath = pagePath || window.location.pathname;
  const resolvedPageType = pageType || getPageType(currentPath);

  try {
    const response = await fetch('/api/analytics/customer-behavior', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        storeId: String(resolvedStoreId),
        eventType,
        firebaseUid: firebaseUid || null,
        userId: userId || null,
        anonymousId,
        sessionId,
        productId: productId ? String(productId) : null,
        pageType: resolvedPageType,
        pagePath: currentPath,
        value: Number(value || 0),
        currency,
        metadata: {
          ...getUtmMetadata(),
          ...getDeviceMetadata(),
          ...metadata,
          customerName: metadata.customerName || cachedCustomerProfile.name || null,
          customerEmail: metadata.customerEmail || cachedCustomerProfile.email || null,
          referrer: metadata.referrer ?? document.referrer ?? null,
          userAgent: metadata.userAgent ?? navigator.userAgent ?? null,
          viewport: metadata.viewport ?? `${window.innerWidth}x${window.innerHeight}`,
        },
      }),
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}
