/**
 * Sale / regular / % off helpers for cart line items and summary.
 * Mirrors ProductCard pricing fields so cart matches storefront cards.
 */

function parseAmount(value) {
  const num = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

/** Selling (sale) unit amount from product catalog fields. */
export function getCatalogSaleUnit(product) {
  return parseAmount(
    product?.salePrice ?? product?.sale_price
    ?? product?.discountedPrice ?? product?.discounted_price
    ?? product?.sellingPrice ?? product?.selling_price
    ?? product?.offerPrice ?? product?.offer_price
    ?? product?.currentPrice ?? product?.current_price
    ?? product?.price,
  );
}

/** Regular / compare-at unit amount from product catalog fields. */
export function getCatalogRegularUnit(product) {
  return parseAmount(
    product?.AED
    ?? product?.compareAtPrice ?? product?.compare_at_price
    ?? product?.originalPrice ?? product?.original_price
    ?? product?.listPrice ?? product?.list_price
    ?? product?.basePrice ?? product?.base_price
    ?? product?.regularPrice ?? product?.regular_price
    ?? product?.mrp,
  );
}

export function getExplicitDiscountPercent(product) {
  return parseAmount(
    product?.discountPercent ?? product?.discount_percent
    ?? product?.discountPercentage ?? product?.discount_percentage
    ?? product?.discount,
  );
}

/**
 * Resolve sale unit, regular unit, and % off for a cart line.
 * Prefers cart-resolved unit price (_cartPrice) as the sale amount.
 */
export function resolveCartLinePriceDisplay(item) {
  if (!item || item._isFreeGift) {
    return {
      saleUnit: 0,
      regularUnit: 0,
      discountPercent: 0,
      saleLineTotal: 0,
      regularLineTotal: 0,
      discountAmount: 0,
      hasDiscount: false,
    };
  }

  const packQty = Math.max(1, Number(item.quantity) || 1);
  let saleUnit = parseAmount(item._cartPrice ?? item.price);
  if (saleUnit <= 0) saleUnit = getCatalogSaleUnit(item);

  let regularUnit = getCatalogRegularUnit(item);
  const explicitDiscount = getExplicitDiscountPercent(item);

  if (regularUnit <= 0 && saleUnit > 0 && explicitDiscount > 0 && explicitDiscount < 100) {
    regularUnit = +(saleUnit / (1 - explicitDiscount / 100)).toFixed(2);
  }
  if (saleUnit <= 0 && regularUnit > 0 && explicitDiscount > 0 && explicitDiscount < 100) {
    saleUnit = +(regularUnit * (1 - explicitDiscount / 100)).toFixed(2);
  }

  // Bundle / matrix: catalog regular is often per single unit; cart sale is pack price.
  const tiers = Number(item._bundleTier);
  if (
    Number.isFinite(tiers)
    && tiers > 1
    && regularUnit > 0
    && regularUnit < saleUnit
  ) {
    const scaled = +(regularUnit * tiers).toFixed(2);
    if (scaled >= saleUnit) regularUnit = scaled;
  }

  if (regularUnit < saleUnit) regularUnit = saleUnit;

  const discountPercent = regularUnit > saleUnit && saleUnit >= 0
    ? Math.round(((regularUnit - saleUnit) / regularUnit) * 100)
    : (explicitDiscount > 0 ? Math.round(explicitDiscount) : 0);

  const saleLineTotal = parseAmount(item._lineTotal) || +(saleUnit * packQty).toFixed(2);
  const regularLineTotal = +(regularUnit * packQty).toFixed(2);
  const discountAmount = Math.max(0, +(regularLineTotal - saleLineTotal).toFixed(2));
  const hasDiscount = discountAmount > 0.009 && discountPercent > 0;

  return {
    saleUnit,
    regularUnit,
    discountPercent: hasDiscount ? discountPercent : 0,
    saleLineTotal,
    regularLineTotal,
    discountAmount: hasDiscount ? discountAmount : 0,
    hasDiscount,
  };
}

export function sumCartPriceBreakdown(cartItems = []) {
  return cartItems.reduce(
    (acc, item) => {
      if (item?._isFreeGift) return acc;
      const isOutOfStock = item.inStock === false
        || (typeof item.stockQuantity === 'number' && item.stockQuantity <= 0);
      if (isOutOfStock) return acc;

      const line = resolveCartLinePriceDisplay(item);
      acc.productValue += line.regularLineTotal;
      acc.saleTotal += line.saleLineTotal;
      acc.discount += line.discountAmount;
      return acc;
    },
    { productValue: 0, saleTotal: 0, discount: 0 },
  );
}
