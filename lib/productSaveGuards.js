/**
 * Product save rules:
 * - Never auto-rewrite price from min(variant prices)
 * - Never silently clear bundles/variants after save
 * - Store owner can always change prices
 * - Team members need the Team Access checkbox "Change product prices"
 */

export function canChangeProductPricing(access = {}) {
  if (access?.isOwner || access?.accessRole === 'owner') return true;
  return access?.permissions?.changePricing === true;
}

function numbersDiffer(a, b) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) && !Number.isFinite(right)) return false;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return true;
  return Math.abs(left - right) > 0.0001;
}

function normalizeVariantOptionKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** Stable key so we can restore SKUs when the editor re-saves blank variant SKU fields. */
export function getVariantSkuMatchKey(variant = {}) {
  const opts = variant?.options && typeof variant.options === 'object' ? variant.options : {};
  const bundleRaw = opts.bundleQty;
  const bundleQty = bundleRaw === undefined || bundleRaw === null || bundleRaw === ''
    ? ''
    : String(Number(bundleRaw) || bundleRaw);
  return [
    normalizeVariantOptionKey(opts.color),
    normalizeVariantOptionKey(opts.size),
    normalizeVariantOptionKey(opts.option),
    normalizeVariantOptionKey(opts.optionLabel),
    normalizeVariantOptionKey(opts.title),
    bundleQty,
  ].join('|');
}

/**
 * Keep existing variant SKUs when the editor sends blank SKU fields
 * (matrix collapse/expand and partial forms used to wipe them).
 */
export function preserveIncomingVariantSkus(existingVariants = [], incomingVariants = []) {
  const incoming = Array.isArray(incomingVariants) ? incomingVariants : [];
  const existing = Array.isArray(existingVariants) ? existingVariants : [];
  if (!incoming.length || !existing.length) return incoming;

  const skuByKey = new Map();
  existing.forEach((variant) => {
    const sku = String(variant?.sku || '').trim();
    if (!sku) return;
    skuByKey.set(getVariantSkuMatchKey(variant), sku);
  });

  return incoming.map((variant) => {
    const incomingSku = String(variant?.sku || '').trim();
    if (incomingSku) return variant;
    const preserved = skuByKey.get(getVariantSkuMatchKey(variant));
    if (!preserved) return variant;
    return { ...variant, sku: preserved };
  });
}

function variantPriceSignature(variants = []) {
  return (Array.isArray(variants) ? variants : []).map((v) => ({
    price: Number(v?.price),
    AED: Number(v?.AED ?? v?.price),
  }));
}

export function productPricingWouldChange(existing = {}, next = {}) {
  if (numbersDiffer(existing.price, next.price)) return true;
  if (numbersDiffer(existing.AED, next.AED)) return true;

  const prevVariants = Array.isArray(existing.variants) ? existing.variants : [];
  const nextVariants = Array.isArray(next.variants) ? next.variants : prevVariants;
  if (prevVariants.length !== nextVariants.length) {
    // Structural change may include prices; treat as pricing change if any price present differs
    const prevSig = variantPriceSignature(prevVariants);
    const nextSig = variantPriceSignature(nextVariants);
    if (JSON.stringify(prevSig) !== JSON.stringify(nextSig)) return true;
  } else {
    for (let i = 0; i < prevVariants.length; i += 1) {
      if (numbersDiffer(prevVariants[i]?.price, nextVariants[i]?.price)) return true;
      if (numbersDiffer(prevVariants[i]?.AED ?? prevVariants[i]?.price, nextVariants[i]?.AED ?? nextVariants[i]?.price)) {
        return true;
      }
    }
  }
  return false;
}

function resolveVariantType(body = {}, existing = {}) {
  const fromBody = String(body?.attributes?.variantType || '').trim();
  if (fromBody) return fromBody;
  return String(existing?.attributes?.variantType || '').trim();
}

/**
 * Resolve variants + product price for UPDATE without automatic mutations.
 */
