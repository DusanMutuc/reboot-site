import HomeShell from '@/components/home/HomeShell';
import { getPlaceholderHomeData, parseCallStatus } from '@/components/home/placeholderData';

export const dynamic = 'force-dynamic';

/**
 * Rebuilt member home, in review. Content is placeholder — see
 * `placeholderData.ts` for the wiring plan. The existing `/dashboard` route is
 * untouched.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  const data = getPlaceholderHomeData(parseCallStatus(state));

  return <HomeShell data={data} />;
}
