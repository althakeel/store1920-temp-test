import Product from '@/models/Product';
import {
  getOrderLineItemDisplayName,
  getOrderLineProduct,
  isGenericProductName,
} from '@/lib/orderDisplay';

function getRawOrderLines(order = {}) {
  if (Array.isArray(order.orderItems) && order.orderItems.length) {
    return order.orderItems;
  }
  if (Array.isArray(order.items) && order.items.length) {
    return order.items;
  }
  return [];
}

function getLineProductId(item = {}) {
  if (item?.productId && typeof item.productId === 'object') {
    return String(item.productId?._id || item.productId?.id || '').trim();
  }
  return String(item?.productId || item?.id || '').trim();
}

/** Ensure order line items have product names before building a Waslah payload. */
export async function hydrateOrderForWaslah(order = {}) {
  const lines = getRawOrderLines(order).map((item) => ({ ...item }));
  if (!lines.length) {
    return { ...order, orderItems: [] };
  }

  const productIds = new Set();
  for (const item of lines) {
    const displayName = getOrderLineItemDisplayName(item, getOrderLineProduct(item));
    if (!isGenericProductName(displayName)) {
      item.name = displayName;
    }
    const productId = getLineProductId(item);
    if (productId) productIds.add(productId);
  }

  let productById = new Map();
  if (productIds.size) {
    const products = await Product.find({ _id: { $in: [...productIds] } })
      .select('name title sku hsCode originCountry shippingWeightKg price')
      .lean();
    productById = new Map(products.map((product) => [String(product._id), product]));
  }

  const orderItems = lines.map((item) => {
    const productId = getLineProductId(item);
    const hydratedProduct = productId ? productById.get(productId) : null;
    const product = hydratedProduct
      ? { ...getOrderLineProduct(item), ...hydratedProduct }
      : getOrderLineProduct(item);
    const name = getOrderLineItemDisplayName(item, product);
    return {
      ...item,
      name,
      ...(product ? { productId: { ...product, _id: product._id || productId } } : {}),
    };
  });

  return {
    ...order,
    orderItems,
  };
}
