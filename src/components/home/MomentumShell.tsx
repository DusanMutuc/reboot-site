'use client';

import { Box, Container } from '@mui/material';
import {
  brand,
  contentSurfaces,
  HOME_MAX_WIDTH,
  type ContentSurface,
} from '@/lib/homeTheme';
import StickyBar from './StickyBar';
import MeetingBand from './MeetingBand';
import PrioritiesModule from './PrioritiesModule';
import RequiredTrainingCard from './RequiredTrainingCard';
import ProgressCard from './ProgressCard';
import PodcastCard from './PodcastCard';
import ContentBrowser from './ContentBrowser';
import ContentZoneBanner from './ContentZoneBanner';
import SearchWithResults from './SearchWithResults';
import { HubFooter } from './HubSections';
import CompareStrip from './CompareStrip';
import type { ContentVolume } from './onePagePlaceholderData';
import type {
  ContentItem,
  HomeData,
  MeetingSlot,
  OnePageExtras,
  Priority,
  RequiredTraining,
} from './types';

/**
 * Momentum layout, revised against the review notes.
 *
 * The job is still to lower activation energy rather than route someone who
 * already knows what they want. What changed is that the member sees their
 * whole sprint rather than a single resolved step — but only one of the three
 * is expanded at a time, so it is still "do this or not" rather than a menu.
 *
 *   meetings          both required meetings; unbooked is a state, not a gap
 *   priorities        three action steps, swappable, one expanded
 *   training tier     assigned training + the member's numbers
 *   ------------------ content zone ------------------
 *   search, browse, podcast
 *
 * Nothing in zone one is shaped like a shelf. Content appears there only when
 * it is attached to something the member owes — the guide written for an open
 * step, a training tied to a session. Rows of thumbnails make the same offer
 * as the browse grid below, and two identical offers either side of the break
 * is what stopped the break meaning anything.
 *
 * Zone two holds three objects and no more: a field to type into, one place to
 * browse, and the podcast. Recommendations belong on this side — relatedness
 * is a resemblance, not an obligation — but as the browser's default view
 * rather than a second collection, which is what kept the zone feeling like
 * loose parts.
 */
export default function MomentumShell({
  data,
  extras,
  meetings,
  priorities,
  requiredTraining,
  recommended,
  content,
  volume = 'typical',
  surface = 'neutral',
}: {
  data: HomeData;
  extras: OnePageExtras;
  meetings: MeetingSlot[];
  priorities: Priority[];
  requiredTraining: RequiredTraining | null;
  /** The relatedness algorithm's picks, shown as the browser's default view. */
  recommended: ContentItem[];
  content: ContentItem[];
  volume?: ContentVolume;
  /** Which candidate surface the content zone uses, for side-by-side review. */
  surface?: ContentSurface;
}) {
  const contentBg = contentSurfaces[surface] ?? contentSurfaces.neutral;

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: brand.page, display: 'flex', flexDirection: 'column' }}>
      <StickyBar
        memberFirstName={data.memberFirstName}
        status={data.callStatus}
        nextCall={data.nextCall}
        bookingOptions={data.bookingOptions}
        roomOptions={data.roomOptions}
        calendar={data.calendar}
      />

      <MeetingBand meetings={meetings} />

      <Box component="main" sx={{ flex: 1 }}>
        {/* Zone one: the member. Everything here reports on them or asks
            something of them. Sits on the page background. */}
        <Container maxWidth={false} sx={{ maxWidth: HOME_MAX_WIDTH, px: { xs: 2.5, md: 4 } }}>
          <Box
            sx={{
              pt: { xs: 3.5, md: 5 },
              pb: { xs: 5, md: 8 },
              display: 'flex',
              flexDirection: 'column',
              gap: { xs: 5, md: 8 },
            }}
          >
            <PrioritiesModule priorities={priorities} />

            {/* Assigned training beside the member's numbers. The unfinished
                course card is gone — one learning card is enough, and the
                numbers earn the second slot rather than a section of their own. */}
            <Box
              component="section"
              id="numbers"
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  md: requiredTraining ? 'repeat(2, minmax(0, 1fr))' : '1fr',
                },
                gap: { xs: 2.5, md: 3 },
                alignItems: 'stretch',
              }}
            >
              {requiredTraining ? <RequiredTrainingCard training={requiredTraining} /> : null}
              <ProgressCard
                metrics={data.metrics}
                attendance={extras.attendance}
                wide={!requiredTraining}
              />
            </Box>
          </Box>
        </Container>

        {/* Zone two: content. A full-bleed surface change carries the split —
            a hairline rule was doing work it could not do. Calls moved up into
            zone one, since a member's own calls are status, not content. */}
        <ContentZoneBanner />

        <Box sx={{ bgcolor: contentBg }}>
          <Container maxWidth={false} sx={{ maxWidth: HOME_MAX_WIDTH, px: { xs: 2.5, md: 4 } }}>
            <Box
              sx={{
                pt: { xs: 4, md: 5 },
                pb: { xs: 5, md: 7 },
                display: 'flex',
                flexDirection: 'column',
                gap: { xs: 5, md: 7 },
              }}
            >
              {/* No heading here: the banner announces the zone, and the old
                  "Or look something up" was continuation copy working against
                  the break it sat on. */}
              <Box component="section" id="training">
                <SearchWithResults index={extras.searchIndex} large />
              </Box>

              <ContentBrowser items={content} recommended={recommended} />

              <PodcastCard episodes={extras.episodes} />

              <CompareStrip
                currentPath="/home/momentum"
                status={data.callStatus}
                volume={volume}
                surface={surface}
              />
            </Box>
          </Container>
        </Box>
      </Box>

      <HubFooter helpSteps={extras.helpSteps} links={data.utilityLinks} />
    </Box>
  );
}
