import { uploadToS3 } from '@/lib/storage';
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ReturnRequest from '@/models/ReturnRequest';
import { getAuth } from '@/lib/firebase-admin';
import {
  addReturnEvidence,
  createReturnCase,
  loadOrderForReturn,
  serializeReturnCase,
} from '@/lib/storeReturnWorkflow';

async function getUserId(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.slice('Bearer '.length));
    return decoded.uid;
  } catch {
    return null;
  }
}

async function readMediaFromForm(form, field) {
  const files = form.getAll(field);
  if (!files?.length) return [];
  return Promise.all(files.map(async (file) => {
    if (typeof file === 'string') return file;
    const buffer = Buffer.from(await file.arrayBuffer());
    const resp = await uploadToS3({
      buffer,
      fileName: `return_${Date.now()}_${file.name}`,
      folder: 'uploads',
      contentType: file.type || undefined,
    });
    return resp.url;
  }));
}

function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function GET(request) {
  try {
    await connectDB();
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'not authorized' }, { status: 401 });

    const requests = await ReturnRequest.find({ userId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({
      requests: requests.map((row) => serializeReturnCase(row)),
    });
  } catch (error) {
    console.error('Error fetching return requests:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'not authorized' }, { status: 401 });

    const contentType = request.headers.get('content-type') || '';
    let orderId;
    let type;
    let reason;
    let description = '';
    let fastProcess = false;
    let images = [];
    let videos = [];
    let productRating = null;
    let deliveryRating = null;
    let reviewText = null;
    let items = [];
    let pickupAddress = {};
    let refundMethod = 'ORIGINAL';

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      orderId = form.get('orderId');
      type = form.get('type');
      reason = form.get('reason');
      description = form.get('description') || '';
      fastProcess = form.get('fastProcess') === 'true';
      productRating = form.get('productRating') ? Number(form.get('productRating')) : null;
      deliveryRating = form.get('deliveryRating') ? Number(form.get('deliveryRating')) : null;
      reviewText = form.get('reviewText') || null;
      items = parseItems(form.get('items'));
      refundMethod = form.get('refundMethod') || 'ORIGINAL';
      const pickupRaw = form.get('pickupAddress');
      if (pickupRaw) {
        try { pickupAddress = JSON.parse(String(pickupRaw)); } catch { pickupAddress = {}; }
      }
      images = await readMediaFromForm(form, 'images');
      videos = await readMediaFromForm(form, 'videos');
    } else {
      const body = await request.json();
      orderId = body.orderId;
      type = body.type;
      reason = body.reason;
      description = body.description || '';
      images = body.images || [];
      videos = body.videos || [];
      fastProcess = body.fastProcess || false;
      productRating = body.productRating ?? null;
      deliveryRating = body.deliveryRating ?? null;
      reviewText = body.reviewText ?? null;
      items = parseItems(body.items);
      pickupAddress = body.pickupAddress || {};
      refundMethod = body.refundMethod || 'ORIGINAL';
      if (body.itemIndex != null && !items.length) {
        items = [{ itemIndex: Number(body.itemIndex), quantity: Number(body.quantity || 1) }];
      }
    }

    if (!orderId || !type || !reason) {
      return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
    }

    const order = await loadOrderForReturn(orderId);
    if (!order || String(order.userId || '') !== String(userId)) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const result = await createReturnCase({
      order,
      userId,
      type,
      reason,
      description,
      images,
      videos,
      items,
      pickupAddress,
      refundMethod,
      fastProcess,
      productRating,
      deliveryRating,
      reviewText,
      source: 'customer',
      actor: { uid: userId, name: 'Customer' },
    });

    return NextResponse.json({
      message: result.eligible
        ? 'Return/replacement request submitted successfully'
        : result.eligibility.reason,
      eligible: result.eligible,
      eligibility: result.eligibility,
      request: serializeReturnCase(result.request, order),
    });
  } catch (error) {
    console.error('Error creating return request:', error);
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

export async function PATCH(request) {
  try {
    await connectDB();
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'not authorized' }, { status: 401 });

    const contentType = request.headers.get('content-type') || '';
    let id;
    let description = '';
    let images = [];
    let videos = [];

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      id = form.get('id') || form.get('returnRequestId');
      description = form.get('description') || '';
      images = await readMediaFromForm(form, 'images');
      videos = await readMediaFromForm(form, 'videos');
    } else {
      const body = await request.json();
      id = body.id || body.returnRequestId;
      description = body.description || '';
      images = body.images || [];
      videos = body.videos || [];
    }

    const doc = await ReturnRequest.findOne({ _id: id, userId }).exec();
    if (!doc) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

    const result = await addReturnEvidence(doc, {
      images,
      videos,
      description,
      actor: { uid: userId, name: 'Customer' },
    });
    return NextResponse.json({
      message: result.message,
      request: serializeReturnCase(result.request),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
