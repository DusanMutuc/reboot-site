// src/components/user/dashboard/UserDashboardExpanded.tsx
'use client';

import { useCallback, useState } from 'react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import type { CoachingNotesSectionProps } from '@/types/dashboard';

import KpiCharts from './KpiCharts';
import BigMoneyCards from './BigMoneyCards';
import KpiMiniCards from './KpiMiniCards';
import ActionSteps from './ActionSteps';
import Wins from './Wins';
import Achievements from './Achievements';
import AttendanceSection from './AttendanceSection';
import CoachingNotesPicker from './CoachingNotesPicker';
import CoachingNotesSection from './CoachingNotesSection';
import useDashboardData from './useDashboardData';

type Props = { userId: string; refreshSignal?: number | string };

export default function UserDashboardExpanded({ userId, refreshSignal }: Props) {
  const [selectedNote, setSelectedNote] = useState<CoachingNotesSectionProps>({
    actionSteps: [],
    notes: [],
  });
  const { data, loading, error, refreshing, chartVersion } = useDashboardData({
    userId,
    refreshSignal,
    refreshMode: 'full',
  });

  const handleSectionChange = useCallback((section: CoachingNotesSectionProps) => {
    setSelectedNote(section);
  }, []);

  if (loading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
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

  const { revenueProfit, kpi, kpiChart, attendance, wins, achievements } = data;

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1400, mx: 'auto' }}>
      <Stack spacing={3}>
        

        {/* MAIN CONTENT */}
        <Box>
          <Stack spacing={3}>
            {/* Row 1: KPI+cards | Action Steps */}
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Stack spacing={1.5}>
                  <BigMoneyCards
                    currentRevenue={revenueProfit.currentRevenue}
                    currentProfit={revenueProfit.currentProfit}
                    revenueDeltaPct={revenueProfit.revenueDeltaPct}
                    profitDeltaPct={revenueProfit.profitDeltaPct}
                    periodLabel={revenueProfit.periodLabel}
                  />
                  <KpiCharts
                    series={kpiChart.series}
                    periodLabel={kpiChart.periodLabel}
                    version={chartVersion}
                    refreshing={refreshing}
                  />
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
              <Grid size={{ xs: 12, md: 6 }}>
                <ActionSteps steps={selectedNote.actionSteps} />
              </Grid>
            </Grid>

            {/* Row 2: Attendance | Notes */}
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <AttendanceSection {...attendance} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <CoachingNotesSection {...selectedNote} />
              </Grid>
            </Grid>

            {/* Row 3: Wins | Achievements */}
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Wins {...wins} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Achievements {...achievements} />
              </Grid>
            </Grid>


            {/* COACHING NOTES PICKER ROW */}
            <Grid container spacing={3} justifyContent="flex-end">
              <Grid size={{ xs: 12, md: 6 }}>
                <CoachingNotesPicker
                  userId={userId}
                  title="Select Coaching Session"
                  onSectionChange={handleSectionChange}
                  showPreview={false}
                />
              </Grid>
            </Grid>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
