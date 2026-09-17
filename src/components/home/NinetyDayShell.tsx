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
import StickyBar from './StickyBar';
import MeetingBand from './MeetingBand';
import ProgrammeCard from './ProgrammeCard';
import TrackerPanel from './TrackerPanel';
import ContentZoneBanner from './ContentZoneBanner';
import SystemsGrid from './SystemsGrid';
import { HubFooter } from './HubSections';
import type {
  ContentItem,
  CurrentFocus,
  HomeData,
  MeetingSlot,
  OnePageExtras,
  ProgrammeWeek,
  RequiredTraining,
  ProgrammeMonth,
} from './types';

/**
 * Home for a member on the 90-day offer.
 *
 * The Momentum layout, kept: same band, same two zones, same break between
 * what the member owes and what the library offers. That is not economy. These
 * two members sit in the same community and will look over each other's
 * shoulders, and a second layout would say the offer is a different product
 * rather than a different length of the same one.
 *
 *   meeting           the weekly group call, from a different source
 *   your 90 days      one focus, one course, and the week you are in
 *   your tracker      all eight figures, one month at a time
 *   ------------------ content zone ------------------
 *   eight systems
 *
 * Four things did not survive the move, and each is a place where the offer
 * genuinely differs rather than a place the design was wrong:
 *
 * 1  The band never reaches its `book` state. Both standard meetings are the
 *    member's to book, so an unbooked one is a gap worth a dark textured field
 *    and a call to action. A weekly group call is on the calendar whether or
 *    not the member does anything, so the band here only ever resolves to
 *    "it's on" or "join it". The most designed state on the page is the one
 *    these members never see — see the note on `getWeeklyMeeting`.
 *
 * 2  The browse grid stops being a preview. Eight systems, a grid that holds
 *    eight, and so the chips, the recommender and the two escape links all
 *    come out. `SystemsGrid` argues the case.
 *
 * 3  Search drops out. The programme library is a closed set and is already on
 *    screen in its entirety.
 *
 * 4  The two report cards become one. A year-to-date snapshot summarises a
 *    period ten months longer than the membership, and a single-cadence
 *    attendance row is a sentence rather than a report. `TrackerPanel` makes
 *    the case; the short version is that ninety days is three months, which is
 *    small enough to simply show.
 *
 * The page that comes out of this is made of closed sets — three months, eight
 * figures, eight systems, thirteen weeks — where the standard home is made of
 * previews onto things too large to show. That is the actual difference
 * between the two products, and it is worth the layout saying so.
 */
export default function NinetyDayShell({
  data,
  extras,
  meetings,
  focus,
  week,
  course,
  systems,
  trackerMonths,
  surface = 'neutral',
  accent = 'brand',
}: {
  data: HomeData;
  extras: OnePageExtras;
  /** The weekly group call. Same shape as the standard band, different source. */
  meetings: MeetingSlot[];
  /** Set cohort-wide and rotated weekly. Null before the first one lands. */
  focus: CurrentFocus | null;
  week: ProgrammeWeek;
  /** Set Your Compass, for the whole ninety days. */
  course: RequiredTraining | null;
  /** The eight the programme includes — the whole library, not a preview. */
  systems: ContentItem[];
  /** The programme's three months, newest last. Figures are read live. */
  trackerMonths: ProgrammeMonth[];
  surface?: ContentSurface;
  accent?: Accent;
}) {
  const contentBg = contentSurfaces[surface] ?? contentSurfaces.neutral;

  return (
    <AccentProvider accent={accent}>
      <Box sx={{ minHeight: '100dvh', bgcolor: brand.page, display: 'flex', flexDirection: 'column' }}>
        <StickyBar
          homeHref="/home/ninety-day"
          memberFirstName={data.memberFirstName}
          status={data.callStatus}
          nextCall={data.nextCall}
          bookingOptions={data.bookingOptions}
          roomOptions={data.roomOptions}
          isLegend={false}
          calendar={data.calendar}
        />

        <MeetingBand meetings={meetings} />

        <Box component="main" sx={{ flex: 1 }}>
          {/* Zone one: the member. */}
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
              <ProgrammeCard focus={focus} week={week} course={course} />

              <TrackerPanel months={trackerMonths} />
            </Box>
          </Container>

          {/* Zone two: content. The copy changes because the promise does —
              "find every system" is a sentence this library cannot honour. */}
          <ContentZoneBanner
            title="Your 90-day library"
            subtitle="The eight systems included in your cycle."
          />

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
                <SystemsGrid
                  systems={systems}
                  blurb="Every system included in the 90-day programme. There are eight, and these are them."
                />
              </Box>
            </Container>
          </Box>
        </Box>

        <HubFooter helpSteps={extras.helpSteps} links={data.utilityLinks} flush />
      </Box>
    </AccentProvider>
  );
}
