'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand, CARD_RADIUS } from '@/lib/homeTheme';
import type { Episode } from './types';

const LIST_LENGTH = 5;

/**
 * The podcast, restored as a real card rather than a single link.
 *
 * Internally two columns — featured episode and player on the left, a
 * selectable list on the right — so it fills its width instead of stacking as
 * another full-width strip. Selecting from the list swaps the featured episode.
 *
 * Audio is not wired: the transport is presentational until this is connected
 * to the episodes route, which already returns `media_url` per episode.
 */
export default function PodcastCard({ episodes }: { episodes: Episode[] }) {
  const [selected, setSelected] = useState(0);

  if (episodes.length === 0) {
    return (
      <Box component="section" id="podcast">
        <Typography
          variant="sectionLabel"
          component="h2"
          sx={{ fontSize: 17, color: brand.inkSoft, mb: 1.75 }}
        >
          Private podcast
        </Typography>
        <Box
          sx={{
            border: `1px solid ${brand.border}`,
            borderRadius: CARD_RADIUS,
            bgcolor: brand.card,
            p: 3,
          }}
        >
          <Typography sx={{ fontSize: 15, color: brand.inkMuted }}>
            No episodes published yet.
          </Typography>
        </Box>
      </Box>
    );
  }

  const featured = episodes[Math.min(selected, episodes.length - 1)];
  const rest = episodes.filter((_, index) => index !== selected).slice(0, LIST_LENGTH);

  return (
    <Box component="section" id="podcast">
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 2,
          mb: 1.75,
        }}
      >
        <Typography variant="sectionLabel" component="h2" sx={{ fontSize: 17, color: brand.inkSoft }}>
          Private podcast
        </Typography>
        <Box
          component={Link}
          href="#"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            flexShrink: 0,
            fontSize: 14,
            fontWeight: 500,
            color: brand.turquoiseDeep,
            '&:hover': { color: brand.ink },
          }}
        >
          All {episodes.length} episodes
          <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.1fr) minmax(0, 1fr)' },
          border: `1px solid ${brand.border}`,
          borderRadius: CARD_RADIUS,
          bgcolor: brand.card,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ p: { xs: 2.5, md: 3 }, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            {featured.isNew ? (
              <Typography
                component="span"
                sx={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: brand.ink,
                  bgcolor: brand.turquoise,
                  borderRadius: '3px',
                  px: 0.625,
                }}
              >
                New
              </Typography>
            ) : null}
            <Typography sx={{ fontSize: 12, color: brand.inkMuted }}>
              {featured.episodeLabel} · {featured.publishedLabel}
            </Typography>
          </Box>

          <Typography variant="cardTitle" sx={{ fontSize: 19, color: brand.ink, mb: 1 }}>
            {featured.title}
          </Typography>

          {featured.summary ? (
            <Typography
              sx={{
                fontSize: 14,
                lineHeight: 1.55,
                color: brand.inkSoft,
                mb: 2.5,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {featured.summary}
            </Typography>
          ) : (
            <Box sx={{ mb: 2.5 }} />
          )}

          <Box sx={{ mt: 'auto', display: 'flex', alignItems: 'center', gap: 1.75 }}>
            <Box
              component="button"
              type="button"
              aria-label={`Play ${featured.title}`}
              sx={{
                width: 48,
                height: 48,
                flexShrink: 0,
                border: 'none',
                cursor: 'pointer',
                borderRadius: '50%',
                bgcolor: brand.turquoise,
                display: 'grid',
                placeItems: 'center',
                transition: 'background-color .16s ease',
                '&:hover': { bgcolor: brand.turquoiseDark },
              }}
            >
              <PlayArrowRoundedIcon sx={{ fontSize: 29, color: brand.ink }} />
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ height: 5, bgcolor: '#e7ebea', borderRadius: 3, overflow: 'hidden', mb: 0.75 }}>
                <Box sx={{ width: '0%', height: '100%', bgcolor: brand.turquoise }} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: 12, color: brand.inkMuted }}>0:00</Typography>
                <Typography sx={{ fontSize: 12, color: brand.inkMuted }}>
                  {featured.durationLabel}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            borderLeft: { xs: 'none', md: `1px solid ${brand.border}` },
            borderTop: { xs: `1px solid ${brand.border}`, md: 'none' },
            bgcolor: '#fbfcfc',
          }}
        >
          {rest.map((episode, index) => (
            <Box
              key={episode.episodeLabel}
              component="button"
              type="button"
              onClick={() => setSelected(episodes.indexOf(episode))}
              sx={{
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: { xs: 2, md: 2.5 },
                py: 1.5,
                borderTop: index === 0 ? 'none' : `1px solid ${brand.border}`,
                transition: 'background-color .14s ease',
                '&:hover': { bgcolor: brand.turquoiseTint },
                '&:hover .pc-t': { color: brand.turquoiseDeep },
              }}
            >
              <PlayArrowRoundedIcon
                aria-hidden="true"
                sx={{ fontSize: 17, color: brand.inkMuted, flexShrink: 0 }}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  className="pc-t"
                  sx={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: brand.ink,
                    lineHeight: 1.35,
                    transition: 'color .14s ease',
                  }}
                >
                  {episode.title}
                </Typography>
                <Typography sx={{ fontSize: 12, color: brand.inkMuted, mt: 0.25 }}>
                  {episode.episodeLabel} · {episode.durationLabel}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
