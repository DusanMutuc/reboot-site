'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import LocalFireDepartmentRoundedIcon from '@mui/icons-material/LocalFireDepartmentRounded';
import { brand } from '@/lib/homeTheme';
import type { Attendance, Metric } from './types';

/**
 * The other half of the progress tier, paired with ContinueCard.
 *
 * Deliberately holds only things that report on the member: their figures,
 * their attendance, their real streak. Content lives further down the page.
 */
export default function ProgressCard({
  metrics,
  attendance,
  wide = false,
}: {
  metrics: Metric[];
  attendance: Attendance;
  /** Spans the full row when the course card is absent — lay the figures out flat. */
  wide?: boolean;
}) {
  const pct = attendance.totalCount > 0
    ? Math.round((attendance.attendedCount / attendance.totalCount) * 100)
    : 0;

  return (
    <Box
      sx={{
        bgcolor: brand.card,
        border: `1px solid ${brand.border}`,
        borderRadius: '14px',
        p: { xs: 2.5, md: 3 },
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography
        variant="sectionLabel"
        component="div"
        sx={{
          display: 'block',
          fontSize: 11.5,
          letterSpacing: '0.12em',
          color: brand.inkMuted,
          mb: 2,
        }}
      >
        Your stats
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            md: wide ? 'repeat(4, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))',
          },
          gap: { xs: 1.75, md: 2 },
          mb: 2.5,
        }}
      >
        {metrics.slice(0, 4).map((metric) => (
          <Box key={metric.label}>
            <Typography sx={{ fontSize: 12, color: brand.inkMuted, mb: 0.25 }}>
              {metric.label}
            </Typography>
            <Typography variant="metricValue" sx={{ fontSize: 22, color: brand.ink }}>
              {metric.value}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ mt: 'auto', pt: 2, borderTop: `1px solid ${brand.border}` }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            mb: 1,
          }}
        >
          <Typography sx={{ fontSize: 13, color: brand.inkSoft }}>
            {attendance.attendedCount} of {attendance.totalCount} calls · {attendance.periodLabel}
          </Typography>
          {attendance.streakLabel ? (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              <LocalFireDepartmentRoundedIcon
                aria-hidden="true"
                sx={{ fontSize: 15, color: brand.turquoiseDeep }}
              />
              <Typography sx={{ fontSize: 12.5, color: brand.turquoiseDeep }}>
                {attendance.streakLabel}
              </Typography>
            </Box>
          ) : null}
        </Box>

        <Box sx={{ height: 5, bgcolor: '#e7ebea', borderRadius: 3, overflow: 'hidden', mb: 1.75 }}>
          <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: brand.turquoise }} />
        </Box>

        {/* A bordered control, not a text link: this is the only route to the
            tracker on the page, and the figures above give no sign they are
            something the member maintains. */}
        <Box
          component={Link}
          href="/tracker"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            px: 2,
            py: 1,
            borderRadius: '10px',
            border: `1px solid ${brand.borderStrong}`,
            fontSize: 14.5,
            fontWeight: 500,
            color: brand.ink,
            transition: 'border-color .16s ease, background-color .16s ease',
            '&:hover': { borderColor: brand.turquoise, bgcolor: brand.turquoiseTint },
          }}
        >
          Open your tracker
          <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
        </Box>
      </Box>
    </Box>
  );
}
