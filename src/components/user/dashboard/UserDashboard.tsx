'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import Grid from '@mui/material/Grid';
import { supabase } from '@/lib/supabaseClient';
import { fetchDashboardData } from '@/lib/dashboard';
import type { UserDashboardData } from '@/types/dashboard';

import RevenueProfitSection from './RevenueProfitSection';
import KpiSection from './KpiSection';
import AttendanceSection from './AttendanceSection';
import CoachingNotesSection from './CoachingNotesSection';
import Wins from './Wins';
import Achievements from './Achievements';

interface UserDashboardProps {
  userId: string;
}

export default function UserDashboard({ userId }: UserDashboardProps) {
  const [data, setData] = useState<UserDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
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
    }

    load();
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
      <Grid container spacing={3}>
        {/* Row 1: Revenue */}
        <Grid size={12}>
          <RevenueProfitSection {...revenueProfit} />
        </Grid>

        {/* Row 2: KPIs */}
        <Grid size={12}>
          <KpiSection {...kpi} />
        </Grid>

        {/* Row 3: Attendance + Coaching Notes */}
        <Grid size={{ xs: 12, md: 7 }}>
          <AttendanceSection {...attendance} />
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <CoachingNotesSection {...coachingNotes} />
        </Grid>

        {/* Row 4: Wins + Achievements */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Wins {...wins} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Achievements {...achievements} />
        </Grid>
      </Grid>
    </Box>
  );
}
