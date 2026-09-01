'use client';

import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import Link from 'next/link';
import { Box, Button, Container, Stack, Typography } from '@mui/material';

import KpiTracker from '@/components/KpiTracker';

export default function NinetyDayTrackerPage() {
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: '#f4f6f4' }}>
      <Box sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: 'rgba(255,255,255,.94)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #dbe2df' }}>
        <Container maxWidth="lg" sx={{ py: 1.25 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Button component={Link} href="/home/ninety-day" color="inherit" startIcon={<ArrowBackRoundedIcon />}>90-day home</Button>
            <Typography variant="h6" fontWeight={800}>Tracker</Typography>
          </Stack>
        </Container>
      </Box>
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}>
        <KpiTracker />
      </Container>
    </Box>
  );
}
