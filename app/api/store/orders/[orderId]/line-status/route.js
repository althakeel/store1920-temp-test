import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { orderBelongsToStore } from '@/lib/storeOrderStatusUpdate';
import {
  applyOrderLineStatusUpdates,
  isValidStoreOrderLineStatus,
  normalizeStoreOrderLineStatus,
} from '@/lib/storeOrderLineStatus';

export async function PATCH(request, { params }) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
    }

    const idToken = authHeader.split(' ')[1];
    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const storeId = await authSeller(decodedToken.uid);
    if (!storeId) {
      return NextResponse.json({ error: 'Unauthorized - not a seller' }, { status: 403 });
    }

    const { orderId: rawOrderId } = await params;
    const orderId = String(rawOrderId || '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const updates = [];

    if (Array.isArray(body?.items) && body.items.length) {
      body.items.forEach((entry) => {
        updates.push({
          itemIndex: entry?.itemIndex,
          lineStatus: entry?.lineStatus,
          note: entry?.note,
        });
      });
    } else if (body?.itemIndex !== undefined && body?.lineStatus) {
      updates.push({
        itemIndex: body.itemIndex,
        lineStatus: body.lineStatus,
        note: body?.note,
      });
    }

    if (!updates.length) {
      return NextResponse.json({ error: 'Provide itemIndex + lineStatus or items[]' }, { status: 400 });
    }

    for (const entry of updates) {
      const status = normalizeStoreOrderLineStatus(entry.lineStatus);
      if (!isValidStoreOrderLineStatus(status)) {
        return NextResponse.json({ error: `Invalid line status: ${entry.lineStatus}` }, { status: 400 });
      }
    }

    await dbConnect();

    const order = await Order.findById(orderId);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!orderBelongsToStore(order, storeId)) {
      return NextResponse.json({ error: 'Unauthorized - order does not belong to your store' }, { status: 403 });
    }

    const applied = applyOrderLineStatusUpdates(order, updates);
    if (!applied.length) {
      return NextResponse.json({
        success: true,
        message: 'No line status changes',
        orderItems: order.orderItems,
      });
    }

    await order.save();

    return NextResponse.json({
      success: true,
      message: 'Line item status updated',
      applied,
      orderItems: order.orderItems,
    });
  } catch (error) {
    console.error('[line-status API] Error:', error);
    return NextResponse.json({
      error: 'Failed to update line item status',
      message: error.message,
    }, { status: 500 });
  }
}
