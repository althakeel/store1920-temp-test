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

const MAX_BULK_STATUS = 100;

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
    const status = normalizeStoreOrderStatus(body?.status);
    const silent = Boolean(body?.silent);
    const orderIds = [...new Set(
      (Array.isArray(body?.orderIds) ? body.orderIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    )];

    if (!orderIds.length || !status) {
      return NextResponse.json({ error: 'orderIds and status are required' }, { status: 400 });
    }
    if (orderIds.length > MAX_BULK_STATUS) {
      return NextResponse.json(
        { error: `Select at most ${MAX_BULK_STATUS} orders at a time` },
        { status: 400 },
      );
    }
    if (!isValidStoreOrderStatus(status)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }

    await dbConnect();

    const actor = {
      uid: decodedToken.uid,
      name: decodedToken.name || decodedToken.email || 'Store staff',
    };

    const orders = await Order.find({
      _id: { $in: orderIds },
      ...ACTIVE_RECORD_FILTER,
    })
      .populate({ path: 'userId', select: 'email name' })
      .exec();

    const foundIds = new Set(orders.map((order) => String(order._id)));
    const updated = [];
    const unchanged = [];
    const failed = [];

    for (const missingId of orderIds.filter((id) => !foundIds.has(id))) {
      failed.push({ orderId: missingId, error: 'Order not found' });
    }

    for (const order of orders) {
      if (!orderBelongsToStore(order, storeId)) {
        failed.push({ orderId: String(order._id), error: 'Order does not belong to your store' });
        continue;
      }
      try {
        const result = await applySellerOrderStatus(order, status, {
          silent,
          actor,
          source: 'store_bulk_status',
        });
        if (result.changed) {
          updated.push({
            orderId: String(order._id),
            previousStatus: result.previousStatus,
            status: result.status,
          });
        } else {
          unchanged.push({ orderId: String(order._id), status: result.status });
        }
      } catch (error) {
        failed.push({
          orderId: String(order._id),
          error: error?.message || 'Failed to update status',
        });
      }
    }

    return NextResponse.json({
      success: failed.length === 0,
      message: `Updated ${updated.length} order(s) to ${status}`,
      status,
      updatedCount: updated.length,
      unchangedCount: unchanged.length,
      failedCount: failed.length,
      updated,
      unchanged,
      failed,
    });
  } catch (error) {
    console.error('[store/orders/bulk-status]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update selected orders' },
      { status: 500 },
    );
  }
}
