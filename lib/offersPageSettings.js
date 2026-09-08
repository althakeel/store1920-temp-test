export const OFFERS_PAGE_MODES = ['discount', 'manual', 'category'];

export const OFFERS_DISCOUNT_PRESETS = [10, 25, 40, 50, 60];

export const OFFERS_PAGE_SIZE = 24;

export const DEFAULT_OFFERS_PAGE = {
  eyebrow: 'Hot Deals',
  title: 'Special Offers',
  subtitle: '',
  mode: 'discount',
  minDiscountPercent: 60,
  productIds: [],
  categoryIds: [],
};

const MAX_MANUAL_PRODUCTS = 500;
const MAX_CATEGORIES = 40;

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

function normalizeCategoryIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const raw of value) {
    const id = String(raw?._id || raw || '').trim();
    if (!/^[a-fA-F0-9]{24}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_CATEGORIES) break;
  }
  return ids;
}

function normalizeCopy(value, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 160);
}

export function normalizeOffersPage(payload = {}) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const savedAt = Number(src.savedAt);
  return {
    eyebrow: normalizeCopy(src.eyebrow, DEFAULT_OFFERS_PAGE.eyebrow) || DEFAULT_OFFERS_PAGE.eyebrow,
    title: normalizeCopy(src.title, DEFAULT_OFFERS_PAGE.title) || DEFAULT_OFFERS_PAGE.title,
    subtitle: normalizeCopy(src.subtitle, ''),
    mode: normalizeMode(src.mode),
    minDiscountPercent: normalizeMinDiscount(src.minDiscountPercent),
    productIds: normalizeProductIds(src.productIds),
    categoryIds: normalizeCategoryIds(src.categoryIds),
    savedAt: Number.isFinite(savedAt) && savedAt > 0 ? savedAt : 0,
  };
}

export function offersPageCacheToken(settings = {}) {
  const normalized = normalizeOffersPage(settings);
  if (normalized.mode === 'manual') {
    return `manual:${normalized.productIds.length}:${normalized.productIds.join(',')}`;
  }
  if (normalized.mode === 'category') {
    return `category:${normalized.categoryIds.length}:${normalized.categoryIds.join(',')}`;
  }
  return `discount:${normalized.minDiscountPercent}`;
}

export function getOffersPageSubtitle(settings = {}) {
  const normalized = normalizeOffersPage(settings);
  if (normalized.subtitle) return normalized.subtitle;
  if (normalized.mode === 'manual') return 'Handpicked special offers';
  if (normalized.mode === 'category') return 'Offers from selected categories';
  return `Products with over ${normalized.minDiscountPercent}% discount`;
}

export function getOffersPageCopy(settings = {}) {
  const normalized = normalizeOffersPage(settings);
  return {
    eyebrow: normalized.eyebrow,
    title: normalized.title,
    subtitle: getOffersPageSubtitle(normalized),
  };
}
