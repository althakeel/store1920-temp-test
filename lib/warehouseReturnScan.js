import Order from '@/models/Order';
import { findOrderByTrackingIdentifier } from '@/lib/orderTrackingLookup';
import { ACTIVE_RECORD_FILTER } from '@/lib/storeTrash';
import {
  collectWarehouseReturn,
  formatWarehouseReturn,
  isWarehouseReturnCollected,
  warehouseReturnStatusLabel,
} from '@/lib/warehouseReturnCollect';
import { serializeWarehouseTrackingOrder } from '@/lib/warehouseTracking';

function normalizeProductId(value) {
  const resolved = value?._id || value?.id || value;
  return resolved == null ? '' : String(resolved);
}

export function buildReturnedProductsFromOrder(order = {}, { itemIndexes = null } = {}) {
  const indexFilter = Array.isArray(itemIndexes) && itemIndexes.length
    ? new Set(itemIndexes.map((value) => Number(value)).filter((value) => Number.isFinite(value)))
    : null;

  return (order.orderItems || []).flatMap((item, index) => {
    if (indexFilter && !indexFilter.has(index)) return [];
    const productId = normalizeProductId(item?.productId);
    if (!productId) return [];
    return [{
      itemIndex: index,
      productId,
      productName: String(item?.name || item?.productName || '').trim() || null,
      sku: String(item?.sku || item?.productId?.sku || '').trim() || null,
      quantity: Math.max(1, Number(item?.quantity || 1)),
      variantOptions: item?.variantOptions || null,
    }];
  });
}

export function buildReturnedProductsFromRestock(stockRestock = {}, order = {}) {
  const lines = Array.isArray(stockRestock?.lines) ? stockRestock.lines : [];
  if (lines.length) {
    return lines.map((line) => ({
      productId: String(line.productId || '').trim() || null,
      productName: line.productName || null,
      sku: line.sku || (line.variants?.[0]?.sku) || null,
      quantity: Number(line.quantity || line.totalQuantity || 0) || 0,
      stockQuantity: Number.isFinite(Number(line.stockQuantity)) ? Number(line.stockQuantity) : null,
      variantOptions: line.variantOptions || null,
    })).filter((row) => row.productId);
  }
  return buildReturnedProductsFromOrder(order);
}

async function loadReturnCaseSummary({ storeId, q, order }) {
  try {
    const { findReturnCaseFromScan, serializeReturnCase } = await import('@/lib/storeReturnWorkflow');
    const doc = await findReturnCaseFromScan({ storeId, q, order });
    if (!doc) return null;
    const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
      returnNumber: plain.returnNumber || null,
      status: plain.status || null,
      type: plain.type || 'RETURN',
      items: (plain.items || []).map((item) => ({
        productId: String(item.productId || '').trim() || null,
        productName: item.productName || null,
        sku: item.sku || null,
        quantity: Number(item.quantity || 0),
      })),
      workflowStatus: plain.status || null,
      serialized: serializeReturnCase ? serializeReturnCase(plain, order) : null,
    };
  } catch {
    return null;
  }
}

export async function lookupWarehouseReturnScan({
  storeId,
  q = '',
  orderId = '',
} = {}) {
  const query = String(q || '').trim();
  const id = String(orderId || '').trim();
  if (!query && !id) {
    return { ok: false, status: 400, error: 'q or orderId is required' };
  }

  let order = null;
  if (id) {
    order = await Order.findOne({
      _id: id,
      storeId: String(storeId),
      ...ACTIVE_RECORD_FILTER,
    }).lean();
  }
  if (!order && query) {
    const found = await findOrderByTrackingIdentifier(query);
    if (found && !found.deletedAt && String(found.storeId) === String(storeId)) {
      order = await Order.findById(found._id).lean();
    }
  }
  if (!order) {
    return { ok: false, status: 404, error: 'Order not found', q: query || id };
  }

  const returnCase = await loadReturnCaseSummary({ storeId, q: query || id, order });
  const returnCollected = formatWarehouseReturn(order);
  const products = buildReturnedProductsFromOrder(order);

  return {
    ok: true,
    mode: 'lookup',
    q: query || id,
    canCollect: !isWarehouseReturnCollected(order) || String(order.status || '').toUpperCase() !== 'RETURNED',
    alreadyCollected: isWarehouseReturnCollected(order),
    status: String(order.status || '').toUpperCase(),
    statusLabel: warehouseReturnStatusLabel(order.status),
    returnCase,
    returnCollected,
    returnedProducts: products,
    order: serializeWarehouseTrackingOrder(order),
  };
}

export async function collectWarehouseReturnScan({
  storeId,
  q = '',
  orderId = '',
  type = '',
  notes = '',
  restock = true,
  force = false,
  itemIndexes = null,
  actor = {},
} = {}) {
  const result = await collectWarehouseReturn({
    storeId,
    orderId,
    q,
    type,
    notes,
    restock,
    force,
    itemIndexes,
    actor,
  });

  if (!result.ok) {
    return {
      ok: false,
      status: result.status || 400,
      error: result.error,
      q: q || orderId,
    };
  }

  const order = result.order || {};
  const returnCase = await loadReturnCaseSummary({ storeId, q: q || orderId, order });
  const returnedProducts = buildReturnedProductsFromRestock(result.stockRestock, order);

  return {
    ok: true,
    mode: 'collect',
    message: 'Return collected',
    appMessage: 'Return collected',
    alreadyCollected: Boolean(result.alreadyCollected),
    statusChanged: Boolean(result.statusChanged),
    previousStatus: result.previousStatus || null,
    status: result.status,
    statusLabel: warehouseReturnStatusLabel(result.status),
    returnCollected: formatWarehouseReturn(order),
    returnCase,
    returnedProducts,
    stockRestock: result.stockRestock || null,
    order: serializeWarehouseTrackingOrder(order),
  };
}

export function formatWarehouseReturnScanResponse(payload = {}) {
  if (!payload.ok) {
    return {
      success: false,
      error: payload.error,
      q: payload.q || null,
    };
  }

  return {
    success: true,
    mode: payload.mode,
    message: payload.message || null,
    appMessage: payload.appMessage || payload.message || null,
    q: payload.q || null,
    canCollect: payload.canCollect,
    alreadyCollected: payload.alreadyCollected,
    statusChanged: payload.statusChanged,
    previousStatus: payload.previousStatus || null,
    status: payload.status,
    statusLabel: payload.statusLabel,
    returnCollected: payload.returnCollected,
    returnCase: payload.returnCase,
    returnedProducts: payload.returnedProducts || [],
    stockRestock: payload.stockRestock || null,
    order: payload.order,
  };
}