export function resolveProductUpdatePricing({
  existing = {},
  body = {},
  canChangePrice = false,
} = {}) {
  const existingVariants = Array.isArray(existing.variants) ? existing.variants : [];
  const existingHasVariants = Boolean(existing.hasVariants) && existingVariants.length > 0;
  const variantType = resolveVariantType(body, existing);
  const explicitSimple = variantType === 'simple';
  const requestedHasVariants = body.hasVariants !== undefined
    ? Boolean(body.hasVariants)
    : existingHasVariants;
  let incomingVariants = Array.isArray(body.variants) ? body.variants : null;

  // Bundles / matrix / variants must never save empty packs silently.
  if (requestedHasVariants) {
    if (!incomingVariants || incomingVariants.length === 0) {
      throw Object.assign(
        new Error('Cannot save with empty packs/variants. Add pack prices or keep the current pricing mode.'),
        { statusCode: 400, code: 'EMPTY_VARIANTS' },
      );
    }
  }

  // Clearing an existing bundle/variants requires an explicit Simple mode.
  if (existingHasVariants && (!requestedHasVariants || (incomingVariants && incomingVariants.length === 0))) {
    if (!explicitSimple) {
      throw Object.assign(
        new Error('Switch pricing mode to "Simple product" before removing packs/bundles. Automatic clearing is blocked.'),
        { statusCode: 400, code: 'VARIANT_CLEAR_BLOCKED' },
      );
    }
    if (!canChangePrice) {
      throw Object.assign(
        new Error('You do not have permission to change prices. Ask the store owner to enable Change product prices in Team Access.'),
        { statusCode: 403, code: 'PRICE_ADMIN_ONLY' },
      );
    }
  }

  let hasVariants = requestedHasVariants;
  let variants = existingVariants;

  if (explicitSimple && !requestedHasVariants) {
    hasVariants = false;
    variants = [];
  } else if (requestedHasVariants && incomingVariants) {
    hasVariants = true;
    variants = preserveIncomingVariantSkus(existingVariants, incomingVariants);
  } else if (!requestedHasVariants && !existingHasVariants) {
    hasVariants = false;
    variants = [];
  } else {
    // Keep existing structure — do not auto-change after save.
    hasVariants = existingHasVariants;
    variants = existingVariants;
  }

  const stockFallback = body.stockQuantity !== undefined
    ? Number(body.stockQuantity) || 0
    : Number(existing.stockQuantity) || 0;

  if (hasVariants && stockFallback > 0) {
    variants = variants.map((variant) => {
      const stock = Number(variant?.stock);
      if (Number.isFinite(stock) && stock > 0) return variant;
      return { ...variant, stock: stockFallback };
    });
  }

  // Price: never derive from Math.min(variants). Only manual values.
  let finalPrice = existing.price;
  let finalAED = existing.AED;

  const bodyPriceProvided = body.price !== undefined && body.price !== null && body.price !== '';
  const bodyAedProvided = body.AED !== undefined && body.AED !== null && body.AED !== '';

  if (canChangePrice) {
    if (bodyPriceProvided) finalPrice = Number(body.price);
    if (bodyAedProvided) finalAED = Number(body.AED);

    // If admin sets packs and did not type a base price, use first pack price only when creating structure.
    if (hasVariants && variants.length && !bodyPriceProvided) {
      const first = Number(variants[0]?.price);
      if (Number.isFinite(first) && first > 0 && !Number.isFinite(Number(existing.price))) {
        finalPrice = first;
      }
    }
    if (hasVariants && variants.length && !bodyAedProvided) {
      const first = Number(variants[0]?.AED ?? variants[0]?.price);
      if (Number.isFinite(first) && first > 0 && !Number.isFinite(Number(existing.AED))) {
        finalAED = first;
      }
    }
  } else {
    // Non-admin: keep all prices; allow non-price variant option edits by overlaying options/stock/sku only.
    if (hasVariants && incomingVariants && incomingVariants.length === existingVariants.length) {
      variants = preserveIncomingVariantSkus(
        existingVariants,
        incomingVariants.map((incoming, index) => {
          const prev = existingVariants[index] || {};
          return {
            ...incoming,
            price: prev.price,
            AED: prev.AED ?? prev.price,
          };
        }),
      );
    } else if (hasVariants && incomingVariants && incomingVariants.length !== existingVariants.length) {
      throw Object.assign(
        new Error('You do not have permission to change prices. Ask the store owner to enable Change product prices in Team Access.'),
        { statusCode: 403, code: 'PRICE_ADMIN_ONLY' },
      );
    }
    finalPrice = existing.price;
    finalAED = existing.AED;
  }

  const stocks = hasVariants
    ? variants.map((v) => Number(v.stock ?? 0)).filter((n) => Number.isFinite(n))
    : [];
  const inStock = hasVariants
    ? (stocks.some((s) => s > 0) || stockFallback > 0)
    : (body.stockQuantity !== undefined ? stockFallback > 0 : Boolean(existing.inStock));

  if (!hasVariants) {
    if (!Number.isFinite(Number(finalPrice)) || !Number.isFinite(Number(finalAED))) {
      throw Object.assign(new Error('Price and AED are required'), { statusCode: 400 });
    }
  }

  return {
    hasVariants,
    variants: hasVariants ? variants : [],
    finalPrice: Number(finalPrice),
    finalAED: Number(finalAED),
    inStock,
  };
}

/**
 * Create path: still needs prices, but do not force min(variant) overwrite when explicit price given.
 */
export function resolveProductCreatePricing(body = {}) {
  const hasVariants = Boolean(body.hasVariants);
  let variants = Array.isArray(body.variants) ? body.variants : [];
  const productStockFallback = Number(body.stockQuantity) || 0;

  if (hasVariants) {
    if (!variants.length) {
      throw Object.assign(
        new Error('Add at least one pack/variant with Qty and Price before saving.'),
        { statusCode: 400, code: 'EMPTY_VARIANTS' },
      );
    }
    if (productStockFallback > 0) {
      variants = variants.map((variant) => {
        const stock = Number(variant?.stock);
        if (Number.isFinite(stock) && stock > 0) return variant;
        return { ...variant, stock: productStockFallback };
      });
    }
  }

  let finalPrice = Number(body.price);
  let finalAED = Number(body.AED);

  // Use explicit prices only — if missing and variants exist, take first pack (manual pack prices), not Math.min.
  if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
    const first = Number(variants[0]?.price);
    if (Number.isFinite(first) && first > 0) finalPrice = first;
  }
  if (!Number.isFinite(finalAED) || finalAED <= 0) {
    const first = Number(variants[0]?.AED ?? variants[0]?.price);
    if (Number.isFinite(first) && first > 0) finalAED = first;
  }

  if (!Number.isFinite(finalPrice) || !Number.isFinite(finalAED)) {
    throw Object.assign(new Error('Price and AED are required'), { statusCode: 400 });
  }

  const stocks = hasVariants
    ? variants.map((v) => Number(v.stock ?? 0)).filter((n) => Number.isFinite(n))
    : [];
  const inStock = hasVariants
    ? (stocks.some((s) => s > 0) || productStockFallback > 0)
    : productStockFallback > 0;

  return {
    hasVariants,
    variants: hasVariants ? variants : [],
    finalPrice,
    finalAED,
    inStock,
  };
}
