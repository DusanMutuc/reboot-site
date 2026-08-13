'use client';

import { Box, Container } from '@mui/material';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';
import StickyBar from './StickyBar';
import RightNowBand from './RightNowBand';
import { CallsRow, HubFooter, ProgressRegion, TrainingHero } from './HubSections';
import CompareStrip from './CompareStrip';
import type { ContentVolume } from './onePagePlaceholderData';
import type { HomeData, OnePageExtras } from './types';

/**
 * Hierarchy pass. Four regions of deliberately different weight rather than
 * eight of the same:
 *
 *   1  the call band          full-bleed, textured, display type
 *   2  search                 the single most prominent control on the page
 *   3  calls                  one compact row; the band already carries urgency
 *   4  progress               borderless data strip, smaller heading
 *      footer                 help and community, demoted out of the body
 *
 * Separation is whitespace rather than borders, so the eye groups by proximity
 * instead of reading a grid of equally-weighted boxes.
 */
export default function HubShell({
  data,
  extras,
  volume = 'typical',
}: {
  data: HomeData;
  extras: OnePageExtras;
  volume?: ContentVolume;
}) {
  const latest = extras.episodes.length > 0 ? extras.episodes[0] : null;

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
              pt: { xs: 4, md: 6 },
              pb: { xs: 2, md: 3 },
              display: 'flex',
              flexDirection: 'column',
              gap: { xs: 6, md: 10 },
            }}
          >
            <TrainingHero
              searchIndex={extras.searchIndex}
              continueItem={data.continueItem}
              browseTiles={data.browseTiles}
              latestEpisode={latest}
            />

            <CallsRow bookingOptions={data.bookingOptions} roomOptions={data.roomOptions} />

            <ProgressRegion
              metrics={data.metrics}
              steps={extras.actionSteps}
              attendance={extras.attendance}
              wins={extras.wins}
              achievements={extras.achievements}
            />

            <CompareStrip currentPath="/home/hub" status={data.callStatus} volume={volume} />
          </Box>
        </Container>
      </Box>

      <HubFooter helpSteps={extras.helpSteps} links={data.utilityLinks} />
    </Box>
  );
}
