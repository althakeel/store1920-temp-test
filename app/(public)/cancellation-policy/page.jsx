import { redirect } from 'next/navigation';

/** Duplicate — use master policy at /return-policy */
export default function CancellationPolicyPage() {
  redirect('/return-policy');
}
