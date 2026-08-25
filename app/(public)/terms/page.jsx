import { redirect } from 'next/navigation';

/** Stub page — permanently redirected to /terms-and-conditions */
export default function TermsPage() {
  redirect('/terms-and-conditions');
}
