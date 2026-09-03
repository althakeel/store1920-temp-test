import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmailHistory from '@/models/EmailHistory';

/** 1x1 transparent GIF */
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

export const dynamic = 'force-dynamic';

/**
 * Public email open pixel (marketing). Prefer /e/open over /api/email/track/open.
 */
export async function GET(request) {
  try {
    const token = String(new URL(request.url).searchParams.get('t') || '').trim();
    if (token) {
      await connectDB();
      const now = new Date();
      const row = await EmailHistory.findOne({ trackingToken: token })
        .select('_id openCount firstOpenedAt')
        .lean();
      if (row?._id) {
        await EmailHistory.updateOne(
          { _id: row._id },
          {
            $inc: { openCount: 1 },
            $set: {
              lastOpenedAt: now,
              updatedAt: now,
              ...(row.firstOpenedAt ? {} : { firstOpenedAt: now }),
            },
          },
        );
      }
    }
  } catch {
    // Always return the pixel.
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
