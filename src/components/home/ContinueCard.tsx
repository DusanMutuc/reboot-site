'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand } from '@/lib/homeTheme';
import type { ContinueItem } from './types';

/**
 * Course progress, one tier below the hero.
 *
 * Action steps outrank this — a step is a commitment to a coach, a course is a
 * resource. But course progress is the most naturally motivating thing on the
 * page (decomposed, partial, finite), so it keeps the hero's visual language
 * rather than being demoted into a list item.
 */
export default function ContinueCard({ item }: { item: ContinueItem }) {
  return (
    <Box
      component={Link}
      href={item.href}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        bgcolor: brand.card,
        border: `1px solid ${brand.border}`,
        borderRadius: '14px',
        p: { xs: 2.5, md: 3 },
        transition: 'border-color .16s ease',
        '&:hover': { borderColor: brand.turquoise },
        '&:hover .cc-cta': { color: brand.ink },
      }}
    >
      <Typography
        variant="sectionLabel"
        component="div"
        sx={{
          display: 'block',
          fontSize: 11.5,
          letterSpacing: '0.12em',
          color: brand.turquoiseDeep,
          mb: 1.25,
        }}
      >
        Pick up where you left off
      </Typography>

      <Typography variant="cardTitle" sx={{ fontSize: 19, color: brand.ink, mb: 0.75 }}>
        {item.title}
      </Typography>

      <Typography sx={{ fontSize: 14, color: brand.inkSoft, mb: 2 }}>
        {item.contextLabel}
      </Typography>

      <Box sx={{ height: 6, bgcolor: '#e7ebea', borderRadius: 4, overflow: 'hidden', mb: 2 }}>
        <Box sx={{ width: `${item.progressPct}%`, height: '100%', bgcolor: brand.turquoise }} />
      </Box>

      {item.nextUpLabel ? (
        <Box sx={{ mt: 'auto', pt: 1.5, mb: 2, borderTop: `1px solid ${brand.border}` }}>
          <Typography sx={{ fontSize: 12, color: brand.inkMuted, mb: 0.25 }}>Up next</Typography>
          <Typography sx={{ fontSize: 14.5, color: brand.ink }}>{item.nextUpLabel}</Typography>
        </Box>
      ) : null}

      <Box
        className="cc-cta"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.625,
          fontSize: 14.5,
          fontWeight: 500,
          color: brand.turquoiseDeep,
          transition: 'color .16s ease',
        }}
      >
        Continue
        <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
      </Box>
    </Box>
  );
}
