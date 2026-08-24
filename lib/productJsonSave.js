import Product from '@/models/Product';
import Store from '@/models/Store';
import { invalidateStorefrontProductCaches } from '@/lib/cache';
import { sanitizeCategoryIdsForSave } from '@/lib/productCategoryRefs';
import {
  resolveProductCreatePricing,
  resolveProductUpdatePricing,
} from '@/lib/productSaveGuards';

function slugifyInput(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function parseList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
  }
  const raw = String(value || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return Array.from(new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean)));
    }
  } catch {}
  return Array.from(new Set(raw.split(',').map((item) => item.trim()).filter(Boolean)));
}

function parseSpecTableColumns(value) {
  if (value == null) return ['Property', 'Value'];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) {
      const normalized = parsed.map((item) => String(item || '').trim()).filter(Boolean);
      return normalized.length > 0 ? normalized : ['Property', 'Value'];
    }
  } catch {}
  return ['Property', 'Value'];
}

function parseSpecTableRows(value, columnCount) {
  if (value == null) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!Array.isArray(row)) return null;
        return Array.from({ length: columnCount }, (_, idx) => String(row[idx] || '').trim());
      })
      .filter((row) => Array.isArray(row) && row.some((cell) => cell.length > 0));
  } catch {
    return [];
  }
}

function normalizeCategories(body = {}) {
  if (Array.isArray(body.categories) && body.categories.length > 0) {
    return sanitizeCategoryIdsForSave(body.categories);
  }
  if (body.category) return sanitizeCategoryIdsForSave([body.category]);
  return [];
}

export async function createProductFromJson(body, storeId) {
  const name = String(body?.name || '').trim();
  const description = String(body?.description || '').trim();
  const images = Array.isArray(body?.images) ? body.images.filter(Boolean) : [];
  const categories = normalizeCategories(body);

  if (!name || !description || images.length < 1) {
    throw new Error('Missing product details');
  }
  if (!categories.length) {
    throw new Error('At least one category is required');
  }

  let slug = slugifyInput(body?.slug || name);
  const existing = await Product.findOne({ slug }).select('_id').lean();
  if (existing) {
    throw new Error('Slug already exists. Please use a different slug.');
  }

  const attributes = typeof body.attributes === 'object' && body.attributes ? body.attributes : {};
  const { hasVariants, variants, finalPrice, finalAED, inStock } = resolveProductCreatePricing(body);
  const specTableColumns = parseSpecTableColumns(body.specTableColumns);
  const specTableRows = parseSpecTableRows(body.specTableRows, specTableColumns.length);

  const product = await Product.create({
    name,
    nameAr: body.nameAr || '',
    slug,
    brand: body.brand || '',
    brandAr: body.brandAr || '',
    description,
    descriptionAr: body.descriptionAr || '',
    shortDescription: body.shortDescription || attributes.shortDescription || '',
    shortDescriptionAr: body.shortDescriptionAr || '',
    shortDescription2: body.shortDescription2 || '',
    aPlusDesktop: body.aPlusDesktop || '',
    aPlusMobile: body.aPlusMobile || '',
    aPlusDesktopAr: body.aPlusDesktopAr || '',
    aPlusMobileAr: body.aPlusMobileAr || '',
    aPlusDesktopImages: parseList(body.aPlusDesktopImages),
    aPlusMobileImages: parseList(body.aPlusMobileImages),
    specTableEnabled: Boolean(body.specTableEnabled),
    specTableColumns,
    specTableRows,
    AED: finalAED,
    price: finalPrice,
    category: categories[0],
    categories,
    sku: body.sku || null,
    images,
    hasVariants,
    variants,
    attributes,
    inStock,
    published: body.published !== false,
    fastDelivery: Boolean(body.fastDelivery),
    freeShippingEligible: Boolean(body.freeShippingEligible),
    hsCode: String(body.hsCode || '').trim(),
    originCountry: String(body.originCountry || '').trim().toUpperCase(),
    shippingWeightKg: Math.max(0, Number(body.shippingWeightKg) || 0),
    useProductsPath: Boolean(body.useProductsPath),
    imageAspectRatio: body.imageAspectRatio || '1:1',
    cardVideoPreviewEnabled: body.cardVideoPreviewEnabled !== false,
    cardVideoPreviewDelaySec: Math.min(120, Math.max(0, Number(body.cardVideoPreviewDelaySec) || 24)),
    tags: parseList(body.tags),
    seoTitle: String(body.seoTitle || '').trim(),
    seoDescription: String(body.seoDescription || '').trim(),
    seoKeywords: parseList(body.seoKeywords),
    stockQuantity: Number(body.stockQuantity) || 0,
    soldCount: Math.max(0, Number(body.soldCount) || 0),
    storeId,
  });

  await Store.findByIdAndUpdate(storeId, {
    $addToSet: { featuredProductIds: String(product._id) },
  });
  invalidateStorefrontProductCaches();

  return product;
}

