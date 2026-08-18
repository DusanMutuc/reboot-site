'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Box, Typography } from '@mui/material';
import { brand } from '@/lib/homeTheme';
import Rail, { RAIL_GAP } from './Rail';
import { thumbFor } from './thumbnails';
import type { BrowseRow } from './types';

const CARD_WIDTH = 232;

/**
 * A rail of standalone resources — one thing, consumed in one sitting. Cards
 * lead with duration, because for a snack that is the deciding factor.
 * Courses use a visibly different card; see CourseRail.
 */
export default function BrowseRail({
  row,
  sublabel,
  endCapLabel = null,
}: {
  row: BrowseRow;
  sublabel?: string;
  /** Null when something else on the surface already offers the way out. */
  endCapLabel?: string | null;
}) {
  return (
    <Rail
      label={row.label}
      sublabel={sublabel}
      scrollStep={CARD_WIDTH + RAIL_GAP}
      endCap={endCapLabel ? { label: endCapLabel, href: '/library' } : undefined}
    >
      {row.items.map((entry) => (
        <Box
          key={entry.id}
          component={Link}
          href={entry.href}
          sx={{
            flex: `0 0 ${CARD_WIDTH}px`,
            scrollSnapAlign: 'start',
            display: 'block',
            borderRadius: '12px',
            overflow: 'hidden',
            border: `1px solid ${brand.border}`,
            bgcolor: brand.card,
            transition: 'border-color .16s ease, transform .16s ease',
            '&:hover': { borderColor: brand.turquoise, transform: 'translateY(-2px)' },
            '&:hover .bi-title': { color: brand.turquoiseDeep },
          }}
        >
          <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', bgcolor: '#e7ebea' }}>
            <Image
              src={thumbFor(entry.thumbIndex).src}
              alt=""
              aria-hidden="true"
              fill
              quality={55}
              sizes="232px"
              style={{ objectFit: 'cover', objectPosition: thumbFor(entry.thumbIndex).objectPosition }}
            />
            <Typography
              component="span"
              sx={{
                position: 'absolute',
                right: 6,
                bottom: 6,
                px: 0.75,
                py: 0.125,
                borderRadius: '4px',
                bgcolor: 'rgba(18,20,20,0.78)',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {entry.durationLabel}
            </Typography>
          </Box>

          {entry.progressPct !== null ? (
            <Box sx={{ height: 4, bgcolor: '#e7ebea' }}>
              <Box sx={{ width: `${entry.progressPct}%`, height: '100%', bgcolor: brand.turquoise }} />
            </Box>
          ) : null}

          <Box sx={{ p: 1.5 }}>
            <Typography
              variant="kicker"
              sx={{
                color: brand.inkMuted,
                mb: 0.5,
              }}
            >
              {entry.typeLabel}
            </Typography>
            <Typography
              className="bi-title"
              sx={{
                fontSize: 15,
                fontWeight: 500,
                lineHeight: 1.35,
                color: brand.ink,
                transition: 'color .16s ease',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                minHeight: 39,
              }}
            >
              {entry.title}
            </Typography>
          </Box>
        </Box>
      ))}
    </Rail>
  );
}
