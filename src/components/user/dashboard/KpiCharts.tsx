// src/components/user/dashboard/KpiCharts.tsx
'use client';

import { Paper, Typography, Box, CircularProgress, Stack } from '@mui/material';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { KpiChartsProps, KpiChartPoint } from '@/types/dashboard';

function fmtMonth(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short' });
}

function TooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <Paper sx={{ p: 1.25, borderRadius: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {new Date(label).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
      </Typography>
      {payload.map((p: any) => (
        <Typography key={p.dataKey} variant="body2">
          {p.name}: {p.value}
        </Typography>
      ))}
    </Paper>
  );
}

type Props = KpiChartsProps & {
  /** bump this to re-animate lines when data changes */
  version?: number;
  /** show tiny spinner in header while refetching */
  refreshing?: boolean;
};

export default function KpiCharts({ series, periodLabel, version = 0, refreshing = false }: Props) {
  const hasData = Array.isArray(series) && series.length > 0;

  return (
    <Paper sx={{ p: 2, borderRadius: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
        <Typography variant="h4" fontWeight={600}>
          KPIs Yearly
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          {refreshing && <CircularProgress size={16} thickness={5} />}
          <Typography variant="body2" color="text.secondary">
            {periodLabel}
          </Typography>
        </Stack>
      </Box>

      <Box sx={{ height: 240, p: 1 }}>
        {!hasData ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No KPI history yet.
          </Typography>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {/* key={version} ensures only the chart remounts -> nice re-animate */}
            <LineChart data={series as KpiChartPoint[]} key={version} margin={{ top: 8, right: 20, left: -40, bottom: 6 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={fmtMonth} tickMargin={8} style={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} style={{ fontSize: 12 }} />
              <Tooltip content={<TooltipContent />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="total_closed" name="Total Closed" stroke="#1976d2" strokeWidth={2} dot={false} isAnimationActive animationDuration={500} />
              <Line type="monotone" dataKey="fifteen_thirty" name="15/30" stroke="#9c27b0" strokeWidth={2} dot={false} isAnimationActive animationDuration={500} />
              <Line type="monotone" dataKey="repeat_referral" name="Repeat/Referral" stroke="#2e7d32" strokeWidth={2} dot={false} isAnimationActive animationDuration={500} />
              <Line type="monotone" dataKey="days_off" name="Days Off" stroke="#ff9800" strokeWidth={2} dot={false} isAnimationActive animationDuration={500} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Paper>
  );
}
