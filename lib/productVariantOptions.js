export const VARIANT_OPTION_META_KEYS = new Set(['image', 'imageSlot', 'bundleQty', 'optionLabel', 'tag', 'bundleTitle']);

/**
 * Sellers often type the customer-facing choice ("Single Battery") into Option Label
 * and leave Option Value empty. Option Label is only a group heading on the storefront,
 * so promote it into `option` when there is no real selectable value yet.
 */
export function normalizeSellerVariantOptions(options = {}) {
  const next = { ...(options && typeof options === 'object' ? options : {}) };
  const optionValue = String(next.option || '').trim();
  const optionLabel = String(next.optionLabel || '').trim();
  const hasOtherSelection = Object.keys(next).some(
    (key) => !VARIANT_OPTION_META_KEYS.has(key)
      && key !== 'bundleQty'
      && key !== 'option'
      && String(next[key] ?? '').trim() !== '',
  );

  if (!optionValue && optionLabel && !hasOtherSelection) {
    next.option = optionLabel;
    next.optionLabel = 'Option';
  }

  return next;
}

export function isBulkBundleVariantOption(v) {
  if (!v?.options) return false;
  if (!(v.options.bundleQty || v.options.bundleQty === 0)) return false;
  if (v.options?.color || v.options?.size) return false;
  // Matrix variants pair bundleQty with a separate option (title, model, etc.).
  const hasSelection = Object.keys(v.options).some(
    (key) => !VARIANT_OPTION_META_KEYS.has(key)
      && key !== 'bundleQty'
      && String(v.options[key] ?? '').trim(),
  );
  if (hasSelection) return false;
  return true;
}

/** Keys that identify a variant's color/size/option selection (excludes meta + bundleQty). */
export function getVariantSelectionKeys(options = {}) {
  return Object.keys(options || {}).filter(
    (key) => !VARIANT_OPTION_META_KEYS.has(key)
      && key !== 'bundleQty'
      && String(options?.[key] ?? '').trim() !== '',
  );
}

/** A matrix variant carries BOTH a bundle quantity AND a color/size/option selection. */
export function isMatrixVariant(v) {
  if (!v?.options) return false;
  const hasBundle = v.options.bundleQty || v.options.bundleQty === 0;
  if (!hasBundle) return false;
  return getVariantSelectionKeys(v.options).length > 0;
}

/** True when the product mixes color/size variants with bundle tiers (matrix mode). */
function detectBundleModeFromVariants(variants = []) {
  const withBundle = variants.filter(
    (v) => v?.options?.bundleQty != null && v?.options?.bundleQty !== '',
  );
  if (!withBundle.length) return 'none';

  // Same option selection with multiple pack tiers → matrix (e.g. Buy 1 ×1, ×2, ×3).
  const tiersBySelection = new Map();
  for (const v of withBundle) {
    const opts = v.options || {};
    const qty = Number(opts.bundleQty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const selection = getVariantSelectionKeys(opts)
      .map((key) => `${key}:${String(opts[key] || '').trim()}`)
      .sort()
      .join('|') || '__base__';
    if (!tiersBySelection.has(selection)) tiersBySelection.set(selection, new Set());
    tiersBySelection.get(selection).add(qty);
  }
  for (const tiers of tiersBySelection.values()) {
    if (tiers.size > 1) return 'matrix';
  }

  // Multiple distinct option values — matrix only when color/size are involved,
  // or when the same selection has more than one pack tier. Otherwise treat rows
  // with unique bundleQty (Buy 1 / Bundle of 2 / Bundle of 3) as bulk tiers.
  if (tiersBySelection.size > 1) {
    const hasColorSize = withBundle.some(
      (v) => String(v?.options?.color || '').trim() || String(v?.options?.size || '').trim(),
    );
    if (hasColorSize) return 'matrix';

    const allSingleTier = [...tiersBySelection.values()].every((tiers) => tiers.size === 1);
    const tierValues = withBundle
      .map((v) => Number(v?.options?.bundleQty))
      .filter((qty) => Number.isFinite(qty) && qty > 0);
    const uniqueTierValues = new Set(tierValues);
    if (allSingleTier && uniqueTierValues.size === tierValues.length) {
      return 'bulk';
    }
    return 'matrix';
  }

  return 'bulk';
}

export function getProductBundleMode(product = {}) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const variantType = String(product?.attributes?.variantType || '').trim();
  const detected = detectBundleModeFromVariants(variants);

  // Explicit seller-saved mode wins over shape detection so switching away from
  // "Variants + bundle packs" and saving persists after refresh.
  if (variantType === 'simple' || variantType === 'variants') return 'none';
  if (variantType === 'bulk_bundles') return 'bulk';
  if (variantType === 'variant_bundles') return 'matrix';

  // Legacy products with no explicit flag — infer from saved variants.
  if (detected === 'bulk') return 'bulk';
  return detected;
}

