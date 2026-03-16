import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface CoachKpiTrackerRouteProps {
  params: Promise<{ userId: string }>;
}

export default async function CoachKpiTrackerRoute({
  params,
}: CoachKpiTrackerRouteProps) {
  const { userId } = await params;
  redirect(`/coach/students-overview?userId=${encodeURIComponent(userId)}&tab=kpi`);
}
