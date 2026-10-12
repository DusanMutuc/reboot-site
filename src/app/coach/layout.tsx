'use client';

import { usePathname } from 'next/navigation';
import AdminThemeRegistry from '@/components/AdminThemeRegistry';

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isBaseCoachPage = ['/coach', '/coach/', '/coach/members', '/coach/resources', '/coach/schedule'].includes(pathname);

  if (isBaseCoachPage) {
    return <>{children}</>;
  }

  return <AdminThemeRegistry>{children}</AdminThemeRegistry>;
}
