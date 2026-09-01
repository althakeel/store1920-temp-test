export function escapeRegex(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Trim and normalize user search input (strip common SKU prefixes). */
export function normalizeSearchKeyword(value = '') {
  return String(value || '')
    .trim()
    .replace(/^(sku|item|product|code|#)\s*[:#]?\s*/i, '')
    .replace(/\s+/g, ' ');
}

/** Match SKUs even when dashes/spaces differ (WH-1000 vs WH1000). */
export function buildFlexibleSkuRegex(value = '') {
  const compact = String(value || '').replace(/[\s\-_./#]/g, '');
  if (!compact || compact.length < 2) return null;

  const alnum = compact.replace(/[^a-z0-9]/gi, '');
  if (alnum.length < 2) return null;

  const pattern = alnum
    .split('')
    .map((ch) => escapeRegex(ch))
    .join('[\\s\\-_.#/]*');

  return new RegExp(pattern, 'i');
}

/**
 * Title-focused matchers only.
 * Do not search description / SEO / tags — those pull unrelated products
 * whose displayed title does not match what the shopper typed.
 */
function buildSearchFieldMatchers(term = '') {
  const normalized = String(term || '').trim();
  if (!normalized) return [];

  const termRegex = new RegExp(escapeRegex(normalized), 'i');
  const skuFlexible = buildFlexibleSkuRegex(normalized);

  const matchers = [
    { name: termRegex },
    { nameAr: termRegex },
    { sku: termRegex },
    { slug: termRegex },
    { brand: termRegex },
    { brandAr: termRegex },
    { 'variants.sku': termRegex },
    { 'variants.name': termRegex },
    { 'variants.title': termRegex },
  ];

  if (skuFlexible) {
    matchers.push(
      { sku: skuFlexible },
      { 'variants.sku': skuFlexible },
    );
  }

  return matchers;
}

export function buildProductSearchFilter(keyword, { includeOutOfStock = false } = {}) {
  const normalized = normalizeSearchKeyword(keyword);
  if (!normalized) return null;

  const words = normalized.split(' ').filter(Boolean);
  const strategies = [];

  // Every word must match in title / brand / SKU (not description).
  if (words.length > 1) {
    strategies.push({
      $and: words.map((word) => ({ $or: buildSearchFieldMatchers(word) })),
    });
  }

  // Full phrase / single-token match (helps SKUs, brand names, exact titles).
  strategies.push({ $or: buildSearchFieldMatchers(normalized) });

  const filter = strategies.length === 1
    ? strategies[0]
    : { $or: strategies };

  if (!includeOutOfStock) {
    filter.inStock = true;
  }

  filter.published = { $ne: false };

  return filter;
}

/** Merge category slug/id/name matches into an existing search filter. */
export function mergeCategorySearchIntoFilter(filter, categoryValues = []) {
  const values = [...new Set(
    (Array.isArray(categoryValues) ? categoryValues : [])
      .map((value) => (value != null ? String(value).trim() : ''))
      .filter(Boolean),
  )];

  if (!values.length || !filter) return filter;

  const categoryClause = {
    $or: [
      { category: { $in: values } },
      { categories: { $in: values } },
    ],
  };

  if (filter.$or && Array.isArray(filter.$or)) {
    return { ...filter, $or: [...filter.$or, categoryClause] };
  }

  return { $or: [filter, categoryClause] };
}

export const PRODUCT_SEARCH_SELECT_FIELDS =
  '_id name nameAr slug images price mrp AED category categories tags inStock sku brand brandAr seoTitle variants stockQuantity fastDelivery createdAt';

/** True when the product title / brand / SKU actually contains the keyword. */
export function productTitleMatchesKeyword(product = {}, keyword = '') {
  const normalized = normalizeSearchKeyword(keyword).toLowerCase();
  if (!normalized) return false;

  const haystack = [
    product.name,
    product.nameAr,
    product.brand,
    product.brandAr,
    product.sku,
    product.slug,
    ...(Array.isArray(product.variants)
      ? product.variants.flatMap((variant) => [variant?.sku, variant?.name, variant?.title])
      : []),
  ]
    .map((value) => String(value || '').toLowerCase())
    .filter(Boolean)
    .join(' ');

  if (!haystack) return false;

  const words = normalized.split(' ').filter(Boolean);
  if (words.length > 1) {
    return words.every((word) => haystack.includes(word));
  }
  return haystack.includes(normalized);
}

/** Prefer products whose English/Arabic title starts with or contains the phrase. */
export function rankProductsByTitleMatch(products = [], keyword = '') {
  const normalized = normalizeSearchKeyword(keyword).toLowerCase();
  if (!normalized || !Array.isArray(products) || !products.length) return products;

  const score = (product) => {
    const name = String(product?.name || '').toLowerCase();
    const nameAr = String(product?.nameAr || '').toLowerCase();
    const sku = String(product?.sku || '').toLowerCase();
    if (name === normalized || nameAr === normalized || sku === normalized) return 0;
    if (name.startsWith(normalized) || nameAr.startsWith(normalized)) return 1;
    if (name.includes(normalized) || nameAr.includes(normalized)) return 2;
    if (sku.includes(normalized)) return 3;
    return 4;
  };

  return [...products].sort((left, right) => score(left) - score(right));
}

export function mapSearchProduct(product) {
  return {
    _id: product._id,
    slug: product.slug,
    name: product.name,
    nameAr: product.nameAr || '',
    sku: product.sku || '',
    brand: product.brand || '',
    image: product.images?.[0] || '',
    images: product.images || [],
    price: product.price,
    mrp: product.mrp,
    AED: product.AED,
    category: product.category,
    categories: product.categories,
    inStock: product.inStock !== false,
    tags: product.tags || [],
    variants: product.variants || [],
  };
}
