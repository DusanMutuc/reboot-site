'use client';

import Grid from '@mui/material/Grid';
import { Box, Paper, Typography } from '@mui/material';
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
import type { RevenueProfitSectionProps, RevenueProfitPoint } from '@/types/dashboard';

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

type RPRechartsPayload = {
  dataKey?: string;
  value?: number | string;
};

type RPTooltipProps = {
  active?: boolean;
  payload?: RPRechartsPayload[];
  label?: string | number;
};

function RPTooltip({ active, payload, label }: RPTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const rev = payload.find((p) => p.dataKey === 'revenue');
  const prof = payload.find((p) => p.dataKey === 'profit');

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n || 0);

  return (
    <Paper elevation={3} sx={{ p: 1.25, borderRadius: 1.5, fontSize: 12 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {formatDateLabel(String(label ?? ''))}
      </Typography>
      {typeof rev?.value === 'number' && (
        <Typography variant="body2">Revenue: {fmt(rev.value)}</Typography>
      )}
      {typeof prof?.value === 'number' && (
        <Typography variant="body2">Profit: {fmt(prof.value)}</Typography>
      )}
    </Paper>
  );
}

type Props = {
  history: RevenueProfitSectionProps['history'];
  periodLabel: string;
};

export default function RevenueProfitChart({ history, periodLabel }: Props) {
  const hasHistory = history && history.length > 0;

  return (
    <Paper sx={{ p: 2, borderRadius: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Grid container spacing={1} alignItems="center" sx={{ mb: 1 }}>
  <Grid size="grow">
    <Typography variant="h6" fontWeight={600}>
      Revenue &amp; Profit
    </Typography>
  </Grid>
  <Grid>
    <Typography variant="body2" color="text.secondary">
      {periodLabel}
    </Typography>
  </Grid>
</Grid>


      <Box sx={{ flex: 1, minHeight: 300 }}>
        {!hasHistory ? (
          <Box
            sx={{
              height: '100%',
              border: '1px dashed',
              borderColor: 'divider',
              borderRadius: 2,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No revenue / profit history yet.
            </Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={history as RevenueProfitPoint[]}
              margin={{ top: 16, right: 24, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickMargin={8} tickFormatter={formatDateLabel} style={{ fontSize: 12 }} />
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
              <Tooltip content={<RPTooltip />} />
              <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#1976d2" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="profit" name="Profit" stroke="#2e7d32" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Paper>
  );
}
