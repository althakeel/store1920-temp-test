import connectDB from '@/lib/mongodb';
import StorePreference from '@/models/StorePreference';
import { normalizeCheckoutAlert } from '@/lib/checkoutAlert';

export async function getCheckoutAlertForStorefront() {
  try {
    await connectDB();
    const preference = await StorePreference.findOne({})
      .sort({ updatedAt: -1 })
      .select('checkoutAlert')
      .lean();
    return normalizeCheckoutAlert(preference?.checkoutAlert);
  } catch (error) {
    console.error('[getCheckoutAlertForStorefront]', error);
    return normalizeCheckoutAlert();
  }
}
