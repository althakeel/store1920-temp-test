import { resolveCartLinePricing } from '@/lib/bulkBundleCart';
import { getRepairedBundleOrderLine } from '@/lib/bundleOrderRepair';
import { getOrderLineProduct } from '@/lib/orderDisplay';
import {
  resolveOrderLineBundleUnits,
  resolveOrderLineLineTotal,
  resolveOrderLineName,
  resolveOrderLinePackQuantity,
  resolveOrderLinePrice,
  resolveOrderLineQuantity,
} from '@/lib/gtmEcommerceHelpers';
import { formatVariantOptionsLabel } from '@/lib/productVariantOptions';

function abandonedCartAsOrder(cart = {}) {
  const items = Array.isArray(cart.items) ? cart.items : [];
  return {
    orderItems: items,
    total: cart.cartTotal,
    coupon: cart.coupon,
    shippingFee: cart.shippingFee,
    discount: cart.discount,
  };
}

function resolveAbandonedLineProduct(item = {}, productMap = null) {
  if (productMap) {
    const fromMap = productMap.get(String(item.productId));
    if (fromMap) return fromMap;
  }
  return getOrderLineProduct(item);
}

/** Lines for abandoned-checkout dashboard and recovery totals. */
export function getAbandonedCartDisplayItems(cart = {}, productMap = null) {
  const items = Array.isArray(cart.items) ? cart.items : [];
  const orderCtx = abandonedCartAsOrder(cart);

  return items.map((item, index) => {
    const product = resolveAbandonedLineProduct(item, productMap);
    const repaired = getRepairedBundleOrderLine(item, product, orderCtx) || item;
    const name = resolveOrderLineName(repaired, product) || repaired?.name || '';
    const price = resolveOrderLinePrice(repaired);
    const packQuantity = resolveOrderLinePackQuantity(repaired, product, orderCtx);
    const bundleUnits = resolveOrderLineBundleUnits(repaired, product, orderCtx);
    const quantity = resolveOrderLineQuantity(repaired, product, orderCtx);

    return {
      ...repaired,
      productId: product?._id || repaired.productId,
      name: name || `Item ${index + 1}`,
      price,
      quantity,
      packQuantity,
      bundleUnits,
      lineTotal: resolveOrderLineLineTotal(repaired, product, orderCtx),
      isBulkBundle: bundleUnits > 0,
      imageUrl: repaired.imageUrl || repaired.image || product?.images?.[0] || '',
      variantLabel: formatVariantOptionsLabel(
        repaired?.variantOptions || (bundleUnits > 0 ? { bundleQty: bundleUnits } : null),
      ),
    };
  }).filter((item) => item.quantity > 0 && (item.name || item.productId || item.price > 0));
}

export function sumAbandonedCartItemsTotal(cart = {}, productMap = null) {
  return getAbandonedCartDisplayItems(cart, productMap)
    .reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
}

/** Normalize client payload before saving to AbandonedCart. */
export function normalizeAbandonedCartItemFromClient(item = {}, product = null) {
  const qty = Math.max(1, Number(item.quantity) || 1);
  const entry = {
    ...(typeof item === 'object' ? item : {}),
    variantOptions: item.variantOptions || null,
    price: item.price,
    quantity: qty,
  };

  const pricing = resolveCartLinePricing(product, entry, qty);
  const variantOptions = pricing.isBulkBundle
    ? { ...(item.variantOptions || {}), bundleQty: pricing.bundleTier }
    : (item.variantOptions || null);

  return {
    productId: String(item.productId),
    name: item.name || product?.name || 'Product',
    quantity: qty,
    price: pricing.unitPrice,
    lineTotal: pricing.lineTotal,
    variantOptions,
    imageUrl: item.imageUrl || '',
    isFreeGift: Boolean(item.isFreeGift),
  };
}

/** Build abandoned-cart items from a pending/failed order. */
export function buildAbandonedItemsFromOrder(order = {}) {
  const orderCtx = order;

  return (order.orderItems || []).map((item) => {
    const product = item?.productId && typeof item.productId === 'object' ? item.productId : null;
    const repaired = getRepairedBundleOrderLine(item, product, orderCtx) || item;

    return {
      productId: product?._id || item.productId,
      name: product?.name || item.name || 'Product',
      quantity: resolveOrderLinePackQuantity(repaired, product, orderCtx),
      price: resolveOrderLinePrice(repaired),
      lineTotal: resolveOrderLineLineTotal(repaired, product, orderCtx),
      variantOptions: repaired.variantOptions || null,
      imageUrl: product?.images?.[0] || item.image || '',
    };
  }).filter((item) => item.productId);
}
