import { redirect } from 'next/navigation';

/** Keep legacy bookmarks working now that Momentum is the member home. */
export default function LegacyDashboardRedirect() {
  redirect('/home');
}
