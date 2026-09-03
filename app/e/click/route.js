import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmailHistory from '@/models/EmailHistory';
import { resolveTrackedRedirectUrl } from '@/lib/emailMarketingTracking';

export const dynamic = 'force-dynamic';

function readParam(request, name) {
  const url = new URL(request.url);
  const fromParams = url.searchParams.get(name);
  if (fromParams) return fromParams;
  const match = String(request.url || '').match(new RegExp(`[?&]${name}=([^&]+)`, 'i'));
  return match ? match[1] : '';
}

/**
 * Public email click redirect (used by marketing emails).
 * Prefer this over /api/email/track/click — some deploys 404 new API paths.
 */
export async function GET(request) {
  const token = String(readParam(request, 't') || '').trim();
  const target = resolveTrackedRedirectUrl(readParam(request, 'u'));

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
    // Always redirect.
  }

  return NextResponse.redirect(target, 302);
}
