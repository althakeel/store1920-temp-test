import { addToCart, deleteItemFromCart, removeFromCart } from '@/lib/features/cart/cartSlice';
import { trackProductAddToCart } from '@/lib/ecommerceTracking';
import { pushGtmEcommerceEvent } from '@/lib/pushGtmEcommerceEvent';
import { GTM_EVENTS } from '@/lib/gtmEvents';
import { GA4_CURRENCY, productToGa4Item } from '@/lib/ga4Item';
import { STORE_CURRENCY } from '@/lib/storeCurrency';

export function incrementCartItem(dispatch, { productId, entry, product, price, maxQty }) {
  const quantity = typeof entry === 'number' ? entry : entry?.quantity || 0;
  const normalizedMaxQty = typeof maxQty === 'number' ? Math.max(0, maxQty) : null;
  if (normalizedMaxQty !== null && quantity >= normalizedMaxQty) return false;

  const unitPrice = Number(typeof entry === 'object' ? entry?.price : price)
    || Number(product?._cartPrice ?? product?.price ?? 0);
  const variantOptions = typeof entry === 'object' ? entry?.variantOptions : product?.variantOptions;

  trackProductAddToCart({
    product,
    productId,
    name: product?.name || (typeof entry === 'object' ? entry?.productName : null) || 'Product',
    price: unitPrice,
    quantity: 1,
    currency: STORE_CURRENCY,
    variantOptions,
  });

  dispatch(addToCart({
    productId,
    price: typeof entry === 'object' ? entry?.price : price,
    maxQty: normalizedMaxQty,
    variantOptions: typeof entry === 'object' ? entry?.variantOptions : undefined,
    offerToken: typeof entry === 'object' ? entry?.offerToken : undefined,
    discountPercent: typeof entry === 'object' ? entry?.discountPercent : undefined,
  }));
  return true;
}

export function decrementCartItem(dispatch, { productId, entry, product }) {
  const quantity = typeof entry === 'number' ? entry : entry?.quantity || 0;
  const unitPrice = Number(
    typeof entry === 'object' ? entry?.price : null,
  ) || Number(product?._cartPrice ?? product?.price ?? 0);
  const variantOptions = typeof entry === 'object' ? entry?.variantOptions : product?.variantOptions;

  if (typeof window !== 'undefined' && (product || productId)) {
    pushGtmEcommerceEvent(GTM_EVENTS.REMOVE_FROM_CART, {
      currency: GA4_CURRENCY,
      value: unitPrice,
      items: [productToGa4Item(product || { _id: productId }, {
        price: unitPrice,
        quantity: 1,
        variantOptions,
      })],
    });
  }

  if (quantity <= 1) {
    dispatch(deleteItemFromCart({ productId }));
    return true;
  }

  dispatch(removeFromCart({ productId }));
  return true;
}
