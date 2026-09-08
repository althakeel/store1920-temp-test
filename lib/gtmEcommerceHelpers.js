import { toGtmItem } from '@/lib/pushGtmEcommerceEvent';
import { inferOrderLineBundleQty, inferBundleUnitsFromOrderContext } from '@/lib/bulkBundleCart';
import { applyGa4ItemCategories, formatItemVariant, resolveGa4Category } from '@/lib/ga4Item';

function parseMaybeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isPopulatedProduct(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && (value.name || value.sku || value.title || Array.isArray(value.images) || value._id),
  );
}

function stringifyId(value) {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text || text === '[object Object]') return '';
  return text;
}

export function resolveOrderLineItems(order = {}) {
  const orderItems = Array.isArray(order.orderItems) ? order.orderItems : [];
  const legacyItems = parseMaybeJsonArray(order.items);

  if (orderItems.length > 0) return orderItems;
  return legacyItems;
}

export function resolveOrderLineProduct(item = {}) {
  const raw = item.productId;
  return isPopulatedProduct(raw) ? raw : null;
}

export function resolveOrderLineProductId(item = {}, product = null) {
  const fromProduct = stringifyId(product?._id || product?.id);
  if (fromProduct) return fromProduct;

  const raw = item.productId;
  if (raw && typeof raw === 'object') {
    const nested = stringifyId(raw._id || raw.id);
    if (nested) return nested;
    const asObjectId = stringifyId(raw);
    if (asObjectId) return asObjectId;
  }

  return stringifyId(raw || item.id || item._id || item.product_id || item.item_id || item.itemId);
}

export function resolveOrderLineItemId(item = {}, index = 0, product = null) {
  const candidates = [
    item.sku,
    product?.sku,
    product?.zoho?.sku,
    resolveOrderLineProductId(item, product),
    item.item_id,
    item.itemId,
    item.id,
    item._id,
  ];

  for (const candidate of candidates) {
    const id = stringifyId(candidate);
    if (id) return id;
  }

  return `line-${index + 1}`;
}

export function resolveOrderLineName(item = {}, product = null) {
  const candidates = [
    item?.name,
    item?.productName,
    item?.title,
    product?.name,
    product?.title,
    typeof item?.productId === 'object' ? item.productId?.name : null,
  ];

  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (!text) continue;
    const normalized = text.toLowerCase();
    if (normalized === 'product' || normalized === 'unnamed product') continue;
    return text;
  }

  return 'Product';
}

export function resolveOrderLinePrice(item = {}) {
  return Number(item.price ?? item.unitPrice ?? item.salePrice ?? item.lineTotal ?? 0);
}

export function resolveOrderLinePackQuantity(item = {}, product = null, order = null) {
  const raw = Math.max(1, Number(item.quantity ?? item.qty ?? 1));
  const bundleUnits = resolveOrderLineBundleUnits(item, product, order);
  if (bundleUnits <= 0) return raw;

  // Older orders/edit forms sometimes stored bundle size (3) instead of pack count (1).
  if (raw === bundleUnits) return 1;
  if (raw > bundleUnits && raw % bundleUnits === 0) return raw / bundleUnits;
  return raw;
}

export function resolveOrderLineBundleUnits(item = {}, product = null, order = null) {
  const fromOptions = Number(item?.variantOptions?.bundleQty);
  if (fromOptions > 0) return fromOptions;

  if (product && Object.keys(product).length) {
    const inferred = inferOrderLineBundleQty(item, product);
    if (inferred > 0) return inferred;
  }

  if (order) {
    return inferBundleUnitsFromOrderContext(item, order);
  }

  return 0;
}

export function resolveOrderLineQuantity(item = {}, product = null, order = null) {
  const bundleUnits = resolveOrderLineBundleUnits(item, product, order);
  const packs = resolveOrderLinePackQuantity(item, product, order);
  if (bundleUnits > 0) return bundleUnits * packs;
  return packs;
}

export function resolveOrderLineLineTotal(item = {}, product = null, order = null) {
  return resolveOrderLinePrice(item) * resolveOrderLinePackQuantity(item, product, order);
}

export function cartLinesToGtmItems(cartLines = []) {
  return cartLines
    .filter((item) => item && !item._isFreeGift)
    .map((item) => toGtmItem(item, {
      price: Number(item._cartPrice ?? item.price ?? 0),
      quantity: Number(item._displayQuantity ?? item.quantity ?? 1),
    }))
    .filter((item) => item.item_id && item.quantity > 0);
}

export function cartLinesToMetaItems(cartLines = []) {
  return cartLinesToGtmItems(cartLines).map((item) => ({
    productId: item.item_id,
    id: item.item_id,
    quantity: item.quantity,
    price: item.price,
  }));
}

export function orderItemsToGtmItems(orderItems = [], order = null) {
  return (Array.isArray(orderItems) ? orderItems : [])
    .map((item, index) => {
      if (!item) return null;

      const product = resolveOrderLineProduct(item);
      const itemId = resolveOrderLineItemId(item, index, product);
      const quantity = resolveOrderLineQuantity(item, product, order);
      const price = resolveOrderLinePrice(item);
      const category = resolveGa4Category(item, product);
      const brand = item.brand || product?.brand || '';
      const variant = formatItemVariant(item.variantOptions);

      const gtmItem = toGtmItem(item, {
        item_id: itemId,
        item_name: resolveOrderLineName(item, product),
        price,
        quantity,
        item_variant: variant,
      });

      applyGa4ItemCategories(gtmItem, item, product);
      if (category && !gtmItem.item_category) gtmItem.item_category = String(category);
      if (brand) gtmItem.item_brand = String(brand);
      if (variant) gtmItem.item_variant = variant;

      return gtmItem;
    })
    .filter((item) => item && item.item_id && item.quantity > 0);
}

export function resolvePurchaseTransactionId(order = {}) {
  const shortNumber = order.shortOrderNumber ?? order.orderNumber;
  if (shortNumber != null && String(shortNumber).trim()) {
    return String(shortNumber).trim();
  }
  const id = order._id || order.id;
  return id ? String(id) : '';
}
