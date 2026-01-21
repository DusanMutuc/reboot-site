// src/app/coach/kpi-tracker/[userId]/page.tsx
import CoachKpiTrackerPage from '@/components/coach/CoachKpiTrackerPage';

export const dynamic = 'force-dynamic';

interface CoachKpiTrackerRouteProps {
  params: { userId: string };
}

export default function CoachKpiTrackerRoute({ params }: CoachKpiTrackerRouteProps) {
  return <CoachKpiTrackerPage userId={params.userId} />;
}
