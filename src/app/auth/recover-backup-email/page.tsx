import type { Metadata } from 'next';
import RecoverBackupEmailClient from './RecoverBackupEmailClient';

export const metadata: Metadata = { title: 'Recover your account | Reboot', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default function RecoverBackupEmailPage() { return <RecoverBackupEmailClient />; }
