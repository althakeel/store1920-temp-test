import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getAuth } from '@/lib/firebase-admin';
import { resolveDashboardAccess } from '@/lib/storeAccessControl';
import StoreActivityLog from '@/models/StoreActivityLog';
import User from '@/models/User';
import {
  buildActivityLogQuery,
  canViewStoreActivityHistory,
  formatActivityLogRow,
  listActivityActors,
  describeStoreActivity,
  recordStoreActivity,
  startOfDubaiDay,
  endOfDubaiDay,
} from '@/lib/storeActivityLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getDecodedUser(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  try {
    const decoded = await getAuth().verifyIdToken(authHeader.split('Bearer ')[1]);
    return { decoded };
  } catch {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
}

export async function POST(request) {
  try {
    const auth = await getDecodedUser(request);
    if (auth.error) return auth.error;

    await connectDB();
    const access = await resolveDashboardAccess(auth.decoded.uid, auth.decoded);
    if (!access.isSeller || !access.storeId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const profile = await User.findById(String(auth.decoded.uid)).select('name email').lean();

    const itemName = String(body.itemName || '').trim();
    const details = Array.isArray(body.details)
      ? body.details.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
      : [];
    const action = describeStoreActivity({
      method: body.method,
      path: body.path,
      pagePath: body.pagePath,
      itemName,
    });

    await recordStoreActivity({
      storeId: access.storeId,
      actorUserId: String(auth.decoded.uid),
      actorEmail: auth.decoded.email || profile?.email || '',
      actorName: auth.decoded.name || profile?.name || auth.decoded.email || 'Store user',
      actorRole: access.isOwner ? 'owner' : access.accessRole,
      method: body.method,
      path: body.path,
      pagePath: body.pagePath,
      action,
      summary: body.summary,
      status: body.status,
      metadata: { details, itemName },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[activity-log POST]', error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

export async function GET(request) {
  try {
    const auth = await getDecodedUser(request);
    if (auth.error) return auth.error;

    await connectDB();
    const access = await resolveDashboardAccess(auth.decoded.uid, auth.decoded);
    if (!access.isSeller || !access.storeId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    if (!canViewStoreActivityHistory(auth.decoded.email, access.permissions)) {
      return NextResponse.json({ error: 'Only the admin email can view activity history unless access is granted in Team Access' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const range = String(searchParams.get('range') || 'all').toLowerCase();
    const actorUserId = String(searchParams.get('actorUserId') || '').trim();
    const q = String(searchParams.get('q') || '').trim();
    const fromDate = String(searchParams.get('fromDate') || '').trim();
    const toDate = String(searchParams.get('toDate') || '').trim();

    const query = buildActivityLogQuery({
      storeId: access.storeId,
      actorUserId,
      range: ['today', 'week', 'all'].includes(range) ? range : 'all',
      fromDate,
      toDate,
      q,
    });

    const now = new Date();
    const [items, total, todayCount, members] = await Promise.all([
      StoreActivityLog.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      StoreActivityLog.countDocuments(query),
      StoreActivityLog.countDocuments({
        storeId: access.storeId,
        createdAt: { $gte: startOfDubaiDay(now), $lte: endOfDubaiDay(now) },
      }),
      listActivityActors(access.storeId),
    ]);

    return NextResponse.json({
      items: items.map(formatActivityLogRow),
      members,
      todayCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error('[activity-log GET]', error);
    return NextResponse.json({ error: 'Failed to load activity history' }, { status: 500 });
  }
}