export function isMatrixVariantProduct(variants = [], product = null) {
  const resolved = product || { variants: Array.isArray(variants) ? variants : [] };
  return getProductBundleMode(resolved) === 'matrix';
}

/** Distinct bundle quantities used by matrix variants, ascending. */
export function getMatrixBundleTiers(variants = [], { inStockOnly = false, product = null } = {}) {
  const list = Array.isArray(variants) ? variants : [];
  const isMatrix = getProductBundleMode(product || { variants: list }) === 'matrix';
  const tiers = new Set();
  list.forEach((v) => {
    const qty = Number(v?.options?.bundleQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (inStockOnly && !(Number(v.stock) > 0)) return;
    if (isMatrixVariant(v) || isMatrix) {
      tiers.add(qty);
    }
  });
  return [...tiers].sort((a, b) => a - b);
}

/** Match a matrix variant by both the selected color/size options and the bundle tier. */
export function matchMatrixVariant(variants = [], selectedOptions = {}, bundleQty) {
  const list = (Array.isArray(variants) ? variants : []).filter(isMatrixVariant);
  if (!list.length) return null;

  const tier = Number(bundleQty);
  const opts = selectedOptions && typeof selectedOptions === 'object' ? selectedOptions : {};
  const selectionKeys = getVariantSelectionKeys(opts);

  return list.find((variant) => {
    if (Number.isFinite(tier) && tier > 0 && Number(variant.options?.bundleQty) !== tier) {
      return false;
    }
    return selectionKeys.every(
      (key) => String(variant.options?.[key] ?? '') === String(opts[key] ?? ''),
    );
  }) || null;
}

export function formatVariantOptionLabel(key = '') {
  const labels = {
    color: 'Color',
    size: 'Size',
    title: 'Variant',
    model: 'Model',
    version: 'Version',
    memory: 'Internal memory',
    storage: 'Storage',
  };
  if (labels[key]) return labels[key];
  return String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildVariantOptionGroups(variants = [], { isBulkBundleVariant = isBulkBundleVariantOption } = {}) {
  const nonBulk = variants
    .filter((variant) => !isBulkBundleVariant(variant))
    .map((variant) => ({
      ...variant,
      options: normalizeSellerVariantOptions(variant?.options),
    }));
  if (!nonBulk.length) return [];

  const keys = new Set();
  nonBulk.forEach((variant) => {
    Object.entries(variant.options || {}).forEach(([key, value]) => {
      if (!VARIANT_OPTION_META_KEYS.has(key) && String(value || '').trim()) {
        keys.add(key);
      }
    });
  });

  const priority = ['title', 'color', 'size', 'option', 'model', 'memory', 'storage', 'version'];
  const sortedKeys = [...keys].sort((a, b) => {
    const aIndex = priority.indexOf(a);
    const bIndex = priority.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  const sharedOptionLabel = nonBulk
    .map((variant) => String(variant.options?.optionLabel || '').trim())
    .find((label) => label && label !== 'Option') || nonBulk
    .map((variant) => String(variant.options?.optionLabel || '').trim())
    .find(Boolean) || 'Option';

  return sortedKeys
    .map((key) => ({
      key,
      label: key === 'option' ? sharedOptionLabel : formatVariantOptionLabel(key),
      values: [...new Set(
        nonBulk
          .map((variant) => String(variant.options?.[key] || '').trim())
          .filter(Boolean),
      )],
    }))
    .filter((group) => group.values.length > 0);
}

export function getInitialSelectedOptions(groups = []) {
  const initial = {};
  groups.forEach((group) => {
    initial[group.key] = group.values[0] || '';
  });
  return initial;
}

export function cartVariantOptionsMatch(cartOptions = {}, selectedOptions = {}) {
  const cart = cartOptions && typeof cartOptions === 'object' ? cartOptions : {};
  const selected = selectedOptions && typeof selectedOptions === 'object' ? selectedOptions : {};

  const cartBundle = cart.bundleQty == null ? null : Number(cart.bundleQty);
  const selectedBundle = selected.bundleQty == null ? null : Number(selected.bundleQty);
  if (cartBundle !== selectedBundle) return false;

  const keys = new Set([...Object.keys(cart), ...Object.keys(selected)]);
  const variantKeys = [...keys].filter(
    (key) => !VARIANT_OPTION_META_KEYS.has(key) && key !== 'bundleQty',
  );

  if (variantKeys.length === 0) return true;

  return variantKeys.every((key) => {
    const cartVal = cart[key];
    const selVal = selected[key];
    if ((cartVal == null || cartVal === '') && (selVal == null || selVal === '')) {
      return true;
    }
    return String(cartVal || '') === String(selVal || '');
  });
}

export function variantOptionKeyInUse(variants = [], key = '', { isBulkBundleVariant = isBulkBundleVariantOption } = {}) {
  return variants
    .filter((variant) => !isBulkBundleVariant(variant))
    .some((variant) => String(variant.options?.[key] || '').trim());
}

/** Human label for a bundle tier quantity (1 → Buy 1, 3 → Bundle of 3). */
export function formatBundleTierLabel(bundleQty = 1) {
  const qty = Math.max(1, Number(bundleQty) || 1);
  return qty === 1 ? 'Buy 1' : `Buy ${qty}`;
}

/** Pack-size label for matrix products (avoids clashing with option names like "Buy 1"). */
export function formatMatrixPackSizeLabel(bundleQty = 1) {
  const qty = Math.max(1, Number(bundleQty) || 1);
  return qty === 1 ? 'Pack of 1' : `Pack of ${qty}`;
}

/** Matrix order lines: show the selected option (Buy 2, Red, etc.) without the pack size. */
export function formatMatrixSelectionLabel(variantOptions = {}) {
  if (!variantOptions || typeof variantOptions !== 'object') return '';

  const title = String(variantOptions.title || '').trim();
  if (title) return title;

  const parts = [];
  const optionLabel = String(variantOptions.optionLabel || '').trim();
  const optionValue = String(variantOptions.option || '').trim();
  if (optionValue) {
    parts.push(optionLabel ? `${optionLabel}: ${optionValue}` : optionValue);
  }

  ['color', 'size', 'model', 'memory', 'storage', 'version'].forEach((key) => {
    const value = String(variantOptions[key] || '').trim();
    if (value) parts.push(value);
  });

  getVariantSelectionKeys(variantOptions).forEach((key) => {
    if (['title', 'option', 'color', 'size', 'model', 'memory', 'storage', 'version'].includes(key)) return;
    const value = String(variantOptions[key] || '').trim();
    if (value) parts.push(value);
  });

  return parts.join(' · ');
}

/** True when an order line used a matrix product (option + pack size), not a pure bulk bundle. */
export function isMatrixOrderLine(item = {}, product = null) {
  if (!product || getProductBundleMode(product) !== 'matrix') return false;
  return Number(item?.variantOptions?.bundleQty) > 0;
}

export function getVariantCardLabel(variant, fallbackIndex = 0) {
  const options = normalizeSellerVariantOptions(variant?.options);
  const title = String(options?.title || '').trim();
  if (title) return title;

  const optionLabel = String(options?.optionLabel || '').trim();
  const optionValue = String(options?.option || '').trim();
  if (optionValue) {
    return optionLabel && optionLabel !== 'Option'
      ? `${optionLabel}: ${optionValue}`
      : optionValue;
  }

  const parts = [options?.color, options?.size]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (parts.length) return parts.join(' · ');

  return `Variant ${Number(fallbackIndex) + 1}`;
}

export function formatVariantOptionsLabel(variantOptions = {}) {
  if (!variantOptions || typeof variantOptions !== 'object') return '';
  const normalized = normalizeSellerVariantOptions(variantOptions);

  const title = String(normalized.title || '').trim();
  if (title) return title;

  const parts = [];
  const optionLabel = String(normalized.optionLabel || '').trim();
  const optionValue = String(normalized.option || '').trim();
  if (optionValue) {
    parts.push(
      optionLabel && optionLabel !== 'Option'
        ? `${optionLabel}: ${optionValue}`
        : optionValue,
    );
  }

  ['color', 'size', 'model', 'memory', 'storage', 'version'].forEach((key) => {
    const value = String(normalized[key] || '').trim();
    if (value) parts.push(value);
  });

  Object.entries(normalized).forEach(([key, value]) => {
    if (VARIANT_OPTION_META_KEYS.has(key) || key === 'bundleQty') return;
    if (['title', 'option', 'color', 'size', 'model', 'memory', 'storage', 'version'].includes(key)) return;
    const text = String(value || '').trim();
    if (text) parts.push(text);
  });

  if (normalized.bundleQty != null && normalized.bundleQty !== '') {
    const bundleQtyNum = Number(normalized.bundleQty);
    parts.push(
      bundleQtyNum > 1
        ? `Bundle of ${normalized.bundleQty}`
        : `Bundle ${normalized.bundleQty}`,
    );
  }

  return parts.join(' · ');
}

export function sanitizeVariantOptionsForCart(
  variantOptions = {},
  variants = [],
  { isBulkBundleVariant = isBulkBundleVariantOption } = {},
) {
  const source = normalizeSellerVariantOptions(
    variantOptions && typeof variantOptions === 'object' ? variantOptions : {},
  );
  const nonBulk = (variants || [])
    .filter((variant) => !isBulkBundleVariant(variant))
    .map((variant) => ({
      ...variant,
      options: normalizeSellerVariantOptions(variant?.options),
    }));

  if (!nonBulk.length) {
    const cleaned = {};
    Object.entries(source).forEach(([key, value]) => {
      if (VARIANT_OPTION_META_KEYS.has(key)) return;
      if (value == null || String(value).trim() === '') return;
      cleaned[key] = value;
    });
    return cleaned;
  }

  const activeKeys = new Set();
  nonBulk.forEach((variant) => {
    Object.entries(variant.options || {}).forEach(([key, value]) => {
      if (!VARIANT_OPTION_META_KEYS.has(key) && key !== 'bundleQty' && String(value || '').trim()) {
        activeKeys.add(key);
      }
    });
  });

  const cleaned = {};
  activeKeys.forEach((key) => {
    const value = source[key];
    if (value != null && String(value).trim() !== '') {
      cleaned[key] = value;
    }
  });

  if (source.bundleQty != null && source.bundleQty !== '') {
    cleaned.bundleQty = source.bundleQty;
  }

  return cleaned;
}

export function sanitizeSelectedOptions(
  variants = [],
  selectedOptions = {},
  options = {},
) {
  return sanitizeVariantOptionsForCart(selectedOptions, variants, options);
}

export function matchVariantByOptions(
  variants = [],
  variantOptions = {},
  { isBulkBundleVariant = isBulkBundleVariantOption } = {},
) {
  if (!Array.isArray(variants) || variants.length === 0) return null;

  const opts = normalizeSellerVariantOptions(
    variantOptions && typeof variantOptions === 'object' ? variantOptions : {},
  );
  if (opts.bundleQty != null && opts.bundleQty !== '') {
    const selectionKeys = Object.keys(opts).filter(
      (key) => !VARIANT_OPTION_META_KEYS.has(key)
        && key !== 'bundleQty'
        && opts[key] != null
        && String(opts[key]).trim() !== '',
    );
    // Matrix variant: match bundle tier AND the color/size/option selection.
    if (selectionKeys.length) {
      const matrixMatch = variants.find((variant) => {
        const options = normalizeSellerVariantOptions(variant?.options);
        return Number(options?.bundleQty) === Number(opts.bundleQty)
          && selectionKeys.every((key) => String(options?.[key] || '') === String(opts[key]));
      });
      if (matrixMatch) return matrixMatch;
    }
    return variants.find(
      (variant) => Number(variant.options?.bundleQty) === Number(opts.bundleQty),
    ) || null;
  }

  const nonBulk = variants.filter((variant) => !isBulkBundleVariant(variant));
  if (!nonBulk.length) return null;

  const selectedKeys = Object.keys(opts).filter(
    (key) => !VARIANT_OPTION_META_KEYS.has(key)
      && key !== 'bundleQty'
      && opts[key] != null
      && String(opts[key]).trim() !== '',
  );

  if (!selectedKeys.length) return nonBulk[0] || null;

  return nonBulk.find((variant) => {
    const options = normalizeSellerVariantOptions(variant.options || {});
    return selectedKeys.every((key) => String(options[key] || '') === String(opts[key]));
  }) || null;
}

export function buildVariantStockDecrementQuery(productId, variant) {
  const query = { _id: productId };
  if (!variant?.options) return query;

  Object.entries(variant.options).forEach(([key, value]) => {
    if (VARIANT_OPTION_META_KEYS.has(key)) return;
    if (value == null || String(value).trim() === '') return;
    if (key === 'bundleQty') {
      query['variants.options.bundleQty'] = Number(value);
      return;
    }
    query[`variants.options.${key}`] = String(value);
  });

  return query;
}

export function findVariantBySelectedOptions(
  variants = [],
  selectedOptions = {},
  { isBulkBundleVariant = isBulkBundleVariantOption } = {},
) {
  return variants.find((variant) => {
    if (isBulkBundleVariant(variant)) return false;
    const options = normalizeSellerVariantOptions(variant.options || {});
    return Object.entries(selectedOptions).every(([key, value]) => {
      if (!value) return true;
      if (!options[key]) return true;
      return String(options[key]) === String(value);
    });
  }) || null;
}

export function findVariantForOptionValue(
  variants = [],
  selectedOptions = {},
  groupKey,
  value,
  { isBulkBundleVariant = isBulkBundleVariantOption } = {},
) {
  return variants.find((variant) => {
    if (isBulkBundleVariant(variant)) return false;
    const options = normalizeSellerVariantOptions(variant.options || {});
    if (String(options?.[groupKey] || '') !== String(value)) return false;

    return Object.entries(selectedOptions).every(([key, selectedValue]) => {
      if (key === groupKey) return true;
      if (!selectedValue) return true;
      if (!options?.[key]) return true;
      return String(options[key]) === String(selectedValue);
    });
  }) || null;
}

export function isVariantOptionValueAvailable(
  variants = [],
  selectedOptions = {},
  groupKey,
  value,
  { isBulkBundleVariant = isBulkBundleVariantOption } = {},
) {
  return variants.some((variant) => {
    if (isBulkBundleVariant(variant)) return false;
    if (String(variant.options?.[groupKey] || '') !== String(value)) return false;

    const matchesOtherSelections = Object.entries(selectedOptions).every(([key, selectedValue]) => {
      if (key === groupKey) return true;
      if (!selectedValue) return true;
      if (!variant.options?.[key]) return true;
      return String(variant.options[key]) === String(selectedValue);
    });

    return matchesOtherSelections && Number(variant.stock || 0) > 0;
  });
}

function resolveImageEntryUrl(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  if (typeof entry === 'object') {
    return String(entry.url || entry.src || entry.path || entry.data || '').trim();
  }
  return '';
}

function normalizeUrlForCompare(url = '') {
  return String(url || '').trim().split('?')[0].replace(/\/$/, '').toLowerCase();
}

function getUrlPathname(url = '') {
  const value = String(url || '').trim();
  if (!value) return '';
  try {
    return new URL(value).pathname.toLowerCase();
  } catch {
    return normalizeUrlForCompare(value);
  }
}

export function findMediaIndexByUrl(gallery = [], targetUrl = '') {
  const target = normalizeUrlForCompare(targetUrl);
  const targetPath = getUrlPathname(targetUrl);
  if (!target && !targetPath) return -1;

  return gallery.findIndex((item) => {
    const candidates = [item?.src, item?.poster].filter(Boolean);
    return candidates.some((candidate) => {
      const normalized = normalizeUrlForCompare(candidate);
      const pathname = getUrlPathname(candidate);
      return normalized === target
        || pathname === targetPath
        || (target && normalized.includes(target))
        || (target && target.includes(normalized));
    });
  });
}

export function getVariantOptionImage(variant, productImages = []) {
  if (!variant?.options) return null;

  const directImage = resolveImageEntryUrl(variant.options.image);
  if (directImage) return directImage;

  const slot = Number(variant.options.imageSlot);
  if (Number.isFinite(slot) && slot > 0 && productImages[slot - 1]) {
    return resolveImageEntryUrl(productImages[slot - 1]) || null;
  }

  return resolveImageEntryUrl(productImages[0]) || null;
}

/** Resolve gallery index for a variant's assigned image (URL match + imageSlot fallback). */
export function getVariantMediaIndex(variant, mediaGallery = [], productImages = []) {
  if (!variant?.options || !mediaGallery.length) return -1;

  const directImage = resolveImageEntryUrl(variant.options.image);
  if (directImage) {
    const byUrl = findMediaIndexByUrl(mediaGallery, directImage);
    if (byUrl >= 0) return byUrl;
  }

  const slot = Number(variant.options.imageSlot);
  if (Number.isFinite(slot) && slot > 0) {
    const slotUrl = resolveImageEntryUrl(productImages[slot - 1]);
    if (slotUrl) {
      const bySlotUrl = findMediaIndexByUrl(mediaGallery, slotUrl);
      if (bySlotUrl >= 0) return bySlotUrl;
    }

    const slotIndex = slot - 1;
    if (slotIndex >= 0 && slotIndex < mediaGallery.length) {
      return slotIndex;
    }
  }

  if (directImage) {
    return findMediaIndexByUrl(mediaGallery, directImage);
  }

  return -1;
}
