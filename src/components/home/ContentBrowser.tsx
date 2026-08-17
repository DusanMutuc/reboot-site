'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Box, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand } from '@/lib/homeTheme';
import { thumbFor } from './thumbnails';
import type { ContentCategory, ContentItem } from './types';

type Selection = ContentCategory | 'all' | 'for-you';

const CATEGORIES: Array<{ key: Selection; label: string }> = [
  { key: 'for-you', label: 'For you' },
  { key: 'all', label: 'All' },
  { key: 'marketing', label: 'Marketing & sales' },
  { key: 'systems', label: 'Systems & operations' },
  { key: 'hiring', label: 'Hiring & team' },
  { key: 'mindset', label: 'Mindset & leadership' },
];

const PREVIEW_SIZE = 8;

/**
 * The one place on this page where content is browsed.
 *
 * Recommendations used to sit above this in a rail of their own. Two
 * collections drawn in identical cards but driven by different mechanics — one
 * scrolled sideways, one filtered in place — read as a seam rather than a
 * sequence, and the chips underneath a labelled row had nothing saying what
 * they acted on. So "For you" is simply the first chip and the default view:
 * one object, one mechanic, and the recommendations are what they always
 * were — a selection of the same catalogue.
 *
 * The chips convey the *shape* of the library without needing its size, which
 * is what lets this stay a preview. Items belong to several categories at
 * once, the way a film sits in several genres.
 */
export default function ContentBrowser({
  items,
  recommended,
}: {
  items: ContentItem[];
  /** The relatedness algorithm's picks. Falls back to All when empty. */
  recommended: ContentItem[];
}) {
  const [category, setCategory] = useState<Selection>(
    recommended.length > 0 ? 'for-you' : 'all',
  );

  const filtered = useMemo(() => {
    if (category === 'for-you') return recommended;
    if (category === 'all') return items;
    return items.filter((i) => i.categories.includes(category));
  }, [items, recommended, category]);

  const visible = filtered.slice(0, PREVIEW_SIZE);

  return (
    <Box component="section" id="browse">
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          mb: 1.25,
        }}
      >
        {CATEGORIES.filter(
          (option) => option.key !== 'for-you' || recommended.length > 0,
        ).map((option) => {
          const isActive = option.key === category;
          return (
            <Box
              key={option.key}
              component="button"
              type="button"
              onClick={() => setCategory(option.key)}
              aria-pressed={isActive}
              sx={{
                cursor: 'pointer',
                px: 1.875,
                py: 1,
                borderRadius: '999px',
                fontFamily: '"Poppins", Arial, sans-serif',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                border: `1px solid ${isActive ? brand.slate : brand.border}`,
                bgcolor: isActive ? brand.slate : brand.card,
                color: isActive ? '#ffffff' : brand.inkSoft,
                transition: 'background-color .16s ease, border-color .16s ease, color .16s ease',
                '&:hover': isActive ? {} : { borderColor: brand.turquoise, color: brand.ink },
              }}
            >
              {option.label}
            </Box>
          );
        })}
      </Box>

      {/* Names the algorithm's reason rather than letting the chip imply
          curation. Height is reserved so switching chips does not shift the
          grid directly under the control just clicked. */}
      <Typography
        sx={{ minHeight: 22, mb: 2, fontSize: 14, lineHeight: '22px', color: brand.inkMuted }}
      >
        {category === 'for-you' ? 'Picked from what you’re working on now.' : ''}
      </Typography>

      {filtered.length === 0 ? (
        <Typography sx={{ fontSize: 15, color: brand.inkMuted }}>
          Nothing here yet.
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
              lg: 'repeat(4, minmax(0, 1fr))',
            },
            gap: { xs: 1.75, md: 2.25 },
          }}
        >
          {visible.map((entry) => (
            <Box
              key={entry.id}
              component={Link}
              href={entry.href}
              sx={{
                display: 'block',
                borderRadius: '12px',
                overflow: 'hidden',
                border: `1px solid ${brand.border}`,
                bgcolor: brand.card,
                transition: 'border-color .16s ease, transform .16s ease',
                '&:hover': { borderColor: brand.turquoise, transform: 'translateY(-2px)' },
                '&:hover .ci-title': { color: brand.turquoiseDeep },
              }}
            >
              <Box
                sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', bgcolor: '#e7ebea' }}
              >
                <Image
                  src={thumbFor(entry.thumbIndex).src}
                  alt=""
                  aria-hidden="true"
                  fill
                  quality={55}
                  sizes="(max-width: 900px) 50vw, 280px"
                  style={{
                    objectFit: 'cover',
                    objectPosition: thumbFor(entry.thumbIndex).objectPosition,
                  }}
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
                  {entry.metaLabel}
                </Typography>

                {entry.typeLabel === 'Training' ? (
                  <Typography
                    component="span"
                    sx={{
                      position: 'absolute',
                      left: 6,
                      bottom: 6,
                      px: 0.75,
                      py: 0.25,
                      borderRadius: '4px',
                      bgcolor: brand.turquoise,
                      color: brand.ink,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Training
                  </Typography>
                ) : null}
              </Box>

              {entry.progressPct !== null ? (
                <Box sx={{ height: 4, bgcolor: '#e7ebea' }}>
                  <Box
                    sx={{ width: `${entry.progressPct}%`, height: '100%', bgcolor: brand.turquoise }}
                  />
                </Box>
              ) : null}

              <Box sx={{ p: 1.5 }}>
                <Typography
                  sx={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: '0.09em',
                    textTransform: 'uppercase',
                    color: brand.inkMuted,
                    mb: 0.5,
                  }}
                >
                  {entry.typeLabel}
                </Typography>
                <Typography
                  className="ci-title"
                  sx={{
                    fontSize: 14.5,
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
        </Box>
      )}

      {/* One exit. Everything past the preview lives in the library. */}
      <Box sx={{ mt: 3 }}>
        <Box
          component={Link}
          href="/library"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            px: 2.25,
            py: 1.125,
            borderRadius: '10px',
            border: `1px solid ${brand.borderStrong}`,
            bgcolor: brand.card,
            fontSize: 14.5,
            fontWeight: 500,
            color: brand.ink,
            transition: 'border-color .16s ease',
            '&:hover': { borderColor: brand.turquoise },
          }}
        >
          Open the full library
          <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
        </Box>
      </Box>
    </Box>
  );
}
