import AdminThemeRegistry from '@/components/AdminThemeRegistry';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminThemeRegistry>{children}</AdminThemeRegistry>;
}
