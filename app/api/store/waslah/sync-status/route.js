import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { isWaslahConfigured } from '@/lib/waslah';
import {
  syncWaslahStatusForOrder,
  syncWaslahStatusForOrders,
} from '@/lib/waslahOrderStatusSync';

export const dynamic = 'force-dynamic';

const MAX_BATCH_ORDERS = 10;

function toLiveStatusPatch(order = {}) {
  return {
    _id: order._id,
    status: order.status,
    trackingId: order.trackingId,
    trackingUrl: order.trackingUrl,
    courier: order.courier,
    waslah: order.waslah || {},
    updatedAt: order.updatedAt,
  };
}

/** POST /api/store/waslah/sync-status — fetch and persist live EMX tracking only. */
export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(authHeader.slice('Bearer '.length));
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const storeId = await authSeller(decodedToken.uid);
    if (!storeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!isWaslahConfigured()) {
      return NextResponse.json({ error: 'Waslah is not configured' }, { status: 503 });
    }

    const body = await request.json();
    const orderId = String(body?.orderId || '').trim();
    const suppliedOrderIds = Array.isArray(body?.orderIds) ? body.orderIds : null;
    const force = Boolean(body?.force);

    if (suppliedOrderIds) {
      const uniqueOrderIds = [...new Set(
        suppliedOrderIds.map((value) => String(value || '').trim()).filter(Boolean),
      )];
      if (!uniqueOrderIds.length) {
        return NextResponse.json({ error: 'At least one orderId is required' }, { status: 400 });
      }
      if (uniqueOrderIds.some((value) => !/^[a-f\d]{24}$/i.test(value))) {
        return NextResponse.json({ error: 'Every orderId must be valid' }, { status: 400 });
      }

      const requestedOrderIds = uniqueOrderIds.slice(0, MAX_BATCH_ORDERS);
      await dbConnect();
      const matchingOrders = await Order.find({
        _id: { $in: requestedOrderIds },
        storeId: String(storeId),
      })
        .select('_id status trackingId trackingUrl courier waslah updatedAt')
        .lean();
      const byId = new Map(matchingOrders.map((entry) => [String(entry._id), entry]));
      const orderedMatches = requestedOrderIds.map((id) => byId.get(id)).filter(Boolean);
      const syncedOrders = await syncWaslahStatusForOrders(orderedMatches, {
        max: MAX_BATCH_ORDERS,
        persist: true,
        concurrency: 2,
      });

      return NextResponse.json({
        success: true,
        batch: true,
        requested: requestedOrderIds.length,
        matched: syncedOrders.length,
        refreshedAt: new Date().toISOString(),
        orders: syncedOrders.map(toLiveStatusPatch),
      });
    }

    if (!/^[a-f\d]{24}$/i.test(orderId)) {
      return NextResponse.json({ error: 'A valid orderId is required' }, { status: 400 });
    }

    await dbConnect();
    const order = await Order.findOne({ _id: orderId, storeId: String(storeId) }).lean();
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const result = await syncWaslahStatusForOrder(order, { persist: true, force });
    if (result.error) {
      return NextResponse.json(
        { error: 'Could not fetch live EMX status', detail: result.error },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      changed: Boolean(result.changed),
      orderStatusChanged: Boolean(result.orderStatusChanged),
      courierChanged: Boolean(result.courierChanged),
      fetched: Boolean(result.fetched),
      skipped: Boolean(result.skipped),
      pending: Boolean(result.pending || result.empty),
      empty: Boolean(result.empty),
      conflict: Boolean(result.conflict),
      stale: Boolean(result.stale),
      previousStatus: result.previousStatus || order.status,
      status: result.nextStatus || result.order?.status || order.status,
      carrierStatus: result.order?.waslah?.appStatus
        || result.order?.waslah?.carrierStatus
        || order.waslah?.carrierStatus
        || null,
      refreshedAt: new Date().toISOString(),
      order: toLiveStatusPatch(result.order || order),
      message: result.pending || result.empty
        ? 'EMX has no tracking events yet for this shipment'
        : undefined,
    });
  } catch (error) {
    console.error('[store/waslah/sync-status]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to refresh EMX status' },
      { status: 500 },
    );
  }
}
