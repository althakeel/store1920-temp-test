import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StorePreference from '@/models/StorePreference';
import authSeller from '@/middlewares/authSeller';
import { DEFAULT_CHECKOUT_ALERT, normalizeCheckoutAlert } from '@/lib/checkoutAlert';

async function getUserIdFromRequest(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const idToken = authHeader.split(' ')[1];
  const { getAuth } = await import('firebase-admin/auth');
  const { initializeApp, getApps } = await import('firebase-admin/app');

  if (getApps().length === 0) initializeApp();

  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const storeId = await authSeller(userId);
    if (!storeId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });

    await connectDB();

    const preferences = await StorePreference.findOne({ storeId }).lean();
    return NextResponse.json({
      checkoutAlert: normalizeCheckoutAlert(preferences?.checkoutAlert || DEFAULT_CHECKOUT_ALERT),
    });
  } catch (error) {
    console.error('[Store Checkout Alert GET]', error);
    return NextResponse.json({ error: 'Failed to fetch checkout alert' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const storeId = await authSeller(userId);
    if (!storeId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const checkoutAlert = normalizeCheckoutAlert(body);

    if (checkoutAlert.enabled && !checkoutAlert.message) {
      return NextResponse.json(
        { error: 'English message is required when the alert is enabled' },
        { status: 400 },
      );
    }

    await connectDB();

    const preferences = await StorePreference.findOneAndUpdate(
      { storeId },
      { $set: { checkoutAlert } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    return NextResponse.json({
      message: 'Checkout alert saved',
      checkoutAlert: normalizeCheckoutAlert(preferences?.checkoutAlert),
    });
  } catch (error) {
    console.error('[Store Checkout Alert PUT]', error);
    return NextResponse.json({ error: 'Failed to save checkout alert' }, { status: 500 });
  }
}
