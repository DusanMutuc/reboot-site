'use client';

import { Box, Container } from '@mui/material';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';
import HomeHeader from './HomeHeader';
import RightNowBand from './RightNowBand';
import TrainingPanel from './TrainingPanel';
import BookingPanel from './BookingPanel';
import NumbersStrip from './NumbersStrip';
import UtilityFooter from './UtilityFooter';
import CompareStrip from './CompareStrip';
import type { HomeData } from './types';

export default function HomeShell({ data }: { data: HomeData }) {
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: brand.page, display: 'flex', flexDirection: 'column' }}>
      <HomeHeader memberFirstName={data.memberFirstName} />

      <RightNowBand status={data.callStatus} nextCall={data.nextCall} lastCall={data.lastCall} />

      <Box component="main" sx={{ flex: 1 }}>
        <Container maxWidth={false} sx={{ maxWidth: HOME_MAX_WIDTH, px: { xs: 2.5, md: 4 } }}>
          <Box sx={{ py: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', gap: { xs: 3, md: 4 } }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.5fr) minmax(0, 1fr)' },
                gap: { xs: 3, md: 3 },
                alignItems: 'start',
              }}
            >
              <TrainingPanel
                continueItem={data.continueItem}
                browseTiles={data.browseTiles}
                latestEpisode={data.latestEpisode}
              />
              <BookingPanel bookingOptions={data.bookingOptions} roomOptions={data.roomOptions} />
            </Box>

            <NumbersStrip metrics={data.metrics} />

            <CompareStrip currentPath="/home" status={data.callStatus} />
          </Box>
        </Container>
      </Box>

      <UtilityFooter links={data.utilityLinks} />
    </Box>
  );
}
