import Order from '@/models/Order';
import { findOrderByTrackingIdentifier } from '@/lib/orderTrackingLookup';
import { ACTIVE_RECORD_FILTER } from '@/lib/storeTrash';
import { appendOrderCommunicationLog } from '@/lib/orderCommunicationLog';
import { notifyCustomerOfOrderStatusChange } from '@/lib/orderStatusCustomerNotify';
import { restockOrderInventory } from '@/lib/orderStockRestock';
import { patchOrder } from '@/lib/orderSafePersist';

const BLOCKED_COLLECT_STATUSES = new Set(['CANCELLED']);

const CUSTOMER_RETURN_STATUSES = new Set([
  'DELIVERED',
  'RETURN',
  'RETURNED',
  'RETURN_REQUESTED',
  'RETURN_INITIATED',
  'RETURN_APPROVED',
  'REPLACEMENT',
]);

export function formatWarehouseReturn(order = {}) {
  const collected = order?.warehouseReturn || {};
  if (!collected.collected) {
    return {
      collected: false,
      collectedAt: null,
      collectedByUid: null,
      collectedByName: null,
      collectedByEmail: null,
      previousStatus: null,
      status: null,
      notes: null,
      scan: null,
      stockRestocked: false,
      stockRestockedAt: null,
      stockRestock: null,
    };
  }
  return {
    collected: true,
    collectedAt: collected.collectedAt || null,
    collectedByUid: collected.collectedByUid || null,
    collectedByName: collected.collectedByName || null,
    collectedByEmail: collected.collectedByEmail || null,
    previousStatus: collected.previousStatus || null,
    status: collected.status || null,
    notes: collected.notes || null,
    scan: collected.scan || null,
    stockRestocked: Boolean(collected.stockRestockedAt),
    stockRestockedAt: collected.stockRestockedAt || null,
    stockRestock: collected.stockRestock || null,
  };
}

export function isWarehouseReturnCollected(order = {}) {
  return order?.warehouseReturn?.collected === true;
}

function normalizeOutcome(value = '') {
  const key = String(value || '').trim().toUpperCase();
  if (key === 'RTO' || key === 'RETURN_TO_ORIGIN' || key === 'NOT_COLLECTED') return 'RTO';
  if (
    key === 'RETURNED'
    || key === 'RETURN'
    || key === 'CUSTOMER_RETURN'
    || key === 'RETURN_COLLECTED'
    || key === 'RETURN_NEEDED'
  ) {
    return 'RETURNED';
  }
  return '';
}

/**
 * Customer return after delivery → RETURNED.
 * Undelivered parcel back to warehouse → RTO.
 */
export function resolveWarehouseReturnStatus(order = {}, requestedType = '') {
  const explicit = normalizeOutcome(requestedType);
  if (explicit) return explicit;

  const status = String(order?.status || '').toUpperCase();
  const courier = String(
    order?.waslah?.appStatus || order?.waslah?.carrierStatus || '',
  ).toUpperCase();

  if (status === 'RTO' || courier === 'RTO') return 'RTO';
  if (CUSTOMER_RETURN_STATUSES.has(status) || courier === 'DELIVERED' || courier === 'RETURN') {
    return 'RETURNED';
  }
  return 'RTO';
}

export function warehouseReturnStatusLabel(status = '') {
  return String(status).toUpperCase() === 'RTO' ? 'RTO' : 'Returned';
}

async function resolveReturnTargetOrder({ storeId, orderId, q }) {
  const id = String(orderId || '').trim();
  const query = String(q || '').trim();

  if (id) {
    const byId = await Order.findOne({
      _id: id,
      storeId: String(storeId),
      ...ACTIVE_RECORD_FILTER,
    }).exec();
    if (byId) return byId;
  }

  if (query) {
    const found = await findOrderByTrackingIdentifier(query);
    if (found && !found.deletedAt && String(found.storeId) === String(storeId)) {
      return Order.findById(found._id).exec();
    }
  }

  return null;
}

/**
 * Warehouse app scanned a returning parcel (EMX Door To Door / order no).
 * Marks Return collected, sets store status to RETURNED or RTO, and restocks inventory.
 */
