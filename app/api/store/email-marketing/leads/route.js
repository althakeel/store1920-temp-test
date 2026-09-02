import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import EmailMarketingLead from '@/models/EmailMarketingLead';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';

async function getStoreId(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.replace('Bearer ', ''));
    return authSeller(decoded.uid);
  } catch {
    return null;
  }
}

const STATUSES = new Set(['new', 'contacted', 'converted', 'archived']);

function toObjectId(storeId) {
  try {
    return new mongoose.Types.ObjectId(String(storeId));
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const storeId = await getStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 25)));
    const status = String(searchParams.get('status') || 'all').trim();
    const q = String(searchParams.get('q') || '').trim();

    await connectDB();

    const filter = { storeId };
    if (status !== 'all' && STATUSES.has(status)) {
      filter.status = status;
    }
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { email: regex },
        { name: regex },
        { phone: regex },
        { heading: regex },
        { source: regex },
      ];
    }

    const storeObjectId = toObjectId(storeId);

    const [leads, total, countsAgg] = await Promise.all([
      EmailMarketingLead.find(filter)
        .sort({ lastSubmittedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      EmailMarketingLead.countDocuments(filter),
      storeObjectId
        ? EmailMarketingLead.aggregate([
            { $match: { storeId: storeObjectId } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ])
        : Promise.resolve([]),
    ]);

    const stats = { new: 0, contacted: 0, converted: 0, archived: 0, total: 0 };
    for (const row of countsAgg) {
      if (row?._id && stats[row._id] !== undefined) {
        stats[row._id] = row.count;
      }
      stats.total += row.count || 0;
    }

    return NextResponse.json({
      success: true,
      leads,
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error('[email-marketing leads GET]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to load leads' },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const storeId = await getStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'Lead id is required.' }, { status: 400 });
    }

    const updates = {};
    if (body.status !== undefined) {
      const nextStatus = String(body.status).trim();
      if (!STATUSES.has(nextStatus)) {
        return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
      }
      updates.status = nextStatus;
    }
    if (body.notes !== undefined) {
      updates.notes = String(body.notes || '').trim().slice(0, 2000);
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    await connectDB();
    const lead = await EmailMarketingLead.findOneAndUpdate(
      { _id: id, storeId },
      { $set: updates },
      { new: true },
    ).lean();

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, lead });
  } catch (error) {
    console.error('[email-marketing leads PATCH]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update lead' },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const storeId = await getStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get('id') || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'Lead id is required.' }, { status: 400 });
    }

    await connectDB();
    const result = await EmailMarketingLead.deleteOne({ _id: id, storeId });
    if (!result.deletedCount) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[email-marketing leads DELETE]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete lead' },
      { status: 500 },
    );
  }
}
