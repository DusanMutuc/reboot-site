// src/components/dashboard/AttendanceSection.tsx
'use client';

import { Paper, Box, Typography, Chip } from '@mui/material';
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
import type { AttendanceSectionProps } from '@/types/dashboard';

export function AttendanceSection({ series, periodLabel }: AttendanceSectionProps) {
  if (!series || series.length === 0) {
    return null;
  }

  const lastPoint = series[series.length - 1];
  const hasDrift = lastPoint.driftCumulative > 0;

  const onTrackPct = hasDrift
    ? Math.round((lastPoint.actualCumulative / lastPoint.driftCumulative) * 100)
    : null;

  const onTrackLabel = onTrackPct !== null ? `${onTrackPct}% of target` : 'No target yet';

  return (
    <Paper
      elevation={3}
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h6">Attendance vs Driftline</Typography>
          <Typography variant="body2" color="text.secondary">
            {periodLabel}
          </Typography>
        </Box>

        <Chip
          size="small"
          label={onTrackLabel}
          variant="outlined"
        />
      </Box>

      <Box sx={{ flex: 1, minHeight: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series}
            margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip
              formatter={(value: any, name: string) => {
                if (name === 'actualCumulative') return [value, 'Actual'];
                if (name === 'driftCumulative') return [value, 'Driftline'];
                return [value, name];
              }}
              labelFormatter={(label: string) => `Week ${label}`}
            />
            <Legend
              formatter={(value: string) => {
                if (value === 'actualCumulative') return 'Actual';
                if (value === 'driftCumulative') return 'Driftline';
                return value;
              }}
            />
            <Line
              type="monotone"
              dataKey="actualCumulative"
              dot={false}
              strokeWidth={2}
              name="Actual"
            />
            <Line
              type="monotone"
              dataKey="driftCumulative"
              strokeDasharray="4 4"
              dot={false}
              strokeWidth={2}
              name="Driftline"
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

export default AttendanceSection;