export async function updateProductFromJson(body, storeId, options = {}) {
  const productId = String(body?.productId || '').trim();
  if (!productId.match(/^[a-fA-F0-9]{24}$/)) {
    throw new Error('Product ID required or invalid format');
  }

  const product = await Product.findById(productId)
    .select('_id storeId name slug sku price AED images variants attributes inStock shortDescription shortDescriptionAr shortDescription2 specTableEnabled specTableColumns specTableRows imageAspectRatio categories category hasVariants freeShippingEligible useProductsPath fastDelivery stockQuantity cardVideoPreviewEnabled cardVideoPreviewDelaySec')
    .lean();

  if (!product || String(product.storeId) !== String(storeId)) {
    throw new Error('Not authorized');
  }

  const canChangePrice = Boolean(options.canChangePrice);
  const categories = normalizeCategories(body);
  const finalCategories = categories.length > 0 ? categories : (product.categories || []);
  const images = Array.isArray(body?.images) ? body.images.filter(Boolean) : product.images;
  const attributes = {
    ...(product.attributes || {}),
    ...(typeof body.attributes === 'object' && body.attributes ? body.attributes : {}),
  };
  // Always honor an explicit pricing-mode flag from the editor.
  if (body.attributes && Object.prototype.hasOwnProperty.call(body.attributes, 'variantType')) {
    const nextType = String(body.attributes.variantType || '').trim();
    if (nextType) {
      attributes.variantType = nextType;
    } else {
      delete attributes.variantType;
    }
  }

  const {
    hasVariants,
    variants,
    finalPrice,
    finalAED,
    inStock,
  } = resolveProductUpdatePricing({
    existing: product,
    body: { ...body, attributes },
    canChangePrice,
  });

  const specTableColumns = body.specTableColumns !== undefined
    ? parseSpecTableColumns(body.specTableColumns)
    : (product.specTableColumns || ['Property', 'Value']);
  const specTableRows = body.specTableRows !== undefined
    ? parseSpecTableRows(body.specTableRows, specTableColumns.length)
    : (product.specTableRows || []);

  let slug = body.slug !== undefined ? slugifyInput(body.slug) : product.slug;
  if (slug && slug !== product.slug) {
    const existing = await Product.findOne({ slug }).select('_id').lean();
    if (existing && String(existing._id) !== productId) {
      throw new Error('Slug already exists. Please use a different slug.');
    }
  }

  const nextSkuRaw = body.sku !== undefined ? String(body.sku ?? '').trim() : null;
  // SKU is seller-managed only. Ignore AI/import payloads unless skuManual is set,
  // and never wipe an existing SKU with a blank value.
  const shouldUpdateSku = Boolean(body.skuManual)
    && nextSkuRaw !== null
    && Boolean(nextSkuRaw);

  const updateData = {
    name: body.name ?? product.name,
    ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}),
    description: body.description ?? product.description,
    ...(body.descriptionAr !== undefined ? { descriptionAr: body.descriptionAr } : {}),
    shortDescription: body.shortDescription ?? product.shortDescription,
    shortDescriptionAr: body.shortDescriptionAr ?? product.shortDescriptionAr,
    shortDescription2: body.shortDescription2 ?? product.shortDescription2,
    ...(body.aPlusDesktop !== undefined ? { aPlusDesktop: body.aPlusDesktop } : {}),
    ...(body.aPlusMobile !== undefined ? { aPlusMobile: body.aPlusMobile } : {}),
    ...(body.aPlusDesktopAr !== undefined ? { aPlusDesktopAr: body.aPlusDesktopAr } : {}),
    ...(body.aPlusMobileAr !== undefined ? { aPlusMobileAr: body.aPlusMobileAr } : {}),
    ...(body.aPlusDesktopImages !== undefined ? { aPlusDesktopImages: parseList(body.aPlusDesktopImages) } : {}),
    ...(body.aPlusMobileImages !== undefined ? { aPlusMobileImages: parseList(body.aPlusMobileImages) } : {}),
    specTableEnabled: body.specTableEnabled !== undefined ? Boolean(body.specTableEnabled) : product.specTableEnabled,
    specTableColumns,
    specTableRows,
    ...(body.brand !== undefined ? { brand: body.brand } : {}),
    ...(body.brandAr !== undefined ? { brandAr: body.brandAr } : {}),
    AED: finalAED,
    price: finalPrice,
    category: finalCategories[0],
    categories: finalCategories,
    ...(shouldUpdateSku ? { sku: nextSkuRaw } : {}),
    images,
    hasVariants,
    variants,
    attributes,
    inStock,
    fastDelivery: body.fastDelivery !== undefined ? Boolean(body.fastDelivery) : product.fastDelivery,
    freeShippingEligible: body.freeShippingEligible !== undefined ? Boolean(body.freeShippingEligible) : product.freeShippingEligible,
    ...(body.hsCode !== undefined ? { hsCode: String(body.hsCode || '').trim() } : {}),
    ...(body.originCountry !== undefined ? { originCountry: String(body.originCountry || '').trim().toUpperCase() } : {}),
    ...(body.shippingWeightKg !== undefined ? { shippingWeightKg: Math.max(0, Number(body.shippingWeightKg) || 0) } : {}),
    useProductsPath: body.useProductsPath !== undefined ? Boolean(body.useProductsPath) : product.useProductsPath,
    imageAspectRatio: body.imageAspectRatio || product.imageAspectRatio || '1:1',
    cardVideoPreviewEnabled: body.cardVideoPreviewEnabled !== undefined ? Boolean(body.cardVideoPreviewEnabled) : product.cardVideoPreviewEnabled !== false,
    cardVideoPreviewDelaySec: body.cardVideoPreviewDelaySec !== undefined
      ? Math.min(120, Math.max(0, Number(body.cardVideoPreviewDelaySec) || 24))
      : (Number(product.cardVideoPreviewDelaySec) || 24),
    tags: body.tags !== undefined ? parseList(body.tags) : undefined,
    seoTitle: body.seoTitle !== undefined ? String(body.seoTitle || '').trim() : undefined,
    seoDescription: body.seoDescription !== undefined ? String(body.seoDescription || '').trim() : undefined,
    seoKeywords: body.seoKeywords !== undefined ? parseList(body.seoKeywords) : undefined,
  };

  // Only update stock when a real number is provided (not '' / NaN). Explicit 0 is allowed.
  if (body.stockQuantity !== undefined && body.stockQuantity !== null && body.stockQuantity !== '') {
    const stockNum = Number(body.stockQuantity);
    if (Number.isFinite(stockNum)) {
      updateData.stockQuantity = Math.max(0, stockNum);
    }
  }
  if (body.soldCount !== undefined) {
    updateData.soldCount = Math.max(0, Number(body.soldCount) || 0);
  }
  if (slug && slug !== product.slug) {
    updateData.slug = slug;
  }

  Object.keys(updateData).forEach((key) => {
    if (updateData[key] === undefined) delete updateData[key];
  });

  const updated = await Product.findByIdAndUpdate(productId, updateData, { new: true }).lean();
  invalidateStorefrontProductCaches();
  return updated;
}
