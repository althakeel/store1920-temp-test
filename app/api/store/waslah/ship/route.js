import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { isWaslahAlreadyProcessedError } from '@/lib/waslah';
import {
  getWaslahShipmentHttpError,
  shipOrderWithWaslah,
} from '@/lib/waslahShipmentService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/store/waslah/ship
 * Body: { orderId, pickupInfo?, skipPickup?, paymentMethod? }
 *
 * Authentication and HTTP mapping stay here; the resumable shipment workflow
 * lives in lib/waslahShipmentService so automatic shipping can safely reuse it.
 */
export async function POST(request) {
  let orderId = '';
  let displayReference = '';

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
    orderId = String(body?.orderId || '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const result = await shipOrderWithWaslah({
      orderId,
      storeId,
      pickupInfo: body?.pickupInfo || {},
      skipPickup: Boolean(body?.skipPickup),
      paymentMethod: body?.paymentMethod || 'credit_limit',
      serviceId: body?.serviceId || '',
      dryRun: Boolean(body?.dryRun),
      testCreateOnly: Boolean(body?.testCreateOnly),
      syncOnly: Boolean(body?.syncOnly),
      manualWaslahOrderId: body?.waslahOrderId || '',
      // One canonical reference is shared with the automatic worker. Alternate
      // references can create a second valid AWB after an interrupted request.
      allowFallbackReference: false,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[store/waslah/ship]', error);
    const mapped = getWaslahShipmentHttpError(error);
    displayReference = error?.reference || displayReference;

    let orderSnapshot = null;
    if (mapped.duplicate && orderId) {
      try {
        await dbConnect();
        const existing = await Order.findById(orderId).select('waslah.cancelledAt').lean();
        if (existing?.waslah?.cancelledAt) {
          orderSnapshot = existing;
        } else {
          orderSnapshot = await Order.findByIdAndUpdate(
            orderId,
            {
              $set: {
                'waslah.unlinkedInWaslah': true,
                'waslah.reference': String(error?.reference || displayReference || '').replace(/^#/, '') || null,
              },
            },
            { new: true },
          ).lean();
        }
      } catch (flagError) {
        console.warn('[store/waslah/ship] Could not flag unlinked Waslah shipment:', flagError?.message);
      }
    }

    return NextResponse.json(
      {
        error: error?.message || 'Failed to create Waslah shipment',
        code: mapped.code,
        reference: error?.reference || displayReference || null,
        detail: error?.detail || null,
        validationIssues: error?.detail?.validationIssues || undefined,
        payload: error?.detail?.payload || undefined,
        order: orderSnapshot,
        hint: error?.hint || (
          mapped.duplicate
            ? 'Shipment already exists in Waslah. Link the 24-character Waslah Order ID from ship.waslah.ae instead of creating it again.'
            : (isWaslahAlreadyProcessedError(error)
              ? 'This order was already shipped in Waslah. Refresh EMX status to sync its AWB.'
              : null)
        ),
        status: mapped.status,
        url: error?.url || null,
      },
      { status: mapped.status },
    );
  }
}
