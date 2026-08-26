import HubShell from '@/components/home/HubShell';
import { getPlaceholderHomeData, parseCallStatus } from '@/components/home/placeholderData';
import { getOnePageExtras, parseVolume } from '@/components/home/onePagePlaceholderData';

export const dynamic = 'force-dynamic';

/**
 * Hierarchy pass on the one-page layout. Same content as `/home/onepage`,
 * reorganised into four regions of differing visual weight with search as the
 * centerpiece.
 */
export default async function HubPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; volume?: string }>;
}) {
  const { state, volume } = await searchParams;
  const contentVolume = parseVolume(volume);
  const base = getPlaceholderHomeData(parseCallStatus(state));

  const data =
    contentVolume === 'empty'
      ? {
          ...base,
          continueItem: null,
          latestEpisode: null,
          metrics: base.metrics.map((metric) => ({ ...metric, value: '—', deltaPct: null })),
        }
      : base;

  return <HubShell data={data} extras={getOnePageExtras(contentVolume)} />;
}
