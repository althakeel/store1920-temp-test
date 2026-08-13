import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import { getWarehouseApiContext } from '@/lib/warehouseAuth';
import { findOrderByTrackingIdentifier } from '@/lib/orderTrackingLookup';
import { syncWaslahStatusForOrder } from '@/lib/waslahOrderStatusSync';
import { ACTIVE_RECORD_FILTER } from '@/lib/storeTrash';
import {
  serializeWarehouseTrackingOrder,
  WAREHOUSE_TRACKING_QUEUE_STATUSES,
} from '@/lib/warehouseTracking';

export const dynamic = 'force-dynamic';

/**
 * GET /api/warehouse/tracking
 *
 * Warehouse / pickup app tracking API.
 *
 * Auth (one of):
 * - Header `x-warehouse-key: <WAREHOUSE_SCANNER_API_KEY>`
 * - Header `Authorization: Bearer <Firebase seller ID token>`
 *
 * Query:
 * - q / awb / tracking / order   lookup by EMX AWB, order no, Waslah id, Mongo id
 * - status=WAITING_FOR_PICKUP    list queue (comma-separated allowed)
 * - packed=true|false            filter warehouse packed flag
 * - pickup=requested|pending     filter pickup request state
 * - live=true                    refresh EMX live status on lookup
 * - limit=50                     list page size (max 100)
 */
export async function GET(request) {
  try {
    const context = await getWarehouseApiContext(request);
    if (!context?.storeId) {
      return NextResponse.json({
        error: 'Unauthorized',
        hint: 'Send x-warehouse-key or Authorization: Bearer <Firebase ID token>',
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lookup = String(
      searchParams.get('q')
      || searchParams.get('awb')
      || searchParams.get('tracking')
      || searchParams.get('order')
      || '',
    ).trim();
    const live = ['1', 'true', 'yes'].includes(String(searchParams.get('live') || '').toLowerCase());
    const packedFilter = String(searchParams.get('packed') || '').trim().toLowerCase();
    const pickupFilter = String(searchParams.get('pickup') || '').trim().toLowerCase();
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)));

    await dbConnect();

    // ---- Single order lookup ----
    if (lookup) {
      const found = await findOrderByTrackingIdentifier(lookup);
      if (!found || found.deletedAt || String(found.storeId) !== String(context.storeId)) {
        return NextResponse.json({ error: 'Order not found', q: lookup }, { status: 404 });
      }

      let order = found;
      let liveSync = null;
      if (live) {
        try {
          const synced = await syncWaslahStatusForOrder(found, { persist: true, force: true });
          order = synced?.order || found;
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
        mode: 'lookup',
        q: lookup,
        liveSync,
        order: serializeWarehouseTrackingOrder(order),
      });
    }

    // ---- Queue / list ----
    const statusParam = String(searchParams.get('status') || '').trim();
    const statuses = statusParam
      ? statusParam.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean)
      : WAREHOUSE_TRACKING_QUEUE_STATUSES;

    const query = {
      storeId: String(context.storeId),
      ...ACTIVE_RECORD_FILTER,
      status: { $in: statuses },
    };

    if (packedFilter === 'true' || packedFilter === '1') {
      query['warehousePacking.packed'] = true;
    } else if (packedFilter === 'false' || packedFilter === '0') {
      query.$or = [
        { 'warehousePacking.packed': { $ne: true } },
        { warehousePacking: { $exists: false } },
      ];
    }

    if (pickupFilter === 'requested') {
      query['waslah.pickupRequestedAt'] = { $exists: true, $ne: null };
    } else if (pickupFilter === 'pending') {
      query['waslah.orderId'] = { $exists: true, $nin: [null, ''] };
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { 'waslah.pickupRequestedAt': { $exists: false } },
            { 'waslah.pickupRequestedAt': null },
          ],
        },
      ];
    }

    const orders = await Order.find(query)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({
      success: true,
      mode: 'list',
      count: orders.length,
      limit,
      filters: {
        status: statuses,
        packed: packedFilter || null,
        pickup: pickupFilter || null,
      },
      orders: orders.map(serializeWarehouseTrackingOrder),
    });
  } catch (error) {
    console.error('[warehouse/tracking GET]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load warehouse tracking' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/warehouse/tracking
 * Body: { q | awb | orderId, live?: true }
 *
 * Same lookup as GET, useful for scanners that prefer POST.
 */
export async function POST(request) {
  try {
    const context = await getWarehouseApiContext(request);
    if (!context?.storeId) {
      return NextResponse.json({
        error: 'Unauthorized',
        hint: 'Send x-warehouse-key or Authorization: Bearer <Firebase ID token>',
      }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const lookup = String(body?.q || body?.awb || body?.tracking || body?.orderId || '').trim();
    if (!lookup) {
      return NextResponse.json({ error: 'q, awb, tracking, or orderId is required' }, { status: 400 });
    }

    const live = body?.live !== false;
    await dbConnect();

    const found = await findOrderByTrackingIdentifier(lookup);
    if (!found || found.deletedAt || String(found.storeId) !== String(context.storeId)) {
      return NextResponse.json({ error: 'Order not found', q: lookup }, { status: 404 });
    }

    let order = found;
    let liveSync = null;
    if (live) {
      try {
        const synced = await syncWaslahStatusForOrder(found, { persist: true, force: true });
        order = synced?.order || found;
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
      mode: 'lookup',
      q: lookup,
      liveSync,
      order: serializeWarehouseTrackingOrder(order),
    });
  } catch (error) {
    console.error('[warehouse/tracking POST]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to look up warehouse tracking' },
      { status: 500 },
    );
  }
}
