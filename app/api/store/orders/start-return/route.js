import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { notifyCustomerOfOrderStatusChange } from '@/lib/orderStatusCustomerNotify';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set(['RETURN', 'REPLACEMENT']);
const OPEN_RETURN_STATUSES = new Set(['REQUESTED', 'APPROVED']);
const DELIVERED_STATUSES = new Set(['DELIVERED']);

function isDeliveredOrder(order = {}) {
  const status = String(order.status || '').toUpperCase();
  const waslahStatus = String(order.waslah?.appStatus || order.waslah?.carrierStatus || '').toUpperCase();
  return DELIVERED_STATUSES.has(status) || waslahStatus === 'DELIVERED';
}

function hasOpenRequest(order, type) {
  return (order.returns || []).some((entry) => (
    String(entry?.type || '').toUpperCase() === type
    && OPEN_RETURN_STATUSES.has(String(entry?.status || '').toUpperCase())
  ));
}

/**
 * POST /api/store/orders/start-return
 * Seller starts a return or replacement on a delivered order.
 * Body: { orderId, type: 'RETURN' | 'REPLACEMENT', reason? }
 */
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

    const body = await request.json();
    const orderId = String(body?.orderId || '').trim();
    const type = String(body?.type || '').toUpperCase();
    const reason = String(body?.reason || '').trim();

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: 'type must be RETURN or REPLACEMENT' }, { status: 400 });
    }

    await dbConnect();
    const order = await Order.findOne({ _id: orderId, storeId: String(storeId) })
      .populate({ path: 'userId', select: 'email name' })
      .exec();
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!isDeliveredOrder(order)) {
      return NextResponse.json(
        { error: 'Return and replacement are only available after the order is delivered.' },
        { status: 400 },
      );
    }

    if (hasOpenRequest(order, type)) {
      return NextResponse.json(
        { error: `This order already has an open ${type.toLowerCase()}.` },
        { status: 409 },
      );
    }

    const previousStatus = String(order.status || '').toUpperCase();
    const nextStatus = type === 'REPLACEMENT' ? 'REPLACEMENT' : 'RETURN';
    const defaultReason = type === 'REPLACEMENT'
      ? 'Replacement started by store after delivery'
      : 'Return started by store after delivery';

    order.returns = Array.isArray(order.returns) ? order.returns : [];
    order.returns.push({
      itemIndex: 0,
      reason: reason || defaultReason,
      type,
      status: 'APPROVED',
      description: reason || defaultReason,
      images: [],
      requestedAt: new Date(),
      approvedAt: new Date(),
      sellerNotes: 'Started by store staff',
    });
    order.status = nextStatus;
    await order.save();

    const plainOrder = typeof order.toObject === 'function' ? order.toObject() : order;
    try {
      await notifyCustomerOfOrderStatusChange(plainOrder, nextStatus, {
        previousStatus,
        source: type === 'REPLACEMENT' ? 'store_replacement' : 'store_return',
        force: true,
        actor: {
          uid: decodedToken.uid,
          name: decodedToken.name || decodedToken.email || 'Store staff',
          email: decodedToken.email || '',
        },
      });
    } catch (emailError) {
      console.error('[store/orders/start-return] customer email failed', emailError?.message || emailError);
    }

    return NextResponse.json({
      success: true,
      message: type === 'REPLACEMENT'
        ? 'Replacement started. The customer has been emailed.'
        : 'Return started. The customer has been emailed.',
      order: {
        _id: order._id,
        status: order.status,
        returns: order.returns,
        updatedAt: order.updatedAt,
      },
    });
  } catch (error) {
    console.error('[store/orders/start-return]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to start return or replacement' },
      { status: 500 },
    );
  }
}
