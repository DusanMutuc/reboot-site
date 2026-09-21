import type { ReactNode } from 'react';
import AdminThemeRegistry from '@/components/AdminThemeRegistry';

/** Match the dashboard scale used by the coaching student workspace. */
export default function TrackerLayout({ children }: { children: ReactNode }) {
  return <AdminThemeRegistry>{children}</AdminThemeRegistry>;
}
