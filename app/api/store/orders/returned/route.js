import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { listReturnedStoreOrders } from '@/lib/warehouseReturnCollect';

export const dynamic = 'force-dynamic';

/**
 * GET /api/store/orders/returned
 * Warehouse return-collected history (Returned / RTO).
 *
 * Query: page, limit, fromDate, toDate
 */
export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
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
      return NextResponse.json({ error: 'not authorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '25';
    const fromDate = searchParams.get('fromDate') || '';
    const toDate = searchParams.get('toDate') || '';

    await connectDB();

    const result = await listReturnedStoreOrders({
      storeId,
      page,
      limit,
      fromDate,
      toDate,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[store/orders/returned]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load returned orders' },
      { status: 500 },
    );
  }
}
