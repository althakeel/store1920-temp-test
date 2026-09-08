import { ensureGa4CategoryCache, lookupGa4CategoryName, lookupGa4CategoryPath } from '@/lib/ga4CategoryLookup';

export const GA4_CURRENCY = 'AED';
export const UAE_VAT_RATE = 0.05;

function stringifyId(value) {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text || text === '[object Object]') return '';
  return text;
}

function isLikelyObjectId(value) {
  return /^[a-f0-9]{24}$/i.test(stringifyId(value));
}

function isPopulatedProduct(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && (value.name || value.sku || value.title || value.brand || value._id),
  );
}

export function toGa4PaymentType(method = '') {
  const raw = String(method || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'cod' || raw.includes('cash')) return 'cash_on_delivery';
  if (raw === 'tabby') return 'tabby';
  if (raw === 'tamara') return 'tamara';
  if ([
    'card',
    'stripe',
    'razorpay',
    'upi',
    'netbanking',
    'online',
    'prepaid',
    'wallet',
  ].includes(raw)) {
    return 'card';
  }
  return raw;
}

export function formatItemVariant(variantOptions) {
  if (!variantOptions || typeof variantOptions !== 'object') return '';
  return Object.entries(variantOptions)
    .filter(([key, value]) => (
      value != null
      && String(value).trim() !== ''
      && key !== 'bundleQty'
    ))
    .map(([key, value]) => `${key}: ${value}`)
    .join(' / ');
}

export function resolveGa4ItemId(source = {}, product = null) {
  const nested = isPopulatedProduct(source.productId) ? source.productId : null;
  const sku = stringifyId(
    source.sku
    || product?.sku
    || product?.zoho?.sku
    || nested?.sku
    || nested?.zoho?.sku,
  );
  if (sku) return sku;

  return stringifyId(
    source.item_id
    || source._productId
    || product?._id
    || product?.id
    || nested?._id
    || source._id
    || source.id
    || source.productId,
  );
}

function categoryRefValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    return value._id || value.id || value.name || value.slug || '';
  }
  return value;
}

export function resolveGa4CategoryLevels(source = {}, product = null) {
  const nested = isPopulatedProduct(source.productId) ? source.productId : null;
  const refs = [
    source.item_category,
    source.category,
    product?.category,
    nested?.category,
    source.categoryId,
    product?.categoryId,
    Array.isArray(source.categories) ? source.categories[0] : '',
    Array.isArray(product?.categories) ? product.categories[0] : '',
    Array.isArray(nested?.categories) ? nested.categories[0] : '',
    source.categoryName,
    product?.categoryName,
    nested?.categoryName,
  ];

  for (const ref of refs) {
    const path = lookupGa4CategoryPath(categoryRefValue(ref));
    if (path.length) return path;
    if (ref && typeof ref === 'object') {
      const name = stringifyId(ref.name);
      if (name && !isLikelyObjectId(name)) return [name];
    }
    const text = stringifyId(ref);
    if (text && !isLikelyObjectId(text)) {
      const fromName = lookupGa4CategoryPath(text);
      return fromName.length ? fromName : [text];
    }
  }
  return [];
}

export function resolveGa4Category(source = {}, product = null) {
  const levels = resolveGa4CategoryLevels(source, product);
  if (levels[0]) return levels[0];

  const nested = isPopulatedProduct(source.productId) ? source.productId : null;
  const candidates = [
    lookupGa4CategoryName(source.category),
    lookupGa4CategoryName(product?.category),
    lookupGa4CategoryName(nested?.category),
  ];
  for (const candidate of candidates) {
    const text = stringifyId(candidate);
    if (text && !isLikelyObjectId(text)) return text;
  }
  return '';
}

export function applyGa4ItemCategories(item = {}, source = {}, product = null) {
  const levels = resolveGa4CategoryLevels(source, product);
  item.item_category = levels[0] || stringifyId(item.item_category) || 'Uncategorized';
  if (levels[1]) item.item_category2 = levels[1];
  if (levels[2]) item.item_category3 = levels[2];
  return item;
}

