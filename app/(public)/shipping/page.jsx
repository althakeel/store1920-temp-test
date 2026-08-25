import { redirect } from 'next/navigation';

/** Stub page — permanently redirected to /shipping-policy */
export default function ShippingPage() {
  redirect('/shipping-policy');
}
