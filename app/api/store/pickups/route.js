import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getAuth } from '@/lib/firebase-admin';
import { resolveDashboardAccess } from '@/lib/storeAccessControl';
import { canAccessDashboardArea } from '@/lib/storeDashboardPermissions';
import {
  findAwaitingPickupOrders,
  findOverduePickupOrders,
  findTodaysPickupOrders,
} from '@/lib/storePickupQueue';

export const dynamic = 'force-dynamic';

/**
 * GET /api/store/pickups?view=all|today|overdue
 * - all (default): every pickup-requested order not yet picked up
 * - today: scheduled / requested today only
 * - overdue: pickup requested 24h+ ago and still awaiting pickup
 */
export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(authHeader.slice('Bearer '.length));
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const access = await resolveDashboardAccess(decodedToken.uid, decodedToken);
    if (!access.isSeller || !access.storeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!canAccessDashboardArea(access.permissions, 'todaysPickup', { isOwner: access.isOwner })
      && !canAccessDashboardArea(access.permissions, 'orders', { isOwner: access.isOwner })) {
      return NextResponse.json({ error: 'Pickup list access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const view = String(searchParams.get('view') || 'all').trim().toLowerCase();
    const limit = Number(searchParams.get('limit') || 300);

    await dbConnect();

    if (view === 'overdue') {
      const result = await findOverduePickupOrders({
        storeId: access.storeId,
        limit,
      });
      return NextResponse.json({
        success: true,
        view: 'overdue',
        cutoff: result.cutoff,
        count: result.count,
        orders: result.orders,
        serverTime: new Date().toISOString(),
      });
    }

    if (view === 'today') {
      const result = await findTodaysPickupOrders({
        storeId: access.storeId,
        limit,
      });
      return NextResponse.json({
        success: true,
        view: 'today',
        todayKey: result.todayKey,
        count: result.count,
        orders: result.orders,
        serverTime: new Date().toISOString(),
      });
    }

    const result = await findAwaitingPickupOrders({
      storeId: access.storeId,
      limit,
    });

    return NextResponse.json({
      success: true,
      view: 'all',
      todayKey: result.todayKey,
      count: result.count,
      overdueCount: result.overdueCount,
      todayCount: result.todayCount,
      orders: result.orders,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[store/pickups GET]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load pickup list' },
      { status: 500 },
    );
  }
}
