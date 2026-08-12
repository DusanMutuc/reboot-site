import OnePageShell from '@/components/home/OnePageShell';
import { getPlaceholderHomeData, parseCallStatus } from '@/components/home/placeholderData';
import { getOnePageExtras, parseVolume } from '@/components/home/onePagePlaceholderData';

export const dynamic = 'force-dynamic';

/**
 * One-page variant of the rebuilt member home, for side-by-side review against
 * `/home`. Inherits the scoped theme from `src/app/home/layout.tsx`.
 */
export default async function OnePagePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; volume?: string }>;
}) {
  const { state, volume } = await searchParams;
  const contentVolume = parseVolume(volume);
  const base = getPlaceholderHomeData(parseCallStatus(state));

  // A brand-new member has no numbers and nothing in progress either, so the
  // empty case has to clear HomeData as well as the extras.
  const data =
    contentVolume === 'empty'
      ? {
          ...base,
          continueItem: null,
          latestEpisode: null,
          metrics: base.metrics.map((metric) => ({ ...metric, value: '—', deltaPct: null })),
        }
      : base;

  return (
    <OnePageShell
      data={data}
      extras={getOnePageExtras(contentVolume)}
      volume={contentVolume}
    />
  );
}
