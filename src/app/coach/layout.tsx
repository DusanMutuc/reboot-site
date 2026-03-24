'use client';

import { usePathname } from 'next/navigation';
import AdminThemeRegistry from '@/components/AdminThemeRegistry';

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isBaseCoachPage = pathname === '/coach' || pathname === '/coach/';

  if (isBaseCoachPage) {
    return <>{children}</>;
  }

  return <AdminThemeRegistry>{children}</AdminThemeRegistry>;
}
