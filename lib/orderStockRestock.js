import Product from '@/models/Product';
import { matchVariantByOptions } from '@/lib/productVariantOptions';

function entityId(value) {
  const resolved = value?._id || value;
  return resolved == null ? '' : String(resolved);
}

function positiveQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

/**
 * Build restock increments for order lines (product + matched variants).
 * Unlike reservation planning, this never blocks on current stock levels.
 */
export function buildOrderStockRestockPlan(order = {}, products = [], { itemIndexes = null } = {}) {
  const productById = new Map(
    (Array.isArray(products) ? products : [])
      .map((product) => [entityId(product), product])
      .filter(([id]) => id),
  );
  const groups = new Map();
  const lines = Array.isArray(order.orderItems) ? order.orderItems : [];
  const indexFilter = Array.isArray(itemIndexes) && itemIndexes.length
    ? new Set(itemIndexes.map((value) => Number(value)).filter((value) => Number.isFinite(value)))
    : null;

  lines.forEach((item, index) => {
    if (indexFilter && !indexFilter.has(index)) return;

    const productId = entityId(item?.productId);
    const quantity = positiveQuantity(item?.quantity);
    if (!productId || !quantity) return;

    const product = productById.get(productId);
    if (!product) return;

    let group = groups.get(productId);
    if (!group) {
      group = {
        productId,
        totalQuantity: 0,
        variants: new Map(),
        productName: product.name || '',
      };
      groups.set(productId, group);
    }
    group.totalQuantity += quantity;

    if (item?.variantOptions && Array.isArray(product.variants) && product.variants.length) {
      const matchedVariant = matchVariantByOptions(product.variants, item.variantOptions);
      const variantIndex = matchedVariant ? product.variants.indexOf(matchedVariant) : -1;
      if (variantIndex < 0) return;

      const existingVariant = group.variants.get(variantIndex) || {
        index: variantIndex,
        quantity: 0,
        sku: matchedVariant.sku || '',
      };
      existingVariant.quantity += quantity;
      group.variants.set(variantIndex, existingVariant);
    }
  });

  return [...groups.values()].map((group) => ({
    productId: group.productId,
    productName: group.productName,
    totalQuantity: group.totalQuantity,
    variants: [...group.variants.values()].sort((a, b) => a.index - b.index),
  }));
}

/**
 * Put order items back into inventory (customer return / RTO warehouse scan).
 * Safe to call once per order — callers should gate with warehouseReturn.stockRestockedAt.
 */
export async function restockOrderInventory(order = {}, { itemIndexes = null } = {}) {
  const productIds = [...new Set(
    (order.orderItems || [])
      .map((item) => entityId(item?.productId))
      .filter(Boolean),
  )];

  if (!productIds.length) {
    return {
      restocked: false,
      skipped: true,
      reason: 'no_products',
      lines: [],
      productCount: 0,
      unitCount: 0,
    };
  }

  const products = await Product.find({ _id: { $in: productIds } })
    .select('_id name stockQuantity inStock variants')
    .lean();

  const plan = buildOrderStockRestockPlan(order, products, { itemIndexes });
  if (!plan.length) {
    return {
      restocked: false,
      skipped: true,
      reason: 'empty_plan',
      lines: [],
      productCount: 0,
      unitCount: 0,
    };
  }

  const lines = [];
  let unitCount = 0;

  for (const productPlan of plan) {
    const increment = { stockQuantity: productPlan.totalQuantity };
    for (const variant of productPlan.variants) {
      increment[`variants.${variant.index}.stock`] = variant.quantity;
    }

    const updated = await Product.findByIdAndUpdate(
      productPlan.productId,
      {
        $inc: increment,
        $set: { stockUpdatedAt: new Date() },
      },
      { new: true },
    ).select('_id name stockQuantity inStock').lean();

    if (updated) {
      const hasStock = Number(updated.stockQuantity || 0) > 0;
      if (updated.inStock !== hasStock) {
        await Product.findByIdAndUpdate(productPlan.productId, { $set: { inStock: hasStock } });
      }
    }

    unitCount += productPlan.totalQuantity;
    lines.push({
      productId: productPlan.productId,
      productName: productPlan.productName || updated?.name || '',
      quantity: productPlan.totalQuantity,
      variants: productPlan.variants.map((variant) => ({
        index: variant.index,
        quantity: variant.quantity,
        sku: variant.sku || null,
      })),
      stockQuantity: updated ? Number(updated.stockQuantity || 0) : null,
    });
  }

  return {
    restocked: true,
    skipped: false,
    reason: null,
    lines,
    productCount: lines.length,
    unitCount,
  };
}
