// src/app/login/page.tsx
import LoginClient from './LoginClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function safeRedirectPath(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || /[\\\u0000-\u001f]/.test(candidate)) return null;
  return candidate;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[]; passwordUpdated?: string | string[] }>;
}) {
  const params = await searchParams;
  return <LoginClient redirectTo={safeRedirectPath(params.redirectTo)} passwordUpdated={params.passwordUpdated === '1'} backupEmailEnabled={process.env.BACKUP_EMAIL_ENABLED === 'true'} />;
}
