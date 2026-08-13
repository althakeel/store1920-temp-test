import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import { getWarehouseApiContext } from '@/lib/warehouseAuth';
import { syncWaslahStatusForOrder } from '@/lib/waslahOrderStatusSync';
import { ACTIVE_RECORD_FILTER } from '@/lib/storeTrash';
import { serializeWarehouseTrackingOrder } from '@/lib/warehouseTracking';

export const dynamic = 'force-dynamic';

/**
 * GET /api/warehouse/tracking/:orderId
 * Optional ?live=true to refresh EMX status.
 */
export async function GET(request, { params }) {
  try {
    const context = await getWarehouseApiContext(request);
    if (!context?.storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orderId = String(params?.orderId || '').trim();
    if (!/^[a-f\d]{24}$/i.test(orderId)) {
      return NextResponse.json({ error: 'Valid orderId is required' }, { status: 400 });
    }

    await dbConnect();
    let order = await Order.findOne({
      _id: orderId,
      storeId: String(context.storeId),
      ...ACTIVE_RECORD_FILTER,
    }).lean();

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const live = ['1', 'true', 'yes'].includes(String(searchParams.get('live') || '').toLowerCase());
    let liveSync = null;

    if (live) {
      try {
        const synced = await syncWaslahStatusForOrder(order, { persist: true, force: true });
        order = synced?.order || order;
        liveSync = {
          changed: Boolean(synced?.changed),
          skipped: Boolean(synced?.skipped),
          error: synced?.error || null,
        };
      } catch (error) {
        liveSync = { changed: false, error: error?.message || 'Live sync failed' };
      }
    }

    return NextResponse.json({
      success: true,
      liveSync,
      order: serializeWarehouseTrackingOrder(order),
    });
  } catch (error) {
    console.error('[warehouse/tracking/:orderId GET]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load order tracking' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/warehouse/tracking/:orderId
 * Force refresh live EMX tracking for one order.
 */
export async function POST(request, { params }) {
  try {
    const context = await getWarehouseApiContext(request);
    if (!context?.storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orderId = String(params?.orderId || '').trim();
    if (!/^[a-f\d]{24}$/i.test(orderId)) {
      return NextResponse.json({ error: 'Valid orderId is required' }, { status: 400 });
    }

    await dbConnect();
    const order = await Order.findOne({
      _id: orderId,
      storeId: String(context.storeId),
      ...ACTIVE_RECORD_FILTER,
    }).lean();

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const synced = await syncWaslahStatusForOrder(order, { persist: true, force: true });
    return NextResponse.json({
      success: true,
      changed: Boolean(synced?.changed),
      skipped: Boolean(synced?.skipped),
      error: synced?.error || null,
      order: serializeWarehouseTrackingOrder(synced?.order || order),
    });
  } catch (error) {
    console.error('[warehouse/tracking/:orderId POST]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to refresh order tracking' },
      { status: 500 },
    );
  }
}
