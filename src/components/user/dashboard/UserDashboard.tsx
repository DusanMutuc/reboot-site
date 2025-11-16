'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Stack } from '@mui/material';
import Grid from '@mui/material/Grid';
import { supabase } from '@/lib/supabaseClient';
import { fetchDashboardData } from '@/lib/dashboard';
import type { UserDashboardData } from '@/types/dashboard';

import KpiCharts from './KpiCharts';
import BigMoneyCards from './BigMoneyCards';
import KpiSection from './KpiSection';
import KpiMiniCards from './KpiMiniCards';
import ActionSteps from './ActionSteps';
import Wins from './Wins';
import Achievements from './Achievements';
import AttendanceSection from './AttendanceSection';

type Props = { userId: string };

export default function UserDashboard({ userId }: Props) {
  const [data, setData] = useState<UserDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchDashboardData(supabase, userId);
        if (!cancelled) setData(result);
      } catch (err) {
        console.error('Error loading dashboard data', err);
        if (!cancelled) setError('There was a problem loading your dashboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" mt={8}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box textAlign="center" mt={8}>
        <Typography variant="h6" color="error" gutterBottom>
          {error ?? 'No data available.'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Try refreshing the page or coming back later.
        </Typography>
      </Box>
    );
  }

  const { revenueProfit, kpi, attendance, coachingNotes, wins, achievements } = data;

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'block', gap: 3 }}>
        {/* ===== TOP SECTION ===== */}
        <Box sx={{ mb: 3 }}>
          <Grid container spacing={3}>
            {/* Column 1: 50% */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Stack spacing={1.5} sx={{ height: '100%' }}>
                <BigMoneyCards
                  currentRevenue={revenueProfit.currentRevenue}
                  currentProfit={revenueProfit.currentProfit}
                  revenueDeltaPct={revenueProfit.revenueDeltaPct}
                  profitDeltaPct={revenueProfit.profitDeltaPct}
                  periodLabel={revenueProfit.periodLabel}
                />

                <Box sx={{ mt: 1 }}>
                  <KpiCharts
                    series={data.kpiChart.series}
                    periodLabel={data.kpiChart.periodLabel}
                  />
                </Box>

                <KpiMiniCards
                  kpis={kpi.kpis}
                  mapping={{
                    totalClosed: 'total_closed',
                    fifteenThirty: 'fifteen_thirty',
                    repeatReferral: 'repeat_referral',
                    daysOff: 'days_off',
                  }}
                />
              </Stack>
            </Grid>

            {/* Column 2: 25% */}
            <Grid size={{ xs: 12, md: 3 }}>
              <ActionSteps steps={coachingNotes.actionSteps} />
            </Grid>

            {/* Column 3: 25% */}
            <Grid size={{ xs: 12, md: 3 }}>
              <Wins {...wins} />
            </Grid>
          </Grid>
        </Box>

        {/* ===== BOTTOM SECTION ===== */}
        <Box>
          <Grid container spacing={3}>
            {/* 2/3 width on desktop */}
            <Grid size={{ xs: 12, md: 7.5 }}>
              <AttendanceSection {...attendance} />
            </Grid>

            {/* 1/3 width on desktop */}
            <Grid size={{ xs: 12, md: 4.5 }}>
              <Achievements {...achievements} />
            </Grid>
          </Grid>
        </Box>
      </Box>
    </Box>
  );
}
