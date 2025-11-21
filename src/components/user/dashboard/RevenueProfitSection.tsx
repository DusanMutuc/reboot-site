// src/components/user/dashboard/RevenueProfitSection.tsx

import Grid from '@mui/material/Grid';
import { Box, Paper, Typography, Divider } from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type {
  RevenueProfitSectionProps,
  RevenueProfitPoint,
} from '@/types/dashboard';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDelta(delta: number | null): string {
  if (delta === null || Number.isNaN(delta)) return '—';
  const rounded = Math.round(delta);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

// Format '2025-11-01' -> 'Nov 2025'
function formatDateLabel(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

// add this just above TooltipProps (or reuse if you already have it elsewhere)
type RPRechartsPayload = {
  dataKey?: string;
  value?: number | string;
};

// update this
type TooltipProps = {
  active?: boolean;
  payload?: RPRechartsPayload[];
  label?: string | number;
};

function RevenueProfitTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const revenuePoint = payload.find((p) => p.dataKey === 'revenue');
  const profitPoint = payload.find((p) => p.dataKey === 'profit');

  return (
    <Paper elevation={3} sx={{ p: 1.5, borderRadius: 2, fontSize: 12 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {formatDateLabel(String(label ?? ''))}
      </Typography>
      {revenuePoint && (
        <Typography variant="body2">
          Revenue: {formatCurrency(Number(revenuePoint.value))}
        </Typography>
      )}
      {profitPoint && (
        <Typography variant="body2">
          Profit: {formatCurrency(Number(profitPoint.value))}
        </Typography>
      )}
    </Paper>
  );
}


export default function RevenueProfitSection(props: RevenueProfitSectionProps) {
  const {
    currentRevenue,
    currentProfit,
    revenueDeltaPct,
    profitDeltaPct,
    periodLabel,
    history,
  } = props;

  const hasHistory = history && history.length > 0;

  return (
    <Paper sx={{ p: 3, borderRadius: 3, height: '100%' }}>
      {/* Header row */}
      <Grid
        container
        spacing={2}
        alignItems="baseline"
        sx={{ mb: 2 }}
      >
        <Grid size="grow">
          <Typography variant="h6" fontWeight={600}>
            Revenue &amp; Profit
          </Typography>
        </Grid>
        <Grid size="auto">
          <Typography variant="body2" color="text.secondary">
            {periodLabel}
          </Typography>
        </Grid>
      </Grid>

      {/* Top: 2 metric cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper
            variant="outlined"
            sx={{ p: 2.5, borderRadius: 3, height: '100%' }}
          >
            <Typography variant="subtitle2" color="text.secondary">
              Gross Revenue
            </Typography>
            <Typography variant="h4" fontWeight={700} mt={0.5}>
              {formatCurrency(currentRevenue)}
            </Typography>
            <Typography
              variant="body2"
              mt={1}
              color={
                revenueDeltaPct == null
                  ? 'text.secondary'
                  : revenueDeltaPct >= 0
                  ? 'success.main'
                  : 'error.main'
              }
            >
              {formatDelta(revenueDeltaPct)} vs previous period
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper
            variant="outlined"
            sx={{ p: 2.5, borderRadius: 3, height: '100%' }}
          >
            <Typography variant="subtitle2" color="text.secondary">
              Profit
            </Typography>
            <Typography variant="h4" fontWeight={700} mt={0.5}>
              {formatCurrency(currentProfit)}
            </Typography>
            <Typography
              variant="body2"
              mt={1}
              color={
                profitDeltaPct == null
                  ? 'text.secondary'
                  : profitDeltaPct >= 0
                  ? 'success.main'
                  : 'error.main'
              }
            >
              {formatDelta(profitDeltaPct)} vs previous period
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Divider sx={{ mb: 3 }} />

      {/* Bottom: trend chart */}
      <Box>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Trend over time
        </Typography>

        <Box
          sx={{
            mt: 1,
            height: 260,
            borderRadius: 2,
            border: hasHistory ? '1px solid' : '1px dashed',
            borderColor: 'divider',
            bgcolor: 'background.default',
            p: hasHistory ? 1 : 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: hasHistory ? 'stretch' : 'center',
          }}
        >
          {!hasHistory ? (
            <Typography variant="body2" color="text.secondary">
              No revenue / profit history yet.
            </Typography>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={history as RevenueProfitPoint[]}
                margin={{ top: 16, right: 24, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickMargin={8}
                  tickFormatter={formatDateLabel}
                  style={{ fontSize: 12 }}
                />
                <YAxis
                  tickFormatter={(v: number) =>
                    new Intl.NumberFormat('en-US', {
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(v)
                  }
                  width={70}
                  style={{ fontSize: 12 }}
                />
                <Tooltip content={<RevenueProfitTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#1976d2"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  name="Profit"
                  stroke="#2e7d32"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Box>
      </Box>
    </Paper>
  );
}
