import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import EmailHistory from '@/models/EmailHistory';
import authSeller from '@/middlewares/authSeller';

export async function GET(request) {
  try {
    await dbConnect();

    // Extract and verify token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const idToken = authHeader.split(' ')[1];
    const { getAuth } = await import('firebase-admin/auth');
    const { initializeApp, applicationDefault, getApps } = await import('firebase-admin/app');

    if (getApps().length === 0) {
      initializeApp({ credential: applicationDefault() });
    }

    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch (err) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const userId = decodedToken.uid;
    const storeId = await authSeller(userId);

    if (!storeId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    console.log('[email-history] userId:', userId, 'storeId:', storeId);

    // Convert storeId to ObjectId for proper query
    const mongoose = await import('mongoose');
    const storeObjectId = new mongoose.default.Types.ObjectId(storeId);

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 20;
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    // Build query
    let query = { storeId: storeObjectId };
    if (status) query.status = status;
    if (type) query.type = type;

    console.log('[email-history] Query:', query);

    // Fetch email history
    const skip = (page - 1) * limit;
    const history = await EmailHistory.find(query)
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    console.log('[email-history] Found records:', history.length);

    // Get total count
    const total = await EmailHistory.countDocuments(query);

    console.log('[email-history] Total records:', total);

    // Get summary stats
    const statsMatch = { storeId: storeObjectId };
    if (type) statsMatch.type = type;
    const stats = await EmailHistory.aggregate([
      { $match: statsMatch },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const engagement = await EmailHistory.aggregate([
      { $match: { ...statsMatch, status: 'sent' } },
      {
        $group: {
          _id: null,
          opened: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$openCount', 0] }, 0] }, 1, 0] } },
          clicked: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$clickCount', 0] }, 0] }, 1, 0] } },
          opens: { $sum: { $ifNull: ['$openCount', 0] } },
          clicks: { $sum: { $ifNull: ['$clickCount', 0] } },
        },
      },
    ]);

    const statsByStatus = {
      sent: 0,
      failed: 0,
      pending: 0,
      opened: engagement[0]?.opened || 0,
      clicked: engagement[0]?.clicked || 0,
      opens: engagement[0]?.opens || 0,
      clicks: engagement[0]?.clicks || 0,
    };
    stats.forEach(stat => {
      if (stat._id in statsByStatus) statsByStatus[stat._id] = stat.count;
    });

    console.log('[email-history] Stats:', statsByStatus);

    const recentFailures = await EmailHistory.find({
      ...statsMatch,
      status: 'failed',
    })
      .sort({ sentAt: -1 })
      .limit(10)
      .select('recipientEmail recipientName subject errorMessage sentAt')
      .lean();

    const clickRows = await EmailHistory.find({
      ...statsMatch,
      status: 'sent',
      clickCount: { $gt: 0 },
    })
      .sort({ lastClickedAt: -1 })
      .limit(80)
      .select('recipientEmail recipientName subject clickCount lastClickedAt lastClickedUrl recentClicks firstClickedAt')
      .lean();

    const recentClicks = clickRows.flatMap((row) => {
      const events = Array.isArray(row.recentClicks) && row.recentClicks.length
        ? row.recentClicks
        : (row.lastClickedUrl || row.lastClickedAt
          ? [{ url: row.lastClickedUrl || '', at: row.lastClickedAt || row.firstClickedAt }]
          : []);
      return events
        .slice()
        .reverse()
        .map((event) => ({
          id: `${row._id}-${event.at || ''}-${event.url || ''}`,
          recipientEmail: row.recipientEmail,
          recipientName: row.recipientName || '',
          subject: row.subject,
          url: String(event.url || row.lastClickedUrl || '').trim(),
          at: event.at || row.lastClickedAt || row.firstClickedAt,
          clickCount: row.clickCount || 0,
        }));
    }).slice(0, 120);

    return NextResponse.json({
      history,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      stats: statsByStatus,
      recentFailures,
      recentClicks,
    });
  } catch (error) {
    console.error('[email-history API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
