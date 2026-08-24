import { getOrderLineProduct } from '@/lib/orderDisplay';
import {
  resolveOrderLineItems,
  resolveOrderLineName,
  resolveOrderLineBundleUnits,
  resolveOrderLineLineTotal,
  resolveOrderLinePackQuantity,
  resolveOrderLinePrice,
  resolveOrderLineQuantity,
} from '@/lib/gtmEcommerceHelpers';
import { formatVariantOptionsLabel, formatMatrixSelectionLabel, isMatrixOrderLine } from '@/lib/productVariantOptions';
import { normalizeImportedOrderItems } from '@/lib/importedOrderItems';
import { resolveOrderLineStatus } from '@/lib/storeOrderLineStatus';

export function formatStoreOrderLineSubtitle(item = {}, product = null, order = null) {
  const packQuantity = resolveOrderLinePackQuantity(item, product, order);
  const bundleUnits = resolveOrderLineBundleUnits(item, product, order);

  if (isMatrixOrderLine(item, product)) {
    const optionName = formatMatrixSelectionLabel(item?.variantOptions) || 'Selected option';
    const unitsPerPack = bundleUnits > 0 ? bundleUnits : 1;
    const packSizeLabel = unitsPerPack === 1 ? '1 unit per pack' : `${unitsPerPack} units per pack`;
    if (packQuantity > 1) {
      return `${optionName} · ${packSizeLabel} × ${packQuantity} packs`;
    }
    return `${optionName} · ${packSizeLabel}`;
  }

  if (bundleUnits > 0) {
    if (packQuantity > 1) {
      return `Bundle of ${bundleUnits} (${packQuantity} packs)`;
    }
    return `Bundle of ${bundleUnits} (1 pack)`;
  }

  return `Quantity: ${packQuantity}`;
}

/** Lines for store dashboard order modal / invoice preview. */
export function getStoreOrderDisplayItems(order = {}) {
  const raw = normalizeImportedOrderItems(resolveOrderLineItems(order));

  return raw.map((item, index) => {
    const product = getOrderLineProduct(item);
    const name = resolveOrderLineName(item, product);
    const price = resolveOrderLinePrice(item);
    const packQuantity = resolveOrderLinePackQuantity(item, product, order);
    const bundleUnits = resolveOrderLineBundleUnits(item, product, order);
    const quantity = resolveOrderLineQuantity(item, product, order);
    const image = product?.images?.[0] || item?.image || null;
    const variantLabel = formatVariantOptionsLabel(
      item?.variantOptions || (bundleUnits > 0 ? { bundleQty: bundleUnits } : null),
    );
    const isMatrixLine = isMatrixOrderLine(item, product);
    const quantityLabel = formatStoreOrderLineSubtitle(item, product, order);

    return {
      ...item,
      itemIndex: index,
      productId: product?._id ? product : item.productId,
      name: name || `Item ${index + 1}`,
      price,
      quantity,
      packQuantity,
      bundleUnits,
      lineTotal: resolveOrderLineLineTotal(item, product, order),
      lineStatus: resolveOrderLineStatus(item),
      lineStatusNote: item?.lineStatusNote || '',
      isBulkBundle: bundleUnits > 0 && !isMatrixLine,
      isMatrixLine,
      quantityLabel,
      variantLabel,
      image,
    };
  }).filter((item) => item.quantity > 0 && (item.name || item.productId || item.price > 0));
}
