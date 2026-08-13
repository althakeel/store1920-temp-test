import { getProductThumbnailUrl } from '@/lib/productMedia';

function slugifyValue(value = '') {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function mergeUniqueList(existing = [], incoming = []) {
  const base = Array.isArray(existing) ? existing : [];
  const next = Array.isArray(incoming) ? incoming : [];
  return Array.from(new Set([...base, ...next].map((item) => String(item || '').trim()).filter(Boolean)));
}

function isEmptyValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Build a product $set from AI autofill.
 * Default fillEmptyOnly=true — never overwrite seller-entered details.
 * Pass fillEmptyOnly=false only when the seller explicitly clicks AI autofill on one product.
 */
export function buildProductUpdateFromAutofill(autofill = {}, existingProduct = {}, options = {}) {
  const {
    includeArabic = true,
    updateSlug = false,
    fillEmptyOnly = true,
  } = options;
  const update = {};

  const assignIfPresent = (field, value) => {
    if (value === undefined || value === null) return;
    const text = typeof value === 'string' ? value.trim() : value;
    if (typeof text === 'string' && !text) return;
    if (fillEmptyOnly && !isEmptyValue(existingProduct[field])) return;
    update[field] = value;
  };

  assignIfPresent('name', autofill.name);
  assignIfPresent('brand', autofill.brand);
  assignIfPresent('shortDescription', autofill.shortDescription);
  assignIfPresent('shortDescription2', autofill.shortDescription2);
  assignIfPresent('description', autofill.description);
  assignIfPresent('seoTitle', autofill.seoTitle);
  assignIfPresent('seoDescription', autofill.seoDescription);
  assignIfPresent('deliveredBy', autofill.deliveredBy);
  assignIfPresent('soldBy', autofill.soldBy);
  assignIfPresent('paymentInfo', autofill.paymentInfo);
  // SKU is never AI-managed — sellers change it only by typing in the product form.

  if (Array.isArray(autofill.specTableRows) && autofill.specTableRows.length > 0) {
    const hasExistingSpecs = Array.isArray(existingProduct.specTableRows)
      && existingProduct.specTableRows.length > 0;
    if (!fillEmptyOnly || !hasExistingSpecs) {
      update.specTableEnabled = Boolean(autofill.specTableEnabled ?? true);
      update.specTableColumns = autofill.specTableColumns || ['Property', 'Value'];
      update.specTableRows = autofill.specTableRows;
    }
  }

  if (Array.isArray(autofill.tags) && autofill.tags.length > 0) {
    update.tags = mergeUniqueList(existingProduct.tags, autofill.tags);
  }
  if (Array.isArray(autofill.seoKeywords) && autofill.seoKeywords.length > 0) {
    update.seoKeywords = mergeUniqueList(existingProduct.seoKeywords, autofill.seoKeywords);
  }

  const hasExistingCategories = Array.isArray(existingProduct.categories)
    && existingProduct.categories.length > 0;
  if (
    Array.isArray(autofill.suggestedCategoryIds)
    && autofill.suggestedCategoryIds.length > 0
    && (!fillEmptyOnly || !hasExistingCategories)
  ) {
    update.categories = autofill.suggestedCategoryIds;
    update.category = autofill.suggestedCategoryIds[0];
  }

  if (updateSlug && autofill.name && (!fillEmptyOnly || isEmptyValue(existingProduct.slug))) {
    update.slug = slugifyValue(autofill.name);
  }

  if (includeArabic) {
    assignIfPresent('nameAr', autofill.nameAr);
    assignIfPresent('brandAr', autofill.brandAr);
    assignIfPresent('shortDescriptionAr', autofill.shortDescriptionAr);
    assignIfPresent('shortDescription2Ar', autofill.shortDescription2Ar);
    assignIfPresent('descriptionAr', autofill.descriptionAr);
  }

  if (autofill.attributes && typeof autofill.attributes === 'object') {
    const existingAttrs = existingProduct.attributes && typeof existingProduct.attributes === 'object'
      ? existingProduct.attributes
      : {};
    // Never let AI change pricing mode / pack structure keys.
    const BLOCKED_ATTR_KEYS = new Set([
      'variantType',
      'variants',
      'hasVariants',
      'bundleQty',
      'enableFBT',
      'fbtProductIds',
      'fbtBundlePrice',
      'fbtBundleDiscount',
    ]);
    const incomingAttrs = Object.fromEntries(
      Object.entries(autofill.attributes).filter(([key]) => !BLOCKED_ATTR_KEYS.has(key)),
    );

    if (fillEmptyOnly) {
      const merged = { ...existingAttrs };
      let changed = false;
      for (const [key, value] of Object.entries(incomingAttrs)) {
        if (isEmptyValue(merged[key]) && !isEmptyValue(value)) {
          merged[key] = value;
          changed = true;
        }
      }
      if (changed) update.attributes = merged;
    } else {
      update.attributes = {
        ...existingAttrs,
        ...incomingAttrs,
      };
    }
  }

  return update;
}

export function getFirstProductImageUrl(product = {}) {
  const thumbnail = getProductThumbnailUrl(product, { fallback: '', allowVideo: false });
  const url = String(thumbnail || '').trim();
  if (!url || url === '/placeholder.png') return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url;
  return '';
}
