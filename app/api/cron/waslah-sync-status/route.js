import { NextResponse } from 'next/server';
import { processWaslahScheduledStatusSync } from '@/lib/waslahScheduledStatusSync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Vercel cron: poll Waslah POST /orders/history every 3 hours.
 * Batches ~10 shipments per call with a delay between batches (Waslah requirement).
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(request) {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const authorization = request.headers.get('authorization') || '';
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await processWaslahScheduledStatusSync();
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error('[cron/waslah-sync-status]', error);
    return NextResponse.json(
      { error: error?.message || 'Waslah status sync cron failed' },
      { status: 500 },
    );
  }
}
