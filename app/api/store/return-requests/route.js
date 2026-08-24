import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import ReturnRequest from '@/models/ReturnRequest';
import { NextResponse } from 'next/server';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import {
  applyReturnAction,
  ensureReturnCaseFromOrder,
  listStoreReturnCases,
  serializeReturnCase,
} from '@/lib/storeReturnWorkflow';

export const dynamic = 'force-dynamic';

async function sellerContext(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(authHeader.slice('Bearer '.length));
  } catch {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const storeId = await authSeller(decodedToken.uid);
  if (!storeId) {
    return { error: NextResponse.json({ error: 'Store not found' }, { status: 404 }) };
  }
  return {
    storeId: String(storeId),
    actor: {
      uid: decodedToken.uid,
      name: decodedToken.name || decodedToken.email || 'Store staff',
      email: decodedToken.email || '',
    },
  };
}

export async function GET(request) {
  try {
    const auth = await sellerContext(request);
    if (auth.error) return auth.error;
    await connectDB();
    const tab = request.nextUrl.searchParams.get('tab') || 'all';
    const requests = await listStoreReturnCases(auth.storeId, { tab });
    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Error fetching store return requests:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await sellerContext(request);
    if (auth.error) return auth.error;
    await connectDB();

    const body = await request.json();
    const action = String(body.action || '').toUpperCase();
    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    let doc = null;
    if (body.id || body.returnRequestId) {
      doc = await ReturnRequest.findOne({
        _id: body.id || body.returnRequestId,
        storeId: auth.storeId,
      }).exec();
    } else if (body.returnNumber) {
      doc = await ReturnRequest.findOne({
        returnNumber: String(body.returnNumber).toUpperCase(),
        storeId: auth.storeId,
      }).exec();
    } else if (body.orderId != null && body.returnIndex != null) {
      const order = await Order.findOne({ _id: body.orderId, storeId: auth.storeId }).exec();
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      doc = await ensureReturnCaseFromOrder(order, Number(body.returnIndex), auth.actor);
    }

    if (!doc) {
      return NextResponse.json({ error: 'Return request not found' }, { status: 404 });
    }

    const result = await applyReturnAction(doc, {
      action,
      actor: auth.actor,
      rejectionReason: body.rejectionReason || body.reason || '',
      infoMessage: body.infoMessage || body.message || '',
      qc: body.qc || {},
      warehouse: body.warehouse || {},
      riderName: body.riderName || '',
      riderPhone: body.riderPhone || '',
      scannedCode: body.scannedCode || '',
    });

    const order = await Order.findById(doc.orderId).lean();
    return NextResponse.json({
      success: true,
      message: result.message,
      skipped: result.skipped || false,
      request: serializeReturnCase(result.request, order),
      followUp: result.followUp || null,
    });
  } catch (error) {
    console.error('Error processing return request:', error);
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 },
    );
  }
}
