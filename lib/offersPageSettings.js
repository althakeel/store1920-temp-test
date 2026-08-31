export const OFFERS_PAGE_MODES = ['discount', 'manual'];

export const OFFERS_DISCOUNT_PRESETS = [10, 25, 40, 50, 60];

export const DEFAULT_OFFERS_PAGE = {
  mode: 'discount',
  minDiscountPercent: 60,
  productIds: [],
};

const MAX_MANUAL_PRODUCTS = 500;

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return OFFERS_PAGE_MODES.includes(mode) ? mode : DEFAULT_OFFERS_PAGE.mode;
}

function normalizeMinDiscount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_OFFERS_PAGE.minDiscountPercent;
  return Math.min(95, Math.max(1, Math.round(n)));
}

function normalizeProductIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const raw of value) {
    const id = String(raw?._id || raw || '').trim();
    if (!/^[a-fA-F0-9]{24}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_MANUAL_PRODUCTS) break;
  }
  return ids;
}

export function normalizeOffersPage(payload = {}) {
  const src = payload && typeof payload === 'object' ? payload : {};
  return {
    mode: normalizeMode(src.mode),
    minDiscountPercent: normalizeMinDiscount(src.minDiscountPercent),
    productIds: normalizeProductIds(src.productIds),
  };
}

export function offersPageCacheToken(settings = {}) {
  const normalized = normalizeOffersPage(settings);
  if (normalized.mode === 'manual') {
    return `manual:${normalized.productIds.length}:${normalized.productIds.slice(0, 8).join(',')}`;
  }
  return `discount:${normalized.minDiscountPercent}`;
}

export function getOffersPageSubtitle(settings = {}) {
  const normalized = normalizeOffersPage(settings);
  if (normalized.mode === 'manual') {
    return 'Handpicked special offers';
  }
  return `Products with over ${normalized.minDiscountPercent}% discount`;
}
