import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';

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
      .populate({ path: 'orderItems.productId', model: 'Product' })
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
    const defaultReason = type === 'REPLACEMENT'
      ? 'Replacement started by store after delivery'
      : 'Return started by store after delivery';

    const { createReturnCase, applyReturnAction, serializeReturnCase } = await import('@/lib/storeReturnWorkflow');

    const created = await createReturnCase({
      order,
      userId: order.userId,
      type,
      reason: reason || defaultReason,
      description: reason || defaultReason,
      source: 'store',
      skipEligibility: true,
      actor: {
        uid: decodedToken.uid,
        name: decodedToken.name || decodedToken.email || 'Store staff',
      },
    });

    const result = await applyReturnAction(created.request, {
      action: 'APPROVE',
      actor: {
        uid: decodedToken.uid,
        name: decodedToken.name || decodedToken.email || 'Store staff',
        email: decodedToken.email || '',
      },
    });

    return NextResponse.json({
      success: true,
      message: result.message || (type === 'REPLACEMENT'
        ? 'Replacement started. Pickup is scheduled; replacement ships after QC.'
        : 'Return started. Pickup is scheduled from the new return order.'),
      previousStatus,
      request: serializeReturnCase(result.request || created.request, order),
      followUp: result.followUp || null,
    });
  } catch (error) {
    console.error('[store/orders/start-return]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to start return or replacement' },
      { status: 500 },
    );
  }
}
