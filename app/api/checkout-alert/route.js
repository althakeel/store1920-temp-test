import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StorePreference from '@/models/StorePreference';
import { getActiveCheckoutAlert, normalizeCheckoutAlert } from '@/lib/checkoutAlert';

export async function GET() {
  try {
    await connectDB();

    const preference = await StorePreference.findOne({})
      .sort({ updatedAt: -1 })
      .lean();

    const checkoutAlert = normalizeCheckoutAlert(preference?.checkoutAlert);

    return NextResponse.json(
      { checkoutAlert },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=120',
        },
      },
    );
  } catch (error) {
    console.error('[Public Checkout Alert GET]', error);
    return NextResponse.json({ checkoutAlert: normalizeCheckoutAlert() });
  }
}

export { getActiveCheckoutAlert };
