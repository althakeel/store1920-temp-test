import { getAuth } from '@/lib/firebase-admin';
import connectDB from '@/lib/mongodb';
import { NextResponse } from 'next/server';
import {
  createReturnCase,
  loadOrderForReturn,
  serializeReturnCase,
} from '@/lib/storeReturnWorkflow';

export async function POST(req) {
  try {
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = getAuth();
    const decoded = await auth.verifyIdToken(token);
    const userId = decoded.uid;

    await connectDB();
    const { orderId, itemIndex, reason, type, description, images, quantity, items, pickupAddress, refundMethod } = await req.json();

    const order = await loadOrderForReturn(orderId);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    if (order.userId !== userId && order.guestEmail !== decoded.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const requestedItems = Array.isArray(items) && items.length
      ? items
      : [{ itemIndex: Number(itemIndex || 0), quantity: Number(quantity || 1) }];

    const result = await createReturnCase({
      order,
      userId,
      type: type || 'RETURN',
      reason,
      description,
      images: images || [],
      items: requestedItems,
      pickupAddress,
      refundMethod: refundMethod || 'ORIGINAL',
      source: 'customer',
      actor: { uid: userId, name: decoded.name || decoded.email || 'Customer' },
    });

    return NextResponse.json({
      success: true,
      message: result.eligible
        ? `${type || 'Return'} request submitted successfully`
        : result.eligibility.reason,
      eligible: result.eligible,
      request: serializeReturnCase(result.request, order),
      returns: order.returns,
    }, { status: 200 });
  } catch (error) {
    console.error('Return request error:', error);
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

export async function GET(req) {
  try {
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = await getAuth().verifyIdToken(token);
    const { default: ReturnRequest } = await import('@/models/ReturnRequest');
    await connectDB();
    const { serializeReturnCase: serialize } = await import('@/lib/storeReturnWorkflow');
    const requests = await ReturnRequest.find({ userId: decoded.uid }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({
      success: true,
      returns: requests.map((row) => serialize(row)),
    });
  } catch (error) {
    console.error('Get returns error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
