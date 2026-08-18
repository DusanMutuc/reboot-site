import MomentumShell from '@/components/home/MomentumShell';
import { getPlaceholderHomeData, parseCallStatus } from '@/components/home/placeholderData';
import { getOnePageExtras, parseVolume } from '@/components/home/onePagePlaceholderData';
import {
  getMeetings,
  placeholderPriorities,
  placeholderRequiredTraining,
  placeholderTrainingStanding,
} from '@/components/home/momentumPlaceholderData';
import {
  placeholderContent,
  placeholderRecommended,
} from '@/components/home/contentPlaceholderData';
import { parseAccent } from '@/components/home/accentOption';
import { parseLegend } from '@/components/home/legendOption';
import type { ContentSurface } from '@/lib/homeTheme';

export const dynamic = 'force-dynamic';

/**
 * Momentum layout, revised against the review notes: a single next-1-1 band,
 * three swappable priorities, assigned training beside the member's numbers,
 * and a content zone of a search field, one browsable preview of the library
 * opening on its recommendations, and the podcast.
 */
export default async function MomentumPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    volume?: string;
    surface?: string;
    accent?: string;
    legend?: string;
  }>;
}) {
  const { state, volume, surface, accent, legend } = await searchParams;
  const contentVolume = parseVolume(volume);
  const contentAccent = parseAccent(accent);
  const legendAccess = parseLegend(legend);
  const meetingScenario = parseCallStatus(state);
  const contentSurface: ContentSurface =
    surface === 'none' || surface === 'soft' || surface === 'deep' || surface === 'tint'
      ? surface
      : 'neutral';

  const base = getPlaceholderHomeData(meetingScenario);
  const isEmpty = contentVolume === 'empty';

  const data = isEmpty
    ? {
        ...base,
        continueItem: null,
        latestEpisode: null,
        metrics: base.metrics.map((metric) => ({ ...metric, value: '—', deltaPct: null })),
      }
    : base;

  return (
    <MomentumShell
      data={data}
      extras={getOnePageExtras(contentVolume)}
      meetings={getMeetings(meetingScenario)}
      priorities={isEmpty ? [] : placeholderPriorities}
      requiredTraining={isEmpty ? null : placeholderRequiredTraining}
      trainingStanding={placeholderTrainingStanding}
      recommended={isEmpty ? [] : placeholderRecommended}
      content={isEmpty ? [] : placeholderContent}
      volume={contentVolume}
      surface={contentSurface}
      accent={contentAccent}
      legendAccess={legendAccess}
    />
  );
}
