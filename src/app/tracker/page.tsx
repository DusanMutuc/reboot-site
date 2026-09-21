'use client';

import { useEffect, useState } from 'react';
import { Box, Container, Stack, Typography } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import BackButton from '@/components/BackButton';
import KpiTracker from '@/components/KpiTracker';
import UserDashboardExpanded from '@/components/user/dashboard/UserDashboardExpanded';
import { supabase } from '@/lib/supabaseClient';
import trackerTheme from '@/lib/trackerTheme';

export default function TrackerPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [dashKey, setDashKey] = useState(0); // used as refreshSignal

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setUserId(data.user?.id ?? null);
    })();
    return () => { alive = false; };
  }, []);

  const handleKpiSaved = () => setDashKey((k) => k + 1);

  return (
    <Box sx={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #f8f9fa 0%, #e9f5f2 100%)' }}>
      {/* Sticky header for parity with Courses/Library */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backdropFilter: 'saturate(180%) blur(8px)',
          backgroundColor: 'rgba(255,255,255,0.75)',
          borderBottom: '1px solid',
          borderColor: 'grey.100',
        }}
      >
        <Container maxWidth="lg" sx={{ py: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <BackButton variant="icon" label="Back" fallbackHref="/home" />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Tracker
            </Typography>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 8 }}>

        {/* KPI tracker: tell us when it saves */}
        <ThemeProvider theme={trackerTheme}>
          <KpiTracker onSaved={handleKpiSaved} />
        </ThemeProvider>

        {/* Dashboard below; refetch when refreshSignal changes */}
        {userId && (
          <Box sx={{ mt: 6 }}>
            <UserDashboardExpanded
              userId={userId}
              refreshSignal={dashKey}
              compactMetricLabels
              kpiContentTextBump
            />
          </Box>
        )}
      </Container>
    </Box>
  );
}
