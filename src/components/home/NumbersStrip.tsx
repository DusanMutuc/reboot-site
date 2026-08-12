'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import { brand } from '@/lib/homeTheme';
import type { Metric } from './types';

function Delta({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) {
    return (
      <Typography sx={{ fontSize: 12.5, color: brand.inkMuted }}>No previous period</Typography>
    );
  }

  const positive = deltaPct >= 0;
  const Icon = positive ? ArrowUpwardRoundedIcon : ArrowDownwardRoundedIcon;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.375 }}>
      <Icon aria-hidden="true" sx={{ fontSize: 14, color: positive ? brand.positive : brand.negative }} />
      <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: positive ? brand.positive : brand.negative }}>
        {Math.abs(Math.round(deltaPct))}%
      </Typography>
      <Typography sx={{ fontSize: 12.5, color: brand.inkMuted }}>vs last period</Typography>
    </Box>
  );
}

export default function NumbersStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <Box
      component="section"
      sx={{ animation: 'homeRise .38s ease-out both', animationDelay: '180ms' }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 2,
          mb: 1.75,
        }}
      >
        <Typography variant="sectionLabel" component="h2" sx={{ color: brand.ink }}>
          Your numbers
        </Typography>

        <Box
          component={Link}
          href="/tracker"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.625,
            fontFamily: '"Poppins", Arial, sans-serif',
            fontSize: 14,
            fontWeight: 500,
            color: brand.turquoiseDeep,
            '&:hover': { color: brand.ink },
            '&:hover .numbers-arrow': { transform: 'translateX(3px)' },
          }}
        >
          View and update
          <ArrowForwardRoundedIcon
            className="numbers-arrow"
            aria-hidden="true"
            sx={{ fontSize: 17, transition: 'transform .16s ease' }}
          />
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            md: `repeat(${Math.min(metrics.length, 4)}, minmax(0, 1fr))`,
          },
          gap: 1.5,
        }}
      >
        {metrics.map((metric) => (
          <Box
            key={metric.label}
            sx={{
              bgcolor: brand.card,
              border: `1px solid ${brand.border}`,
              borderRadius: '14px',
              p: { xs: 2, md: 2.25 },
            }}
          >
            <Typography variant="metricLabel" sx={{ display: 'block', color: brand.inkSoft, mb: 0.75 }}>
              {metric.label}
            </Typography>
            <Typography variant="metricValue" sx={{ color: brand.ink, mb: 0.875 }}>
              {metric.value}
            </Typography>
            <Delta deltaPct={metric.deltaPct} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
