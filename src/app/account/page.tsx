import type { Metadata } from 'next';
import AccountSettingsClient from './AccountSettingsClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Account settings | Reboot' };

export default function AccountPage() {
  return <AccountSettingsClient />;
}
