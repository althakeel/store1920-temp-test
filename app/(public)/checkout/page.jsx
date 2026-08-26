import CheckoutPageUI from './CheckoutPageUI';
import { getCheckoutAlertForStorefront } from '@/lib/checkoutAlertServer';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const checkoutAlert = await getCheckoutAlertForStorefront();
  return <CheckoutPageUI initialCheckoutAlert={checkoutAlert} />;
}
