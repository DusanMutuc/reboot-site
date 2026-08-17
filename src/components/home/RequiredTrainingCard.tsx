'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand } from '@/lib/homeTheme';
import type { RequiredTraining } from './types';

/**
 * The training assigned for this period.
 *
 * Deliberately not called a course, and deliberately not a course interface —
 * one item with a clear next move. The context line names the session it
 * relates to without adding pressure language on top.
 */
export default function RequiredTrainingCard({ training }: { training: RequiredTraining }) {
  return (
    <Box
      component={Link}
      href={training.href}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        bgcolor: brand.card,
        border: `1px solid ${brand.turquoise}`,
        borderRadius: '14px',
        p: { xs: 2.5, md: 3 },
        transition: 'border-color .16s ease',
        '&:hover': { borderColor: brand.turquoiseDark },
        '&:hover .rt-cta': { color: brand.ink },
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
        Watch before your session
      </Typography>

      <Typography variant="cardTitle" sx={{ fontSize: 19, color: brand.ink, mb: 0.75 }}>
        {training.title}
      </Typography>

      <Typography sx={{ fontSize: 14, color: brand.inkSoft, mb: 2 }}>{training.detail}</Typography>

      {training.progressPct !== null ? (
        <Box sx={{ height: 6, bgcolor: '#e7ebea', borderRadius: 4, overflow: 'hidden', mb: 2 }}>
          <Box sx={{ width: `${training.progressPct}%`, height: '100%', bgcolor: brand.turquoise }} />
        </Box>
      ) : null}

      {training.contextLabel ? (
        <Box sx={{ mt: 'auto', pt: 1.5, mb: 2, borderTop: `1px solid ${brand.border}` }}>
          <Typography sx={{ fontSize: 13.5, color: brand.inkSoft }}>
            {training.contextLabel}
          </Typography>
        </Box>
      ) : null}

      <Box
        className="rt-cta"
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
        {training.progressPct ? 'Keep watching' : 'Start watching'}
        <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
      </Box>
    </Box>
  );
}
