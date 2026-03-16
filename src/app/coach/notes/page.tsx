import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function CoachNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const { userId } = await searchParams;
  const qs = new URLSearchParams({ tab: 'notes' });
  if (userId) qs.set('userId', userId);
  redirect(`/coach/students-overview?${qs.toString()}`);
}
