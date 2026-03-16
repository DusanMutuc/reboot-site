import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function CoachProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; courseId?: string }>;
}) {
  const { userId, courseId } = await searchParams;
  const qs = new URLSearchParams({ tab: 'progress' });
  if (userId) qs.set('userId', userId);
  if (courseId) qs.set('courseId', courseId);
  redirect(`/coach/students-overview?${qs.toString()}`);
}
