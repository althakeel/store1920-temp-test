import { NextResponse } from 'next/server';
import { runPickupOverdueAlerts } from '@/lib/pickupOverdueAlerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cron: email admin when pickup was requested 24h+ ago and still not picked up.
 * GET /api/cron/pickup-overdue-alert
 */
export async function GET(request) {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const authorization = request.headers.get('authorization') || '';
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
    const result = await runPickupOverdueAlerts({ dryRun });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[cron/pickup-overdue-alert]', error);
    return NextResponse.json(
      { error: error?.message || 'Pickup overdue alert failed' },
      { status: 500 },
    );
  }
}
