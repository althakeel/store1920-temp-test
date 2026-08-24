import { redirect } from 'next/navigation';

export default function StoreUsersRedirect() {
  redirect('/store/settings?tab=team');
}
