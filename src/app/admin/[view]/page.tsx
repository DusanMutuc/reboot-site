import AdminPageShell from '@/components/admin/AdminPageShell';

export default async function AdminViewPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;

  return <AdminPageShell currentView={view} />;
}
