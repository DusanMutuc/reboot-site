'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand, CARD_RADIUS, REPORT_HEADING_HEIGHT } from '@/lib/homeTheme';
import type { Metric } from './types';

/**
 * The member's headline figures for the year.
 *
 * Attendance used to share this card and no longer does: turning up and
 * producing are different questions, and stacking them meant neither got a
 * heading big enough to read. They are now two cards side by side.
 *
 * Four figures, and only four. This is a snapshot, not the tracker — the
 * tracker is one click away and holds everything.
 *
 * No movement indicators. Each figure used to carry a percentage against the
 * previous period, on the argument that a number alone cannot be judged. That
 * was overruled at review, and the counter-argument is a fair one: a delta is
 * a second number attached to every first one, and four of them turn a
 * snapshot into a report. The comparison still exists — it lives in the
 * tracker, where there is room to say what it is measured against, which this
 * card never had. `deltaPct` is untouched on the type; the hub and one-page
 * layouts still render it, as does the live member dashboard.
 *
 * Two by two, which is where this landed after trying the alternatives. Ruled
 * quadrants read as a spreadsheet — lines can only describe a space, not fill
 * it, so boxes drawn around emptiness make it easier to see. Enlarged figures
 * over-corrected: at 44px they beat the member's own priority, which puts a
 * snapshot above the plan it is a snapshot of. Stacked rows closed the gap but
 * were not what this card wanted to be.
 *
 * So: the original grid, the figures at the `metricValue` token untouched, and
 * the labels on `kicker` — the theme's own token for tagging an item inside a
 * section, which puts them in the same uppercase voice as every other label on
 * the surface. That is the only thing here that is not as it started.
 *
 * 30px is also the ceiling. The priority title above is 32 and the meeting
 * band is 34; anything larger here inverts the page's order.
 */
export default function StatsCard({
  metrics,
  year,
}: {
  metrics: Metric[];
  /** Named in the heading because the figures zero over on 1 January. */
  year: number;
}) {
  return (
    <Box
      component="section"
      id="numbers"
      sx={{
        bgcolor: brand.card,
        border: `1px solid ${brand.border}`,
        borderRadius: CARD_RADIUS,
        p: { xs: 2.5, md: 3 },
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Height shared with the attendance card alongside — see
          REPORT_HEADING_HEIGHT. */}
      <Box sx={{ minHeight: { md: REPORT_HEADING_HEIGHT }, mb: 2.5 }}>
        <Typography
          variant="sectionLabel"
          component="h2"
          sx={{ fontSize: { xs: 19, md: 21 }, color: brand.ink }}
        >
          Your {year} stats
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: { xs: '20px 18px', md: '24px 22px' },
          mb: 2.5,
        }}
      >
        {metrics.slice(0, 4).map((metric) => (
          <Box key={metric.label} sx={{ minWidth: 0 }}>
            <Typography variant="kicker" component="p" sx={{ color: brand.inkMuted, mb: 0.75 }}>
              {metric.label}
            </Typography>
            <Typography variant="metricValue" sx={{ color: brand.ink }}>
              {metric.value}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box
        component={Link}
        href="/tracker"
        sx={{
          mt: 'auto',
          alignSelf: 'flex-start',
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
        See all your stats
        <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
      </Box>
    </Box>
  );
}
