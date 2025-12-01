// src/components/user/dashboard/UserDashboardExpanded.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Box, CircularProgress, Stack } from '@mui/material';
import Grid from '@mui/material/Grid';
import { supabase } from '@/lib/supabaseClient';
import { fetchDashboardData } from '@/lib/dashboard';
import type { UserDashboardData, CoachingNotesSectionProps } from '@/types/dashboard';

import KpiCharts from './KpiCharts';
import BigMoneyCards from './BigMoneyCards';
import KpiMiniCards from './KpiMiniCards';
import ActionSteps from './ActionSteps';
import Wins from './Wins';
import Achievements from './Achievements';
import AttendanceSection from './AttendanceSection';
import CoachingNotesPicker from './CoachingNotesPicker';
import CoachingNotesSection from './CoachingNotesSection';

type Props = { userId: string; refreshSignal?: number | string };

export default function UserDashboardExpanded({ userId }: Props) {
  const [data, setData] = useState<UserDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedNote, setSelectedNote] = useState<CoachingNotesSectionProps>({ actionSteps: [], notes: [] });
  const handleSectionChange = useCallback((section: CoachingNotesSectionProps) => {
    setSelectedNote(section);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await fetchDashboardData(supabase, userId);
      if (!cancelled) { setData(result); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
  if (!data) return null;

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
                  <KpiCharts series={kpiChart.series} periodLabel={kpiChart.periodLabel} />
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
