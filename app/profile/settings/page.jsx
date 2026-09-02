import { redirect } from 'next/navigation';

/**
 * Legacy email footer links pointed here and 404'd.
 * Keep this route so old emails still reach the unsubscribe flow.
 */
export default function ProfileSettingsRedirect({ searchParams }) {
  const params = searchParams || {};
  const query = new URLSearchParams();
  if (params.unsubscribe) query.set('unsubscribe', String(params.unsubscribe));
  if (params.type) query.set('type', String(params.type));
  if (params.email) query.set('email', String(params.email));

  const suffix = query.toString();
  redirect(suffix ? `/unsubscribe?${suffix}` : '/unsubscribe');
}
