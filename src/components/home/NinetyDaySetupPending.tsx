import Link from 'next/link';
import { Box, Container, Typography } from '@mui/material';

import { brand, CARD_RADIUS, HOME_MAX_WIDTH } from '@/lib/homeTheme';

export default function NinetyDaySetupPending({ memberFirstName }: { memberFirstName: string }) {
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: brand.page, display: 'grid', placeItems: 'center', px: 2 }}>
      <Container maxWidth={false} sx={{ maxWidth: HOME_MAX_WIDTH }}>
        <Box
          sx={{
            maxWidth: 680,
            mx: 'auto',
            bgcolor: brand.card,
            border: `1px solid ${brand.border}`,
            borderRadius: CARD_RADIUS,
            p: { xs: 3, md: 5 },
          }}
        >
          <Typography variant="sectionLabel" component="h1" sx={{ fontSize: { xs: 28, md: 36 }, color: brand.ink }}>
            Your 90-day cycle is being set up
          </Typography>
          <Typography sx={{ mt: 2, color: brand.inkSoft, lineHeight: 1.7 }}>
            Hi {memberFirstName}. Your account is ready, but your group cycle has not been activated yet.
            Once the coach publishes the cycle, this page will show the current system, weekly call,
            Set Your Compass, and your three-month tracker.
          </Typography>
          <Box
            component={Link}
            href="/support"
            sx={{ mt: 3, display: 'inline-flex', color: brand.turquoiseDeep, fontWeight: 600 }}
          >
            Contact support
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
