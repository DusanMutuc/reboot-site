// src/app/login/page.tsx
import LoginClient from './LoginClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function safeRedirectPath(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return null;
  return candidate;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  const params = await searchParams;
  return <LoginClient redirectTo={safeRedirectPath(params.redirectTo)} />;
}
