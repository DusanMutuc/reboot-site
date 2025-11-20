// src/components/user/dashboard/UserDashboard.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
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
import CoachingNotesSection from './CoachingNotesSection';

type Props = {
  userId: string;
  /** Change this value to refresh ONLY the KPI chart (no remount). */
  refreshSignal?: number | string;
};

export default function UserDashboard({ userId, refreshSignal }: Props) {
  const [data, setData] = useState<UserDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // chart-only refresh UX
  const [chartRefreshing, setChartRefreshing] = useState(false);
  const [chartVersion, setChartVersion] = useState(0);

  // Refs to measure heights
  const topRowRef = useRef<HTMLDivElement>(null);
  const bottomRowRef = useRef<HTMLDivElement>(null);
  const [topRowHeight, setTopRowHeight] = useState<number | null>(null);
  const [bottomRowHeight, setBottomRowHeight] = useState<number | null>(null);

  // 1) Full fetch on first load or when userId changes
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
    return () => { cancelled = true; };
  }, [userId]);

  // 2) Chart-only refetch when refreshSignal changes
  useEffect(() => {
    if (!refreshSignal || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        setChartRefreshing(true);
        // We reuse fetchDashboardData for simplicity, but only keep its kpiChart part.
        const result = await fetchDashboardData(supabase, userId);
        if (cancelled) return;
        setData(prev =>
          prev
            ? { ...prev, kpiChart: result.kpiChart } // replace only the chart data
            : result
        );
        setChartVersion(v => v + 1); // bump to re-animate chart
      } catch (err) {
        console.error('Error refreshing KPI chart', err);
        // Non-fatal; don't surface as page error
      } finally {
        if (!cancelled) setChartRefreshing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshSignal, userId]);

  // Measure heights after data loads and on window resize
  useEffect(() => {
    if (!data) return;
    const measureHeights = () => {
      requestAnimationFrame(() => {
        if (topRowRef.current) setTopRowHeight(topRowRef.current.offsetHeight);
        if (bottomRowRef.current) setBottomRowHeight(bottomRowRef.current.offsetHeight);
      });
    };
    measureHeights();
    window.addEventListener('resize', measureHeights);
    return () => window.removeEventListener('resize', measureHeights);
  }, [data]);

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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* ===== TOP SECTION ===== */}
        <Box>
          <Grid container spacing={3}>
            {/* Column 1: 50% - height reference */}
            <Grid size={{ xs: 12, md: 6 }}>
              <div ref={topRowRef}>
                <Stack spacing={1.5}>
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
                      version={chartVersion}          // 👈 re-animate on update
                      refreshing={chartRefreshing}     // 👈 tiny spinner in header
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
              </div>
            </Grid>

            {/* Column 2: 25% - constrained by topRowHeight */}
            <Grid size={{ xs: 12, md: 3 }}>
              <Box sx={{ height: topRowHeight ? `${topRowHeight}px` : 'auto' }}>
                <ActionSteps steps={coachingNotes.actionSteps} />
              </Box>
            </Grid>

            {/* Column 3: 25% - constrained by topRowHeight */}
            <Grid size={{ xs: 12, md: 3 }}>
              <Box sx={{ height: topRowHeight ? `${topRowHeight}px` : 'auto' }}>
                <CoachingNotesSection {...coachingNotes} />
              </Box>
            </Grid>
          </Grid>
        </Box>

        {/* ===== BOTTOM SECTION ===== */}
        <Box>
          <Grid container spacing={3}>
            {/* Attendance: 50% - height reference */}
            <Grid size={{ xs: 12, md: 6 }}>
              <div ref={bottomRowRef}>
                <AttendanceSection {...attendance} />
              </div>
            </Grid>

            {/* Wins: 25% - constrained by bottomRowHeight */}
            <Grid size={{ xs: 12, md: 3 }}>
              <Box sx={{ height: bottomRowHeight ? `${bottomRowHeight}px` : 'auto' }}>
                <Wins {...wins} />
              </Box>
            </Grid>

            {/* Achievements: 25% - constrained by bottomRowHeight */}
            <Grid size={{ xs: 12, md: 3 }}>
              <Box sx={{ height: bottomRowHeight ? `${bottomRowHeight}px` : 'auto' }}>
                <Achievements {...achievements} />
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </Box>
  );
}