export async function collectWarehouseReturn({
  storeId,
  orderId = '',
  q = '',
  type = '',
  notes = '',
  actor = {},
  force = false,
  restock = true,
  itemIndexes = null,
} = {}) {
  if (!storeId) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const order = await resolveReturnTargetOrder({ storeId, orderId, q });
  if (!order) {
    return { ok: false, status: 404, error: 'Order not found' };
  }

  let returnCase = null;
  try {
    const { findReturnCaseFromScan } = await import('@/lib/storeReturnWorkflow');
    returnCase = await findReturnCaseFromScan({ storeId, q: q || orderId, order });
  } catch (error) {
    console.error('[collectWarehouseReturn] return case lookup failed', error?.message || error);
  }

  const pipelineReturn = Boolean(returnCase)
    && !['COMPLETED', 'REJECTED', 'NOT_ELIGIBLE', 'QC_FAILED'].includes(String(returnCase.status || '').toUpperCase());
  if (pipelineReturn && restock !== false) {
    restock = false;
  }

  const previousStatus = String(order.status || '').toUpperCase();
  if (BLOCKED_COLLECT_STATUSES.has(previousStatus)) {
    return {
      ok: false,
      status: 409,
      error: `Cannot collect a return for a ${previousStatus.toLowerCase()} order`,
      order,
    };
  }

  const nextStatus = resolveWarehouseReturnStatus(order, type);
  const alreadyCollected = isWarehouseReturnCollected(order);
  const alreadyRestocked = Boolean(order.warehouseReturn?.stockRestockedAt);

  if (alreadyCollected && previousStatus === nextStatus && alreadyRestocked && !force) {
    return {
      ok: true,
      alreadyCollected: true,
      statusChanged: false,
      previousStatus,
      status: nextStatus,
      message: 'Return collected',
      stockRestock: {
        restocked: false,
        skipped: true,
        reason: 'already_restocked',
        lines: order.warehouseReturn?.stockRestock?.lines || [],
        productCount: order.warehouseReturn?.stockRestock?.productCount || 0,
        unitCount: order.warehouseReturn?.stockRestock?.unitCount || 0,
      },
      order,
    };
  }

  const now = new Date();
  const collectedByUid = String(actor.uid || actor.userId || '').trim() || null;
  const collectedByName = String(actor.name || actor.email || 'Warehouse app').trim();
  const collectedByEmail = String(actor.email || '').trim() || null;

  let stockRestock = {
    restocked: false,
    skipped: true,
    reason: restock === false ? 'disabled' : (alreadyRestocked && !force ? 'already_restocked' : null),
    lines: order.warehouseReturn?.stockRestock?.lines || [],
    productCount: order.warehouseReturn?.stockRestock?.productCount || 0,
    unitCount: order.warehouseReturn?.stockRestock?.unitCount || 0,
  };

  if (restock !== false && (!alreadyRestocked || force)) {
    try {
      stockRestock = await restockOrderInventory(order, { itemIndexes });
    } catch (error) {
      console.error('[collectWarehouseReturn] restock failed', error?.message || error);
      stockRestock = {
        restocked: false,
        skipped: true,
        reason: error?.message || 'restock_failed',
        lines: [],
        productCount: 0,
        unitCount: 0,
      };
    }
  }

  order.status = nextStatus;
  const warehouseReturn = {
    ...(order.warehouseReturn && typeof order.warehouseReturn.toObject === 'function'
      ? order.warehouseReturn.toObject()
      : (order.warehouseReturn || {})),
    collected: true,
    collectedAt: alreadyCollected ? (order.warehouseReturn?.collectedAt || now) : now,
    collectedByUid,
    collectedByName,
    collectedByEmail,
    previousStatus,
    status: nextStatus,
    notes: notes || order.warehouseReturn?.notes || null,
    scan: String(q || orderId || '').trim() || null,
    stockRestockedAt: stockRestock.restocked
      ? now
      : (order.warehouseReturn?.stockRestockedAt || null),
    stockRestock: stockRestock.restocked
      ? {
          productCount: stockRestock.productCount,
          unitCount: stockRestock.unitCount,
          lines: stockRestock.lines,
          at: now,
        }
      : (order.warehouseReturn?.stockRestock || null),
  };

  const $set = {
    status: nextStatus,
    warehouseReturn,
  };

  // Stock was previously reserved for fulfillment — clear marker after a successful restock
  // so a future reship can reserve again if needed.
  if (stockRestock.restocked) {
    $set.fulfillmentStockReservedAt = null;
    $set.fulfillmentStockReservationId = null;
  }

  if (!pipelineReturn && Array.isArray(order.returns) && order.returns.length && nextStatus === 'RETURNED') {
    $set.returns = order.returns.map((entry) => {
      const row = typeof entry.toObject === 'function' ? entry.toObject() : { ...entry };
      const open = ['REQUESTED', 'APPROVED'].includes(String(row.status || '').toUpperCase());
      if (!open) return row;
      return {
        ...row,
        status: 'COMPLETED',
        sellerNotes: [row.sellerNotes, 'Warehouse: return collected + stock restocked']
          .filter(Boolean)
          .join(' · '),
      };
    });
  }

  const saved = await patchOrder(order._id, $set);
  if (!saved) {
    return {
      ok: false,
      status: 409,
      error: 'Order was updated by another process. Scan again.',
      order,
    };
  }

  if (pipelineReturn && returnCase && nextStatus === 'RETURNED') {
    try {
      const { recordWarehouseReceive } = await import('@/lib/storeReturnWorkflow');
      await recordWarehouseReceive(returnCase, {
        actor,
        scannedCode: String(q || orderId || '').trim(),
        notes,
        warehouseName: 'Warehouse',
      });
    } catch (error) {
      console.error('[collectWarehouseReturn] return case receive failed', error?.message || error);
    }
  }

  try {
    await notifyCustomerOfOrderStatusChange(saved, nextStatus, {
      previousStatus,
      source: 'warehouse_return_scan',
      actor: {
        uid: collectedByUid,
        name: collectedByName,
      },
    });
  } catch (error) {
    console.error('[collectWarehouseReturn] status email failed', error?.message || error);
  }

  const stockDetail = stockRestock.restocked
    ? ` · restocked ${stockRestock.unitCount} unit(s) across ${stockRestock.productCount} product(s)`
    : stockRestock.reason
      ? ` · stock: ${stockRestock.reason}`
      : '';

  await appendOrderCommunicationLog(order._id, {
    channel: 'system',
    template: 'warehouse_return_collected',
    label: 'Return collected',
    status: 'sent',
    sentByUid: collectedByUid,
    sentByName: collectedByName,
    details: `Warehouse scan marked order ${warehouseReturnStatusLabel(nextStatus)} (${previousStatus} → ${nextStatus})${stockDetail}`,
  }).catch(() => {});

  const refreshed = await Order.findById(order._id).lean();

  return {
    ok: true,
    alreadyCollected,
    statusChanged: previousStatus !== nextStatus,
    previousStatus,
    status: nextStatus,
    message: 'Return collected',
    stockRestock,
    order: refreshed || order,
  };
}

