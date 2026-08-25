import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { ACTIVE_RECORD_FILTER } from '@/lib/storeTrash';
import {
  applySellerOrderStatus,
  isValidStoreOrderStatus,
  normalizeStoreOrderStatus,
  orderBelongsToStore,
} from '@/lib/storeOrderStatusUpdate';
import { mapExcelStatusToStoreStatus } from '@/lib/storeBulkStatusExcel';

const MAX_BULK_BY_REF = 250;

/** ShipperRef in the Excel = customer-facing order number (shortOrderNumber). */
function collectOrderRefs(order) {
  const refs = new Set();
  const short = order?.shortOrderNumber;
  if (short != null && String(short).trim()) {
    refs.add(String(short).trim());
  }
  return refs;
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(authHeader.split(' ')[1]);
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const storeId = await authSeller(decodedToken.uid);
    if (!storeId) {
      return NextResponse.json({ error: 'Unauthorized - not a seller' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const silent = Boolean(body?.silent);
    const rawUpdates = Array.isArray(body?.updates) ? body.updates : [];

    if (!rawUpdates.length) {
      return NextResponse.json({ error: 'updates array is required' }, { status: 400 });
    }
    if (rawUpdates.length > MAX_BULK_BY_REF) {
      return NextResponse.json(
        { error: `Send at most ${MAX_BULK_BY_REF} rows per request` },
        { status: 400 },
      );
    }

    const updates = [];
    const failed = [];

    for (const entry of rawUpdates) {
      const shipperRef = String(entry?.shipperRef ?? entry?.ShipperRef ?? '')
        .trim()
        .replace(/^#/, '')
        .replace(/\.0$/, '');
      const status = mapExcelStatusToStoreStatus(entry?.status)
        || (isValidStoreOrderStatus(entry?.status)
          ? normalizeStoreOrderStatus(entry.status)
          : null);

      if (!shipperRef) {
        failed.push({ shipperRef: '', error: 'Missing ShipperRef' });
        continue;
      }
      if (!status) {
        failed.push({
          shipperRef,
          error: `Invalid status: ${entry?.status || '(empty)'}`,
        });
        continue;
      }
      updates.push({ shipperRef, status });
    }

    if (!updates.length) {
      return NextResponse.json({
        success: false,
        message: 'No valid ShipperRef / Status rows',
        updatedCount: 0,
        unchangedCount: 0,
        failedCount: failed.length,
        updated: [],
        unchanged: [],
        failed,
      });
    }

    await dbConnect();

    // ShipperRef = order id (shortOrderNumber), e.g. 615635
    const refStrings = [...new Set(updates.map((u) => u.shipperRef))];
    const refNumbers = refStrings
      .map((ref) => Number(ref))
      .filter((n) => Number.isFinite(n) && n > 0);

    const orClauses = [];
    if (refNumbers.length) {
      orClauses.push({ shortOrderNumber: { $in: refNumbers } });
    }
    if (refStrings.length) {
      orClauses.push({ shortOrderNumber: { $in: refStrings } });
    }

    const orders = await Order.find({
      $or: orClauses,
      ...ACTIVE_RECORD_FILTER,
    })
      .populate({ path: 'userId', select: 'email name' })
      .exec();

    const ordersByRef = new Map();
    for (const order of orders) {
      if (!orderBelongsToStore(order, storeId)) continue;
      for (const ref of collectOrderRefs(order)) {
        if (!ordersByRef.has(ref)) {
          ordersByRef.set(ref, order);
        }
      }
    }

    const actor = {
      uid: decodedToken.uid,
      name: decodedToken.name || decodedToken.email || 'Store staff',
    };

    const updated = [];
    const unchanged = [];
    const seenOrderIds = new Set();

    for (const { shipperRef, status } of updates) {
      const order = ordersByRef.get(shipperRef);
      if (!order) {
        failed.push({ shipperRef, error: 'Order not found for this order id (ShipperRef)' });
        continue;
      }

      const orderId = String(order._id);
      // Same order listed twice with different statuses: last wins, skip duplicate apply of same status
      if (seenOrderIds.has(`${orderId}:${status}`)) {
        unchanged.push({ shipperRef, orderId, status });
        continue;
      }
      seenOrderIds.add(`${orderId}:${status}`);

      try {
        const result = await applySellerOrderStatus(order, status, {
          silent,
          actor,
          source: 'store_bulk_status_excel',
        });
        if (result.changed) {
          updated.push({
            shipperRef,
            orderId,
            previousStatus: result.previousStatus,
            status: result.status,
          });
        } else {
          unchanged.push({ shipperRef, orderId, status: result.status });
        }
      } catch (error) {
        failed.push({
          shipperRef,
          orderId,
          error: error?.message || 'Failed to update status',
        });
      }
    }

    return NextResponse.json({
      success: failed.length === 0,
      message: `Updated ${updated.length} order(s) from Excel`,
      updatedCount: updated.length,
      unchangedCount: unchanged.length,
      failedCount: failed.length,
      updated,
      unchanged,
      failed,
    });
  } catch (error) {
    console.error('[store/orders/bulk-status-by-ref]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update orders from Excel' },
      { status: 500 },
    );
  }
}
