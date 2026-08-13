import { NextResponse } from 'next/server';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import {
  getWaslahShipmentHttpError,
  requestWaslahPickupForOrder,
  requestWaslahPickupForOrders,
} from '@/lib/waslahShipmentService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/store/waslah/pickup
 * Body: { orderId } OR { orderIds: [] }, pickupInfo?, paymentMethod?, serviceId?
 *
 * Schedules an EMX pickup for one or many orders that already have a Waslah shipment.
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
    const singleOrderId = String(body?.orderId || '').trim();
    const bulkOrderIds = Array.isArray(body?.orderIds)
      ? body.orderIds.map((value) => String(value || '').trim()).filter(Boolean)
      : [];

    if (!singleOrderId && !bulkOrderIds.length) {
      return NextResponse.json({ error: 'orderId or orderIds is required' }, { status: 400 });
    }

    const pickupInfo = body?.pickupInfo || {};
    const paymentMethod = body?.paymentMethod || 'credit_limit';
    const serviceId = body?.serviceId || '';

    if (bulkOrderIds.length > 1 || (bulkOrderIds.length === 1 && !singleOrderId)) {
      const result = await requestWaslahPickupForOrders({
        orderIds: bulkOrderIds.length ? bulkOrderIds : [singleOrderId],
        storeId,
        pickupInfo,
        paymentMethod,
        serviceId,
      });
      return NextResponse.json(result, { status: result.succeeded > 0 ? 200 : 400 });
    }

    const result = await requestWaslahPickupForOrder({
      orderId: singleOrderId || bulkOrderIds[0],
      storeId,
      pickupInfo,
      paymentMethod,
      serviceId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[store/waslah/pickup]', error);
    const mapped = getWaslahShipmentHttpError(error);
    return NextResponse.json(
      {
        error: error?.message || 'Failed to request Waslah pickup',
        code: mapped.code,
        detail: error?.detail || null,
        hint: error?.hint || null,
      },
      { status: mapped.status },
    );
  }
}
