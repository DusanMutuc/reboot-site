import type { Metadata } from 'next';
import VerifyBackupEmailClient from './VerifyBackupEmailClient';

export const metadata: Metadata = { title: 'Verify backup email | Reboot', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default function VerifyBackupEmailPage() { return <VerifyBackupEmailClient />; }