export async function listReturnedStoreOrders({
  storeId,
  page = 1,
  limit = 25,
  fromDate = '',
  toDate = '',
} = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 25));
  const filter = {
    storeId: String(storeId),
    ...ACTIVE_RECORD_FILTER,
    'warehouseReturn.collected': true,
  };

  const collectedAtFilter = {};
  if (fromDate) {
    const from = new Date(fromDate);
    if (!Number.isNaN(from.getTime())) collectedAtFilter.$gte = from;
  }
  if (toDate) {
    const to = new Date(toDate);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      collectedAtFilter.$lte = to;
    }
  }
  if (Object.keys(collectedAtFilter).length) {
    filter['warehouseReturn.collectedAt'] = collectedAtFilter;
  }

  const [total, orders] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter)
      .sort({ 'warehouseReturn.collectedAt': -1, updatedAt: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .select('_id shortOrderNumber status total paymentMethod paymentStatus createdAt updatedAt guestName guestEmail guestPhone shippingAddress trackingId courier waslah waslahReturn warehouseReturn warehousePacking orderItems')
      .lean(),
  ]);

  return {
    page: pageNum,
    limit: pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    orders: orders.map((order) => ({
      ...order,
      returnCollected: formatWarehouseReturn(order),
      warehouseReturn: formatWarehouseReturn(order),
    })),
  };
}
