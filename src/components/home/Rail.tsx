'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand } from '@/lib/homeTheme';

export const RAIL_GAP = 16;

/**
 * Shared shell for a horizontal row of content.
 *
 * The rail deliberately runs past the container edge so the last visible card
 * is clipped — that sliver is what says "there is more here" without asking
 * for a click. Arrows are always rendered rather than revealed on hover, since
 * this audience will not necessarily think to drag sideways and hover does not
 * exist on touch.
 */
export default function Rail({
  label,
  sublabel,
  children,
  endCap,
  scrollStep,
}: {
  label: string;
  /** Plain explanation under a branded label, so the name never has to carry meaning alone. */
  sublabel?: string;
  children: React.ReactNode;
  /** Closing card that opens the fuller collection this row is drawn from. */
  endCap?: { label: string; href: string };
  scrollStep: number;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    sync();
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync]);

  const nudge = (direction: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: direction * scrollStep * 2, behavior: 'smooth' });
  };

  const arrowSx = (disabled: boolean) => ({
    width: 32,
    height: 32,
    display: 'grid',
    placeItems: 'center',
    border: `1px solid ${brand.border}`,
    borderRadius: '50%',
    bgcolor: brand.card,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    transition: 'border-color .16s ease, opacity .16s ease',
    '&:hover': disabled ? {} : { borderColor: brand.turquoise },
  });

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          mb: 1.5,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 15.5, fontWeight: 600, color: brand.ink }}>{label}</Typography>
          {sublabel ? (
            <Typography sx={{ fontSize: 13, color: brand.inkMuted, mt: 0.25 }}>
              {sublabel}
            </Typography>
          ) : null}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          <Box
            component="button"
            type="button"
            aria-label={`Scroll ${label} back`}
            disabled={atStart}
            onClick={() => nudge(-1)}
            sx={arrowSx(atStart)}
          >
            <ChevronLeftRoundedIcon sx={{ fontSize: 20, color: brand.ink }} />
          </Box>
          <Box
            component="button"
            type="button"
            aria-label={`Scroll ${label} forward`}
            disabled={atEnd}
            onClick={() => nudge(1)}
            sx={arrowSx(atEnd)}
          >
            <ChevronRightRoundedIcon sx={{ fontSize: 20, color: brand.ink }} />
          </Box>
        </Box>
      </Box>

      <Box
        ref={scrollerRef}
        onScroll={sync}
        sx={{
          display: 'flex',
          gap: `${RAIL_GAP}px`,
          overflowX: 'auto',
          scrollSnapType: 'x proximity',
          pb: 0.5,
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {children}

        {endCap ? (
          <Box
            component={Link}
            href={endCap.href}
            sx={{
              flex: `0 0 ${Math.round(scrollStep * 0.72)}px`,
              scrollSnapAlign: 'start',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              borderRadius: '12px',
              border: `1px dashed ${brand.borderStrong}`,
              color: brand.turquoiseDeep,
              transition: 'border-color .16s ease, background-color .16s ease',
              '&:hover': { borderColor: brand.turquoise, bgcolor: brand.turquoiseTint },
            }}
          >
            <ArrowForwardRoundedIcon sx={{ fontSize: 22 }} />
            <Typography
              sx={{ fontSize: 13.5, fontWeight: 500, textAlign: 'center', px: 1.5, lineHeight: 1.35 }}
            >
              {endCap.label}
            </Typography>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