export function resolveItemDiscount(source = {}, price = 0) {
  const amount = Number(source.discountAmount ?? source.unitDiscount ?? 0);
  if (amount > 0) return Number(amount.toFixed(2));
  const compare = Number(
    source.AED
    ?? source.mrp
    ?? source.compareAtPrice
    ?? source.originalPrice
    ?? source.regularPrice
    ?? 0,
  );
  if (compare > price && price > 0) return Number((compare - price).toFixed(2));
  return 0;
}

export function extractInclusiveVat(amount, rate = UAE_VAT_RATE) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0 || rate <= 0) return 0;
  return Number(((value * rate) / (1 + rate)).toFixed(2));
}

export function resolveGa4Tax(order = {}, goodsValue = 0) {
  const explicit = Number(
    order.tax
    ?? order.vat
    ?? order.taxAmount
    ?? order.vatAmount
    ?? order.invoiceTax
    ?? 0,
  );
  if (Number.isFinite(explicit) && explicit > 0) {
    return Number(explicit.toFixed(2));
  }
  return extractInclusiveVat(goodsValue);
}

export function sumGa4ItemsValue(items = []) {
  const total = (Array.isArray(items) ? items : []).reduce((sum, item) => (
    sum + (Number(item?.price || 0) * Number(item?.quantity || 0))
  ), 0);
  return Number(total.toFixed(2));
}

/** GA4 item. item_id is the product SKU when present. */
export function productToGa4Item(source = {}, overrides = {}) {
  if (typeof window !== 'undefined') ensureGa4CategoryCache();

  const product = isPopulatedProduct(source.productId) ? source.productId : source;
  const price = Number(
    overrides.price
    ?? source._cartPrice
    ?? source.unitPrice
    ?? source.price
    ?? product?.price
    ?? 0,
  );
  const quantity = Number(overrides.quantity ?? source._displayQuantity ?? source.quantity ?? source.qty ?? 1);
  const item = {
    item_id: stringifyId(overrides.item_id) || resolveGa4ItemId(source, product),
    item_name: stringifyId(
      overrides.item_name
      || source.name
      || source.productName
      || source.title
      || product?.name
      || product?.title,
    ) || 'Product',
    price,
    quantity: quantity > 0 ? quantity : 1,
  };

  const brand = stringifyId(overrides.item_brand || source.brand || product?.brand);
  if (brand) item.item_brand = brand;

  applyGa4ItemCategories(item, { ...product, ...source, ...overrides }, product);

  const variant = stringifyId(overrides.item_variant)
    || formatItemVariant(overrides.variantOptions || source.variantOptions || source._variantOptions);
  if (variant) item.item_variant = variant;

  const discount = Number(overrides.discount ?? resolveItemDiscount({ ...product, ...source }, price));
  if (discount > 0) item.discount = discount;

  const coupon = stringifyId(overrides.coupon || source.coupon?.code || source.coupon);
  if (coupon) item.coupon = coupon;

  return item;
}

export function inferItemListFromPath(pathname = '') {
  const path = String(pathname || '').split('?')[0];
  if (path === '/' || path === '') return { item_list_id: 'home', item_list_name: 'Home' };
  if (path.startsWith('/shop')) return { item_list_id: 'shop', item_list_name: 'Shop' };
  if (path.startsWith('/c/')) return { item_list_id: 'category', item_list_name: 'Category' };
  if (path.startsWith('/search')) return { item_list_id: 'search_results', item_list_name: 'Search results' };
  if (path.startsWith('/cart')) return { item_list_id: 'cart', item_list_name: 'Cart recommendations' };
  if (path.startsWith('/offers') || path.includes('clearance') || path.includes('under-')) {
    return { item_list_id: 'offers', item_list_name: 'Offers' };
  }
  if (path.includes('best-seller') || path.includes('top-selling') || path.includes('trending')) {
    return { item_list_id: 'bestsellers', item_list_name: 'Best sellers' };
  }
  if (path.startsWith('/product') || path.startsWith('/p/')) {
    return { item_list_id: 'related_products', item_list_name: 'Related products' };
  }
  return { item_list_id: path.replace(/^\//, '') || 'catalog', item_list_name: 'Product list' };
}
