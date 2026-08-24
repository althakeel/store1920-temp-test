import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { isAuthorizedCronRequest } from '@/lib/cronAuth';
import { processDueAbandonedCartWhatsAppReminders } from '@/lib/abandonedCheckoutWhatsAppReminder';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const result = await processDueAbandonedCartWhatsAppReminders({ limit: 25 });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[cron/abandoned-checkout-whatsapp GET]', error);
    return NextResponse.json({ error: error?.message || 'Cron failed' }, { status: 500 });
  }
}
