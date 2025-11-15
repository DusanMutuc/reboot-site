// src/components/user/dashboard/UserDashboard.tsx
'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Paper } from '@mui/material';
import Grid from '@mui/material/Grid';
import { supabase } from '@/lib/supabaseClient';
import { fetchDashboardData } from '@/lib/dashboard';
import type {
  UserDashboardData,
  RevenueProfitSectionProps,
  KpiSectionProps,
  KpiKey,
  KpiMetric,
} from '@/types/dashboard';

import RevenueProfitSection from './RevenueProfitSection';
import AttendanceSection from './AttendanceSection';
import CoachingNotesSection from './CoachingNotesSection';
import Wins from './Wins';
import Achievements from './Achievements';

interface UserDashboardProps {
  userId: string;
}

// ---------- Helpers for KPI row ----------

function formatCurrencyShort(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function formatInt(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDeltaPct(delta: number | null): { text: string; color: string } {
  if (delta == null || Number.isNaN(delta)) {
    return { text: '— vs last month', color: 'text.secondary' };
  }
  const rounded = Math.round(delta);
  const sign = rounded > 0 ? '+' : '';
  const color = rounded >= 0 ? 'success.main' : 'error.main';
  return { text: `${sign}${rounded}% vs last month`, color };
}

interface KpiOverviewCardProps {
  label: string;
  value: string;
  deltaPct: number | null;
}

function KpiOverviewCard({ label, value, deltaPct }: KpiOverviewCardProps) {
  const { text, color } = formatDeltaPct(deltaPct);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 0.5,
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={700}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color }}>
        {text}
      </Typography>
    </Paper>
  );
}

function KpiOverviewRow({
  revenueProfit,
  kpi,
}: {
  revenueProfit: RevenueProfitSectionProps;
  kpi: KpiSectionProps;
}) {
  const kpiByKey = kpi.kpis.reduce(
    (acc, metric) => {
      acc[metric.key] = metric;
      return acc;
    },
    {} as Record<KpiKey, KpiMetric>,
  );

  const totalClosed = kpiByKey['total_closed'];
  const repeatReferral = kpiByKey['repeat_referral'];
  const daysOff = kpiByKey['days_off'];
  const fifteenThirty = kpiByKey['fifteen_thirty'];

  return (
    <Paper sx={{ p: 2, borderRadius: 3 }}>
      <Grid
        container
        spacing={2}
        alignItems="baseline"
        sx={{ mb: 1.5 }}
      >
        <Grid size="grow">
          <Typography variant="h6" fontWeight={600}>
            Overview
          </Typography>
        </Grid>
        <Grid size="auto">
          <Typography variant="body2" color="text.secondary">
            {kpi.periodLabel}
          </Typography>
        </Grid>
      </Grid>

      <Grid container spacing={1.5}>
        {/* Gross Revenue */}
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <KpiOverviewCard
            label="Gross Revenue"
            value={formatCurrencyShort(revenueProfit.currentRevenue)}
            deltaPct={revenueProfit.revenueDeltaPct}
          />
        </Grid>

        {/* Profit */}
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <KpiOverviewCard
            label="Profit"
            value={formatCurrencyShort(revenueProfit.currentProfit)}
            deltaPct={revenueProfit.profitDeltaPct}
          />
        </Grid>

        {/* Total Closed */}
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <KpiOverviewCard
            label="Total Closed"
            value={formatInt(totalClosed?.value ?? 0)}
            deltaPct={totalClosed?.deltaPct ?? null}
          />
        </Grid>

        {/* Repeat / Referral */}
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <KpiOverviewCard
            label="Repeat / Referral"
            value={formatInt(repeatReferral?.value ?? 0)}
            deltaPct={repeatReferral?.deltaPct ?? null}
          />
        </Grid>

        {/* Days Off */}
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <KpiOverviewCard
            label="Days Off"
            value={formatInt(daysOff?.value ?? 0)}
            deltaPct={daysOff?.deltaPct ?? null}
          />
        </Grid>

        {/* 15/30 */}
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <KpiOverviewCard
            label="15/30"
            value={formatInt(fifteenThirty?.value ?? 0)}
            deltaPct={fifteenThirty?.deltaPct ?? null}
          />
        </Grid>
      </Grid>
    </Paper>
  );
}

// ---------- Main component ----------

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
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1500, mx: 'auto' }}>
      <Grid container spacing={3}>
        {/* ROW 1: KPI overview (thin bar) */}
        <Grid size={12}>
          <KpiOverviewRow revenueProfit={revenueProfit} kpi={kpi} />
        </Grid>

        {/* ROW 2: Revenue chart + Attendance chart side-by-side */}
        <Grid size={{ xs: 12, md: 7 }}>
          <RevenueProfitSection {...revenueProfit} />
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <AttendanceSection {...attendance} />
        </Grid>

        {/* ROW 3: List-style content in one unified row */}
        <Grid size={12}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <CoachingNotesSection {...coachingNotes} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Wins {...wins} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Achievements {...achievements} />
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
}
