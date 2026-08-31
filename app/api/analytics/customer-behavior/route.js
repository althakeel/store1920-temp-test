import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import CustomerBehaviorEvent from '@/models/CustomerBehaviorEvent';
import {
  buildCustomerBehaviorEvent,
  debugLog,
  resolveCustomerIdentity,
  shouldDropForMissingIdentity,
  validateTrackingPayload,
} from '@/lib/customerBehaviorTracking';
import { hasPurchaseEventForOrder } from '@/lib/serverCustomerTracking';

export async function POST(request) {
  try {
    await connectDB();

    const payload = await request.json();
    const validationError = validateTrackingPayload(payload);

    if (validationError) {
      debugLog('drop-invalid-payload', { reason: validationError });
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  
    const identifier = await resolveCustomerIdentity(payload);
    if (shouldDropForMissingIdentity(identifier)) {
      debugLog('drop-missing-identity', {
        storeId: payload.storeId,
        eventType: payload.eventType,
      });
      return NextResponse.json({
        error: 'No customer identifier could be resolved',
      }, { status: 400 });
    }

    if (payload.eventType === 'purchase') {
      const orderId = payload?.metadata?.orderId;
      if (orderId && await hasPurchaseEventForOrder(payload.storeId, orderId)) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: 'duplicate_purchase',
        });
      }
    }

    const document = buildCustomerBehaviorEvent(payload, identifier);
    const created = await CustomerBehaviorEvent.create(document);

    return NextResponse.json({
      success: true,
      eventId: String(created._id),
      identifierSource: created.identifier?.source || 'unknown',
      fallbackNote: created.identifier?.fallbackNote || '',
    });
  } catch (error) {
    debugLog('ingest-error', { message: error.message });
    return NextResponse.json({ error: 'Failed to track customer behavior' }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const eventType = searchParams.get('eventType');
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const query = { storeId };
    if (eventType) {
      query.eventType = eventType;
    }

    const events = await CustomerBehaviorEvent.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({
      success: true,
      total: events.length,
      events,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch customer behavior events' }, { status: 500 });
  }
}