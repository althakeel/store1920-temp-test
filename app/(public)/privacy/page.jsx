import { redirect } from 'next/navigation';

/** Stub page — permanently redirected to /privacy-policy */
export default function PrivacyPage() {
  redirect('/privacy-policy');
}
