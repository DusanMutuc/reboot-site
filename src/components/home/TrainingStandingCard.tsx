'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand, CARD_RADIUS } from '@/lib/homeTheme';
import type { TrainingStanding } from './types';

/**
 * Holds the training slot when no course is assigned.
 *
 * It reports rather than recommends. Putting a suggested course here would
 * make the same offer as the browse grid below, which is the duplication that
 * stopped the zone break from meaning anything.
 *
 * Deliberately the opposite shape to the assigned card: no artwork, no chapter
 * bar, one quiet centred block. The absence of a course should look like an
 * absence, not like a course card with the picture missing.
 */
export default function TrainingStandingCard({ standing }: { standing: TrainingStanding }) {
  const { lastCompleted, completedCount } = standing;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        bgcolor: brand.card,
        border: `1px solid ${brand.border}`,
        borderRadius: CARD_RADIUS,
        p: { xs: 2.5, md: 3 },
        transition: 'border-color .16s ease',
        '&:hover, &:focus-within': { borderColor: brand.turquoise },
      }}
    >
      {/* Muted, not turquoise: on this page the turquoise eyebrow is reserved
          for something being asked of the member. */}
      <Typography
        variant="eyebrow"
        component="div"
        sx={{ display: 'block', color: brand.inkMuted, mb: 1.5 }}
      >
        Your training
      </Typography>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

      <Typography variant="cardTitle" sx={{ fontSize: 19, color: brand.ink, mb: 1 }}>
        Nothing assigned right now
      </Typography>

      <Typography sx={{ fontSize: 14, color: brand.inkSoft, maxWidth: 380 }}>
        Your coach assigns a course before a session. Until then the library is
        open to you.
      </Typography>

      {completedCount > 0 ? (
        <Typography sx={{ fontSize: 14, color: brand.inkMuted, mt: 2 }}>
          {completedCount} {completedCount === 1 ? 'course' : 'courses'} finished
          {lastCompleted ? ` · last was ${lastCompleted.title} ${lastCompleted.completedLabel}` : ''}
        </Typography>
      ) : null}

      </Box>

      {/* Bordered control, matching the assigned-course card and the numbers
          card beside it — every card in this row offers exactly one route. */}
      <Box
        component={Link}
        href={standing.browseHref}
        sx={{
          display: 'inline-flex',
          alignSelf: 'flex-start',
          alignItems: 'center',
          gap: 0.75,
          mt: 3,
          px: 2,
          py: 1,
          borderRadius: '10px',
          border: `1px solid ${brand.borderStrong}`,
          fontSize: 15,
          fontWeight: 500,
          color: brand.ink,
          textDecoration: 'none',
          transition: 'border-color .16s ease, background-color .16s ease',
          '&:hover': { borderColor: brand.turquoise, bgcolor: brand.turquoiseTint },
        }}
      >
        Browse the library
        <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
      </Box>
    </Box>
  );
}
