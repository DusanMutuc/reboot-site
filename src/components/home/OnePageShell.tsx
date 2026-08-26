'use client';

import { Box, Container } from '@mui/material';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';
import StickyBar from './StickyBar';
import RightNowBand from './RightNowBand';
import TrainingPanel from './TrainingPanel';
import BookingPanel from './BookingPanel';
import NumbersStrip from './NumbersStrip';
import { FocusSection, HelpSection, PodcastSection, ProgressSection } from './OnePageSections';
import UtilityFooter from './UtilityFooter';
import type { HomeData, OnePageExtras } from './types';

/**
 * One-page variant. Same components as `/home`, but the depth is inlined below
 * the fold in frequency order instead of living on separate routes, and the
 * sticky bar carries a compact version of the call band once it scrolls away.
 */
export default function OnePageShell({
  data,
  extras,
}: {
  data: HomeData;
  extras: OnePageExtras;
}) {
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: brand.page, display: 'flex', flexDirection: 'column' }}>
      <StickyBar
        memberFirstName={data.memberFirstName}
        status={data.callStatus}
        nextCall={data.nextCall}
      />

      <RightNowBand
        id="now"
        status={data.callStatus}
        nextCall={data.nextCall}
        lastCall={data.lastCall}
        bookHref="#calls"
      />

      <Box component="main" sx={{ flex: 1 }}>
        <Container maxWidth={false} sx={{ maxWidth: HOME_MAX_WIDTH, px: { xs: 2.5, md: 4 } }}>
          <Box
            sx={{
              py: { xs: 3, md: 4 },
              display: 'flex',
              flexDirection: 'column',
              gap: { xs: 3.5, md: 4.5 },
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.5fr) minmax(0, 1fr)' },
                gap: 3,
                alignItems: 'start',
              }}
            >
              <TrainingPanel
                continueItem={data.continueItem}
                browseTiles={data.browseTiles}
                latestEpisode={null}
                searchIndex={extras.searchIndex}
              />
              <Box id="calls">
                <BookingPanel
                  bookingOptions={data.bookingOptions}
                  roomOptions={data.roomOptions}
                />
              </Box>
            </Box>

            <Box id="numbers">
              <NumbersStrip metrics={data.metrics} />
            </Box>

            <FocusSection steps={extras.actionSteps} />

            <PodcastSection episodes={extras.episodes} />

            <ProgressSection
              attendance={extras.attendance}
              wins={extras.wins}
              achievements={extras.achievements}
            />
          </Box>
        </Container>

        <HelpSection steps={extras.helpSteps} />
      </Box>

      <UtilityFooter links={data.utilityLinks} />
    </Box>
  );
}
