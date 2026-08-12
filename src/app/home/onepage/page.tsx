import OnePageShell from '@/components/home/OnePageShell';
import { getPlaceholderHomeData, parseCallStatus } from '@/components/home/placeholderData';
import { onePageExtras } from '@/components/home/onePagePlaceholderData';

export const dynamic = 'force-dynamic';

/**
 * One-page variant of the rebuilt member home, for side-by-side review against
 * `/home`. Inherits the scoped theme from `src/app/home/layout.tsx`.
 */
export default async function OnePagePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  const data = getPlaceholderHomeData(parseCallStatus(state));

  return <OnePageShell data={data} extras={onePageExtras} />;
}
