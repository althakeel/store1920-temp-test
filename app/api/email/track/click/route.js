import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmailHistory from '@/models/EmailHistory';
import { resolveTrackedRedirectUrl } from '@/lib/emailMarketingTracking';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = String(searchParams.get('t') || '').trim();
  const target = resolveTrackedRedirectUrl(searchParams.get('u') || '');

  try {
    if (token) {
      await connectDB();
      const now = new Date();
      const row = await EmailHistory.findOne({ trackingToken: token })
        .select('_id firstClickedAt')
        .lean();
      if (row?._id) {
        await EmailHistory.updateOne(
          { _id: row._id },
          {
            $inc: { clickCount: 1 },
            $set: {
              lastClickedAt: now,
              lastClickedUrl: target,
              updatedAt: now,
              ...(row.firstClickedAt ? {} : { firstClickedAt: now }),
            },
            $push: {
              recentClicks: {
                $each: [{ url: target, at: now }],
                $slice: -20,
              },
            },
          },
        );
      }
    }
  } catch {
    // Still redirect the customer.
  }

  return NextResponse.redirect(target, 302);
}
