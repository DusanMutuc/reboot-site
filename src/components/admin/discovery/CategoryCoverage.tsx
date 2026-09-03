'use client';

import { Box, Paper, Stack, Typography } from '@mui/material';
import { DISCOVERY_CATEGORY_LABELS } from '@/lib/discoveryAdminTypes';

export const DISCOVERY_CATEGORIES = ['marketing', 'systems', 'hiring', 'mindset'] as const;

/**
 * Four categories and a count each — the same fact on two screens, so one component renders it.
 *
 * The colour rule matters more than the shape. A category is only flagged when it is empty *and*
 * others are not: that is a real gap. When everything is zero nothing is flagged, because a
 * starting position is not four warnings — and painting it as one trains people to ignore the
 * colour by the time it means something.
 *
 * `dense` is a size, not a different language: chips rather than boxes where this is context above
 * a table rather than the headline signal of the screen.
 */
export default function CategoryCoverage({ counts, caption, dense = false }: {
  counts: Record<string, number>;
  caption?: React.ReactNode;
  dense?: boolean;
}) {
  const total = DISCOVERY_CATEGORIES.reduce((sum, code) => sum + (counts[code] ?? 0), 0);
  const label = (code: string) => DISCOVERY_CATEGORY_LABELS[code] ?? code;
  // Only a gap once something else has landed. Everything at zero is "not started", not a problem.
  const isGap = (value: number) => value === 0 && total > 0;

  if (dense) {
    return (
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" useFlexGap>
        {caption && (
          <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>{caption}</Typography>
        )}
        {DISCOVERY_CATEGORIES.map((code) => {
          const value = counts[code] ?? 0;
          const gap = isGap(value);
          return (
            <Box
              key={code}
              sx={{
                display: 'inline-flex', alignItems: 'baseline', gap: 1,
                px: 1.75, py: 0.9, borderRadius: 1.5, border: '1px solid',
                borderColor: gap ? 'warning.main' : 'divider',
                bgcolor: gap ? 'warning.light' : 'action.hover',
              }}
            >
              <Typography variant="body2" sx={{ color: gap ? 'warning.dark' : 'text.secondary' }}>
                {label(code)}
              </Typography>
              <Typography sx={{
                fontSize: 16, fontFamily: 'monospace', fontWeight: 700, lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                color: gap ? 'warning.dark' : 'text.primary',
              }}>
                {value}
              </Typography>
            </Box>
          );
        })}
      </Stack>
    );
  }

  return (
    <Box>
      {caption && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, maxWidth: '74ch', lineHeight: 1.6 }}>
          {caption}
        </Typography>
      )}
      <Stack direction="row" gap={1.25} flexWrap="wrap" useFlexGap>
        {DISCOVERY_CATEGORIES.map((code) => {
          const value = counts[code] ?? 0;
          const gap = isGap(value);
          return (
            <Paper key={code} variant="outlined" sx={{
              px: 1.75, py: 1.25, minWidth: 150,
              bgcolor: gap ? 'warning.light' : 'action.hover',
              borderColor: gap ? 'warning.main' : 'divider',
            }}>
              <Typography variant="body2" color={gap ? 'warning.dark' : 'text.secondary'}>
                {label(code)}
              </Typography>
              <Typography sx={{
                fontSize: 19, fontWeight: 700, fontFamily: 'monospace', lineHeight: 1.2,
                fontVariantNumeric: 'tabular-nums',
                color: gap ? 'warning.dark' : 'text.primary',
              }}>
                {value}
              </Typography>
              {gap && (
                <Typography variant="caption" sx={{ color: 'warning.dark' }}>Nothing here yet</Typography>
              )}
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}
