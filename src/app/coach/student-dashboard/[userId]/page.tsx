import { redirect } from 'next/navigation';

export default async function CoachStudentDashboardPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  redirect(`/coach/students-overview?userId=${encodeURIComponent(userId)}&tab=dashboard`);
}
