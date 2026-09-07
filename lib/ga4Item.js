import { lookupGa4CategoryName } from '@/lib/ga4CategoryLookup';

export const GA4_CURRENCY = 'AED';

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
  if (raw === 'cod' || raw.includes('cash')) return 'COD';
  if (raw === 'tabby') return 'Tabby';
  if (raw === 'tamara') return 'Tamara';
  if (['card', 'stripe', 'razorpay', 'upi', 'netbanking', 'online', 'prepaid'].includes(raw)) {
    return 'card';
  }
  if (raw === 'wallet') return 'wallet';
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

export function resolveGa4Category(source = {}, product = null) {
  const nested = isPopulatedProduct(source.productId) ? source.productId : null;
  const candidates = [
    source.categoryName,
    source.item_category,
    product?.categoryName,
    nested?.categoryName,
    typeof source.category === 'object' ? source.category?.name : source.category,
    typeof product?.category === 'object' ? product.category?.name : product?.category,
    typeof nested?.category === 'object' ? nested.category?.name : nested?.category,
    lookupGa4CategoryName(source.category),
    lookupGa4CategoryName(product?.category),
    lookupGa4CategoryName(nested?.category),
    Array.isArray(source.categories) ? source.categories[0] : '',
    Array.isArray(product?.categories) ? product.categories[0] : '',
  ];
  for (const candidate of candidates) {
    const text = stringifyId(candidate);
    if (text && !isLikelyObjectId(text)) return text;
  }
  return '';
}

export function resolveItemDiscount(source = {}, price = 0) {
  const explicit = Number(source.discount ?? source.discountAmount ?? 0);
  if (explicit > 0) return Number(explicit.toFixed(2));
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

/** GA4 item. item_id is the product SKU when present. */
export function productToGa4Item(source = {}, overrides = {}) {
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

  const category = stringifyId(overrides.item_category) || resolveGa4Category(source, product);
  if (category) item.item_category = category;

  const variant = stringifyId(overrides.item_variant)
    || formatItemVariant(overrides.variantOptions || source.variantOptions || source._variantOptions);
  if (variant) item.item_variant = variant;

  const discount = resolveItemDiscount({ ...product, ...source }, price);
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
