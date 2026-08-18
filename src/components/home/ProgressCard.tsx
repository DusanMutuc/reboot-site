'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import LocalFireDepartmentRoundedIcon from '@mui/icons-material/LocalFireDepartmentRounded';
import { brand, CARD_RADIUS } from '@/lib/homeTheme';
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
  return (
    <Box
      sx={{
        bgcolor: brand.card,
        border: `1px solid ${brand.border}`,
        borderRadius: CARD_RADIUS,
        p: { xs: 2.5, md: 3 },
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography
        variant="eyebrow"
        component="div"
        sx={{
          display: 'block',
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
            <Typography variant="metricValue" sx={{ color: brand.ink }}>
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
            {attendance.attendedCount} of {attendance.totalCount} calls
          </Typography>
          {attendance.streakLabel ? (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              <LocalFireDepartmentRoundedIcon
                aria-hidden="true"
                sx={{ fontSize: 15, color: brand.turquoiseDeep }}
              />
              <Typography sx={{ fontSize: 13, color: brand.turquoiseDeep }}>
                {attendance.streakLabel}
              </Typography>
            </Box>
          ) : null}
        </Box>

        {attendance.recent.length > 0 ? (
          <Box sx={{ mb: 1.75 }}>
            <Box
              role="img"
              aria-label={`${attendance.attendedCount} of the last ${attendance.recent.length} meetings attended`}
              sx={{ display: 'flex', gap: 0.75 }}
            >
              {attendance.recent.map((attended, index) => (
                <Box
                  key={index}
                  sx={{
                    flex: 1,
                    height: 26,
                    borderRadius: '6px',
                    bgcolor: attended ? brand.turquoise : brand.card,
                    border: attended ? 'none' : `1.5px solid ${brand.borderMuted}`,
                  }}
                />
              ))}
            </Box>

            {/* The row has a direction; without these it is just eight shapes. */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 1,
                mt: 0.75,
              }}
            >
              <Typography sx={{ fontSize: 12, color: brand.inkMuted }}>
                {attendance.recent.length} meetings ago
              </Typography>
              <Typography sx={{ fontSize: 12, color: brand.inkMuted }}>Most recent</Typography>
            </Box>
          </Box>
        ) : (
          <Box sx={{ height: 5, bgcolor: '#e7ebea', borderRadius: 3, mb: 1.75 }} />
        )}

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
            fontSize: 15,
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
