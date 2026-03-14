// src/app/coach/kpi-tracker/[userId]/page.tsx
import CoachKpiTrackerPage from '@/components/coach/CoachKpiTrackerPage';

export const dynamic = 'force-dynamic';

interface CoachKpiTrackerRouteProps {
  params: Promise<{ userId: string }>;
}

export default async function CoachKpiTrackerRoute({
  params,
}: CoachKpiTrackerRouteProps) {
  const { userId } = await params;
  return <CoachKpiTrackerPage userId={userId} />;
}
