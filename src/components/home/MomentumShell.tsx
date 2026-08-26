'use client';

import { Box, Container } from '@mui/material';
import {
  brand,
  contentSurfaces,
  HOME_MAX_WIDTH,
  type ContentSurface,
} from '@/lib/homeTheme';
import { AccentProvider } from './accent';
import type { Accent } from './accentOption';
import type { LegendAccess } from './legendOption';
import StickyBar from './StickyBar';
import MeetingBand from './MeetingBand';
import SprintCard from './SprintCard';
import StatsCard from './ProgressCard';
import AttendanceCard from './AttendanceCard';
import ContentBrowser from './ContentBrowser';
import ContentZoneBanner from './ContentZoneBanner';
import SearchWithResults from './SearchWithResults';
import { HubFooter } from './HubSections';
import type {
  ContentItem,
  HomeData,
  MeetingSlot,
  OnePageExtras,
  Priority,
  RequiredTraining,
  TrainingStanding,
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
 *   60-day sprint     the priorities and the required training, one card
 *   stats, attendance two reports, side by side
 *   ------------------ content zone ------------------
 *   search, browse
 *
 * Nothing in zone one is shaped like a shelf. Content appears there only when
 * it is attached to something the member owes — the guide written for an open
 * step, a training tied to a session. Rows of thumbnails make the same offer
 * as the browse grid below, and two identical offers either side of the break
 * is what stopped the break meaning anything.
 *
 * Zone two holds two objects and no more: a field to type into and one place
 * to browse. The podcast block is gone — episodes stay reachable through the
 * search engine, which is the only reason they were ever on this page.
 * Recommendations belong on this side — relatedness is a resemblance, not an
 * obligation — but as the browser's default view rather than a second
 * collection, which is what kept the zone feeling like loose parts.
 */
export default function MomentumShell({
  data,
  extras,
  meetings,
  priorities,
  requiredTraining,
  trainingStanding,
  recommended,
  content,
  surface = 'neutral',
  accent = 'brand',
  legendAccess = 'standard',
  year,
}: {
  data: HomeData;
  extras: OnePageExtras;
  meetings: MeetingSlot[];
  priorities: Priority[];
  requiredTraining: RequiredTraining | null;
  /** Fills the training slot when no course is assigned. */
  trainingStanding: TrainingStanding;
  /** The relatedness algorithm's picks, shown as the browser's default view. */
  recommended: ContentItem[];
  content: ContentItem[];
  /** Which candidate surface the content zone uses, for side-by-side review. */
  surface?: ContentSurface;
  /** Whether the logo's red is in play, for side-by-side review. */
  accent?: Accent;
  /** Whether the member holds the legend role, for side-by-side review. */
  legendAccess?: LegendAccess;
  /** Calendar year used by the live KPI snapshot. */
  year: number;
}) {
  const contentBg = contentSurfaces[surface] ?? contentSurfaces.neutral;

  return (
    <AccentProvider accent={accent}>
    <Box sx={{ minHeight: '100dvh', bgcolor: brand.page, display: 'flex', flexDirection: 'column' }}>
      <StickyBar
        memberFirstName={data.memberFirstName}
        status={data.callStatus}
        nextCall={data.nextCall}
        bookingOptions={data.bookingOptions}
        roomOptions={data.roomOptions}
        isLegend={legendAccess === 'legend'}
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
            <SprintCard
              priorities={priorities}
              requiredTraining={requiredTraining}
              trainingStanding={trainingStanding}
            />

            {/* Two reports, side by side. They answer different questions —
                what you produced, and whether you turned up — and sharing one
                card meant neither got a heading big enough to read. */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                gap: { xs: 2.5, md: 3 },
                alignItems: 'stretch',
              }}
            >
              <StatsCard metrics={data.metrics} year={year} />
              <AttendanceCard attendance={extras.coachingAttendance} />
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
                <SearchWithResults index={extras.searchIndex} large live />
              </Box>

              <ContentBrowser items={content} recommended={recommended} />
            </Box>
          </Container>
        </Box>
      </Box>

      {/* Flush: the content zone is a full-bleed tinted surface, so the
          footer's usual leading margin would show a strip of page background
          between two committed colours. */}
      <HubFooter helpSteps={extras.helpSteps} links={data.utilityLinks} flush />
    </Box>
    </AccentProvider>
  );
}
