'use client';

import Link from 'next/link';
import { Box, InputAdornment, TextField, Typography } from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import PodcastsRoundedIcon from '@mui/icons-material/PodcastsRounded';
import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { brand } from '@/lib/homeTheme';
import { GroupLabel, Panel } from './Panel';
import SearchWithResults from './SearchWithResults';
import type { BrowseTile, ContinueItem, LatestEpisode, SearchItem } from './types';

const TILE_ICONS: Record<BrowseTile['key'], React.ReactNode> = {
  courses: <SchoolRoundedIcon />,
  library: <MenuBookRoundedIcon />,
  podcast: <PodcastsRoundedIcon />,
  explainers: <PlayCircleOutlineRoundedIcon />,
};

export default function TrainingPanel({
  continueItem,
  browseTiles,
  latestEpisode,
  searchIndex,
}: {
  continueItem: ContinueItem | null;
  browseTiles: BrowseTile[];
  latestEpisode: LatestEpisode | null;
  /** When supplied, search resolves inline instead of rendering an inert field. */
  searchIndex?: SearchItem[];
}) {
  return (
    <Panel label="Find a training" id="training" delayMs={60}>
      <Box sx={{ mb: 2.75 }}>
        {searchIndex ? (
          <SearchWithResults index={searchIndex} />
        ) : (
          <TextField
            fullWidth
            placeholder="Search playbooks, courses, recordings…"
            aria-label="Search training content"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon sx={{ fontSize: 21, color: brand.inkMuted }} />
                  </InputAdornment>
                ),
              },
            }}
          />
        )}
      </Box>

      {continueItem ? (
        <Box sx={{ mb: 2.75 }}>
          <GroupLabel>Continue where you left off</GroupLabel>
          <Box
            component={Link}
            href={continueItem.href}
            sx={{
              display: 'block',
              p: 2,
              borderRadius: '10px',
              border: `1px solid ${brand.border}`,
              transition: 'border-color .16s ease, background-color .16s ease',
              '&:hover': { borderColor: brand.turquoise, bgcolor: brand.turquoiseTint },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, mb: 1.25 }}>
              <Typography variant="cardTitle" sx={{ color: brand.ink }}>
                {continueItem.title}
              </Typography>
              <Typography sx={{ fontSize: 13, color: brand.inkMuted, flexShrink: 0 }}>
                {continueItem.contextLabel}
              </Typography>
            </Box>
            <Box
              role="progressbar"
              aria-valuenow={continueItem.progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${continueItem.title} progress`}
              sx={{ height: 6, bgcolor: '#eceff0', borderRadius: 3, overflow: 'hidden' }}
            >
              <Box sx={{ width: `${continueItem.progressPct}%`, height: '100%', bgcolor: brand.turquoise }} />
            </Box>
          </Box>
        </Box>
      ) : null}

      <GroupLabel>Browse everything</GroupLabel>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
          gap: 1.25,
          mb: latestEpisode ? 2.75 : 0,
        }}
      >
        {browseTiles.map((tile) => (
          <Box
            key={tile.key}
            component={Link}
            href={tile.href}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 1,
              px: 1.75,
              py: 2,
              borderRadius: '10px',
              border: `1px solid ${brand.border}`,
              transition: 'border-color .16s ease, background-color .16s ease, transform .16s ease',
              '&:hover': {
                borderColor: brand.turquoise,
                bgcolor: brand.turquoiseTint,
                transform: 'translateY(-2px)',
              },
              '& svg': { fontSize: 24, color: brand.turquoiseDeep },
            }}
          >
            {TILE_ICONS[tile.key]}
            <Typography variant="cardTitle" sx={{ fontSize: 15, color: brand.ink }}>
              {tile.label}
            </Typography>
          </Box>
        ))}
      </Box>

      {latestEpisode ? (
        <Box>
          <GroupLabel>Latest episode</GroupLabel>
          <Box
            component={Link}
            href={latestEpisode.href}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.75,
              p: 1.75,
              borderRadius: '10px',
              border: `1px solid ${brand.border}`,
              bgcolor: '#fbfcfc',
              transition: 'border-color .16s ease, background-color .16s ease',
              '&:hover': { borderColor: brand.turquoise, bgcolor: brand.turquoiseTint },
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                width: 42,
                height: 42,
                flexShrink: 0,
                borderRadius: '50%',
                bgcolor: brand.turquoise,
                color: brand.ink,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <PlayArrowRoundedIcon sx={{ fontSize: 25 }} />
            </Box>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                {latestEpisode.isNew ? (
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: brand.turquoiseDeep,
                      bgcolor: brand.turquoiseTint,
                      border: `1px solid ${brand.turquoise}`,
                      borderRadius: '4px',
                      px: 0.75,
                      py: 0.125,
                    }}
                  >
                    New
                  </Typography>
                ) : null}
                <Typography sx={{ fontSize: 12, color: brand.inkMuted }}>
                  {latestEpisode.episodeLabel} · {latestEpisode.durationLabel}
                </Typography>
              </Box>
              <Typography variant="cardTitle" sx={{ fontSize: 16, color: brand.ink }}>
                {latestEpisode.title}
              </Typography>
            </Box>
          </Box>
        </Box>
      ) : null}
    </Panel>
  );
}
