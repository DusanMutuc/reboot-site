'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import DOMPurify from 'dompurify';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Forward10Icon from '@mui/icons-material/Forward10';
import Replay10Icon from '@mui/icons-material/Replay10';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import type { PodcastEpisode, PodcastEpisodesResponse } from '@/types/podcast';

type PodcastState =
  | { status: 'loading'; episodes: PodcastEpisode[]; error: null }
  | { status: 'ready'; episodes: PodcastEpisode[]; error: null }
  | { status: 'error'; episodes: PodcastEpisode[]; error: string };

const SUBSCRIBE_URL =
  'https://subscribe.transistor.fm/shared_invite/CogGHmkX0IYZZ6DRM9EiMHplXXx6YebwAqBR';

type PodcastSectionProps = {
  compact?: boolean;
};

export default function PodcastSection({ compact = false }: PodcastSectionProps) {
  const [state, setState] = useState<PodcastState>({
    status: 'loading',
    episodes: [],
    error: null,
  });
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEpisodes() {
      try {
        setState((current) => ({ status: 'loading', episodes: current.episodes, error: null }));

        const response = await fetch('/api/podcast/episodes', {
          credentials: 'include',
        });
        const payload = (await response.json()) as Partial<PodcastEpisodesResponse> & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Could not load podcast episodes.');
        }

        if (!Array.isArray(payload.episodes)) {
          throw new Error('Podcast episode data was not available.');
        }

        if (!cancelled) {
          setState({ status: 'ready', episodes: payload.episodes, error: null });
          setSelectedEpisodeId((currentId) =>
            payload.episodes?.some((episode) => episode.id === currentId)
              ? currentId
              : payload.episodes?.[0]?.id ?? null,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            episodes: [],
            error: error instanceof Error ? error.message : 'Could not load podcast episodes.',
          });
        }
      }
    }

    void loadEpisodes();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEpisode = useMemo(() => {
    return (
      state.episodes.find((episode) => episode.id === selectedEpisodeId) ??
      state.episodes[0] ??
      null
    );
  }, [selectedEpisodeId, state.episodes]);

  const sanitizedDescription = useMemo(() => {
    if (!selectedEpisode?.descriptionHtml) return '';
    return DOMPurify.sanitize(selectedEpisode.descriptionHtml);
  }, [selectedEpisode]);

  return (
    <section
      style={{
        width: '100%',
        backgroundColor: '#000',
        paddingBottom: compact ? '2.5rem' : '5rem',
        textAlign: 'center',
      }}
    >
      <Box
        sx={{
          width: '100%',
          backgroundColor: '#000',
          px: { xs: 2, md: compact ? 4 : 6 },
          pt: compact ? { xs: 3.5, md: 4.5 } : { xs: 4, md: 5 },
          pb: compact ? { xs: 3.5, md: 4.5 } : { xs: 5, md: 7 },
        }}
      >
        <Box
          sx={{
            maxWidth: compact ? 1200 : 1370,
            mx: 'auto',
            display: 'grid',
            gridTemplateColumns: compact
              ? { xs: '1fr', md: 'minmax(180px, 260px) minmax(0, 1fr)' }
              : { xs: '1fr', md: 'minmax(260px, 380px) minmax(0, 1fr)' },
            gap: compact ? { xs: 2.5, md: 3.5 } : { xs: 3, md: 6 },
            alignItems: 'center',
            textAlign: { xs: 'center', md: 'left' },
          }}
        >
          <Box
            aria-label="Private Tribe Podcast"
            sx={{
              minHeight: compact ? { xs: 180, sm: 220, md: 230 } : { xs: 250, sm: 320, md: 360 },
              width: '100%',
              maxWidth: compact ? { xs: 300, md: 'none' } : { xs: 380, md: 'none' },
              mx: 'auto',
              backgroundImage:
                "url('/podcast%20image.png'), url('/podcast-hero.png'), linear-gradient(145deg, #303030 0%, #0b0b0b 100%)",
              backgroundSize: 'contain, cover, cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              border: '1px solid rgba(255,255,255,0.14)',
              boxShadow: compact ? '0 14px 32px rgba(0,0,0,0.48)' : '0 24px 60px rgba(0,0,0,0.58)',
            }}
          />

          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="h1"
              sx={{
                fontWeight: 900,
                color: '#fff',
                fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif',
                textTransform: 'uppercase',
                letterSpacing: 0,
                lineHeight: compact ? 1.02 : 0.92,
                fontSize: compact
                  ? { xs: 'clamp(1.75rem, 7.5vw, 2.5rem)', md: 'clamp(3rem, 4.5vw, 6rem)' }
                  : {
                      xs: 'clamp(4rem, 15vw, 6rem)',
                      md: 'clamp(6.4rem, 6.4vw, 11.5rem)',
                    },
                maxWidth: compact ? 760 : 980,
                mx: { xs: 'auto', md: 0 },
                mb: compact ? { xs: 1.25, md: 1.5 } : { xs: 2.5, md: 3 },
              }}
            >
              Miss a coaching call? You still get the best parts.
            </Typography>

            <Typography
              sx={{
                color: '#fff',
                fontSize: compact ? { xs: '0.98rem', md: '1.1rem' } : { xs: '1.6rem', md: '2.9rem' },
                fontWeight: 500,
                lineHeight: compact ? 1.45 : 1.18,
                letterSpacing: compact ? { xs: 0.4, md: 1 } : { xs: 1.2, md: 4 },
                textTransform: 'uppercase',
                maxWidth: compact ? 720 : 900,
                mx: { xs: 'auto', md: 0 },
                mb: compact ? { xs: 2, md: 2.25 } : { xs: 3, md: 4.5 },
              }}
            >
              Weekly replay podcast with the best key moments, guest experts, and masterclasses.
            </Typography>

            <Button
              component="a"
              href={SUBSCRIBE_URL}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              sx={{
                px: compact ? { xs: 1.8, md: 2.5 } : { xs: 2.5, md: 3.5 },
                py: compact ? { xs: 0.9, md: 1.1 } : { xs: 1.25, md: 1.6 },
                minHeight: compact ? { xs: 38, md: 44 } : { xs: 48, md: 64 },
                borderRadius: compact ? 1 : 1.5,
                border: '1px solid rgba(255,255,255,0.22)',
                fontSize: compact ? { xs: '1rem', md: '1.15rem' } : { xs: '2rem', md: '3.2rem' },
                fontWeight: 900,
                lineHeight: 1,
                textTransform: 'uppercase',
                backgroundColor: '#d93025 !important',
                boxShadow: compact
                  ? 'inset 0 0 0 1px rgba(255,255,255,0.14), 0 4px 0 rgba(118,15,10,0.75)'
                  : 'inset 0 0 0 2px rgba(255,255,255,0.14), 0 10px 0 rgba(118,15,10,0.75)',
                '&:hover': {
                  backgroundColor: '#ef3d31 !important',
                  transform: 'translateY(-2px)',
                  boxShadow: compact
                    ? 'inset 0 0 0 1px rgba(255,255,255,0.18), 0 5px 0 rgba(118,15,10,0.75)'
                    : 'inset 0 0 0 2px rgba(255,255,255,0.18), 0 12px 0 rgba(118,15,10,0.75)',
                },
                '&:focus-visible': {
                  outline: '4px solid rgba(239,61,49,0.45)',
                  outlineOffset: 5,
                },
              }}
            >
              Download Now
            </Button>
          </Box>
        </Box>
      </Box>

      <Box sx={{ maxWidth: compact ? 1200 : 1160, mx: 'auto', mt: compact ? { xs: 2, md: 3 } : { xs: 2, md: 4 }, mb: compact ? 2.5 : 4, px: { xs: 2, md: compact ? 4 : 2 } }}>
        {state.status === 'loading' && state.episodes.length === 0 ? (
          <Stack
            spacing={2}
            alignItems="center"
            justifyContent="center"
            sx={{ minHeight: 320, color: '#fff' }}
          >
            <CircularProgress size={28} sx={{ color: '#e70e17' }} />
            <Typography sx={{ fontWeight: 700 }}>Loading podcast episodes...</Typography>
          </Stack>
        ) : state.status === 'error' ? (
          <Alert
            severity="error"
            sx={{ maxWidth: '48rem', mx: 'auto', textAlign: 'left', borderRadius: 1 }}
          >
            {state.error}
          </Alert>
        ) : state.episodes.length === 0 ? (
          <Typography sx={{ color: '#fff', fontWeight: 700, py: 8 }}>
            No podcast episodes are available yet.
          </Typography>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.45fr) minmax(280px, .85fr)' },
              gap: { xs: 2.5, md: 3 },
              alignItems: 'start',
              textAlign: 'left',
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <SelectedEpisodePanel
                episode={selectedEpisode}
                sanitizedDescription={sanitizedDescription}
              />
            </Box>

            <EpisodeList
              episodes={state.episodes}
              selectedEpisodeId={selectedEpisode?.id ?? null}
              onSelectEpisode={setSelectedEpisodeId}
            />
          </Box>
        )}
      </Box>
    </section>
  );
}

function SelectedEpisodePanel({
  episode,
  sanitizedDescription,
}: {
  episode: PodcastEpisode | null;
  sanitizedDescription: string;
}) {
  if (!episode) return null;

  return (
    <Stack
      spacing={2.5}
      sx={{
        bgcolor: '#070707',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 1,
        p: { xs: 1.75, md: 2.25 },
        color: '#fff',
      }}
    >
      {episode.mediaUrl ? (
        <AudioPlayer
          key={episode.id}
          src={episode.mediaUrl}
          episode={episode}
          durationSeconds={episode.durationSeconds}
        />
      ) : episode.playerUrl ? (
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: { xs: 190, md: 180 },
            borderRadius: 1,
            overflow: 'hidden',
            bgcolor: '#050505',
            boxShadow: '0 .375rem 1.125rem rgba(0,0,0,0.4)',
          }}
        >
          <iframe
            key={episode.id}
            title={`Podcast player for ${episode.title}`}
            loading="lazy"
            scrolling="no"
            src={episode.playerUrl}
            allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write *"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              border: 0,
              display: 'block',
            }}
          />
        </Box>
      ) : (
        <Alert severity="warning" sx={{ borderRadius: 1 }}>
          This episode does not have an embeddable player available.
        </Alert>
      )}

      {sanitizedDescription ? (
        <Box
          sx={{
            maxHeight: { xs: 220, md: 180 },
            overflowY: 'auto',
            pr: 1,
            pt: 2,
            borderTop: '1px solid rgba(255,255,255,0.1)',
            scrollbarWidth: 'thin',
            scrollbarColor: '#e70e17 #111',
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 1.25 }}>
            Episode Notes
          </Typography>
          <Box
            sx={{
              color: 'rgba(255,255,255,0.88)',
              fontSize: { xs: '1rem', md: '1.05rem' },
              lineHeight: 1.7,
              overflowWrap: 'anywhere',
              '& p': { mt: 0, mb: 1.5 },
              '& p:last-child': { mb: 0 },
              '& a': { color: '#ff5555', fontWeight: 700 },
              '& ul, & ol': { pl: 3, mb: 1.5 },
              '& li': { mb: 0.75 },
            }}
            dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
          />
        </Box>
      ) : null}
    </Stack>
  );
}

function AudioPlayer({
  src,
  episode,
  durationSeconds,
}: {
  src: string;
  episode: PodcastEpisode;
  durationSeconds: number | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(durationSeconds ?? 0);
  }, [durationSeconds, src]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const resolvedDuration = duration || durationSeconds || 0;
  const progressPercent =
    resolvedDuration > 0 ? Math.min(100, (currentTime / resolvedDuration) * 100) : 0;

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
      return;
    }

    audio.pause();
    setIsPlaying(false);
  };

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.target.value);
    const audio = audioRef.current;
    if (!Number.isFinite(nextTime)) return;

    if (audio) {
      audio.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
  };

  const handleSkip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const audioDuration = Number.isFinite(audio.duration) ? audio.duration : resolvedDuration;
    const nextTime = Math.min(Math.max(audio.currentTime + seconds, 0), audioDuration || Infinity);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextVolume = Number(event.target.value);
    if (!Number.isFinite(nextVolume)) return;

    setVolume(Math.min(Math.max(nextVolume, 0), 1));
  };

  const toggleMute = () => {
    setVolume((currentVolume) => (currentVolume > 0 ? 0 : 0.75));
  };

  return (
    <Box
      sx={{
        width: '100%',
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: '#050505',
        border: '1px solid rgba(255,255,255,0.14)',
        p: { xs: 1.5, md: 2 },
        boxShadow: '0 .375rem 1.125rem rgba(0,0,0,0.4)',
      }}
    >
      <audio
        ref={audioRef}
        preload="metadata"
        src={src}
        aria-label={`Podcast audio for ${episode.title}`}
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration;
          if (Number.isFinite(nextDuration)) setDuration(nextDuration);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onEnded={() => setIsPlaying(false)}
      >
        Your browser does not support the audio player.
      </audio>

      <Stack spacing={{ xs: 2, md: 2.25 }}>
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          justifyContent="space-between"
          sx={{ gap: 2 }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: '#e70e17',
                flexShrink: 0,
              }}
            />
            <Typography
              variant="overline"
              sx={{
                color: 'rgba(255,255,255,0.5)',
                fontWeight: 900,
                letterSpacing: 2.4,
                lineHeight: 1.1,
              }}
            >
              Now Playing
            </Typography>
          </Stack>

          <Typography
            sx={{
              color: '#ff6a6a',
              fontWeight: 800,
              fontSize: { xs: '0.78rem', md: '0.9rem' },
              lineHeight: 1,
              px: 1.4,
              py: 0.9,
              borderRadius: 1,
              border: '1px solid #e70e17',
              bgcolor: 'rgba(231,14,23,0.1)',
              whiteSpace: 'nowrap',
            }}
          >
            Coaching Replay
          </Typography>
        </Stack>

        <Stack spacing={1.25}>
          <Typography
            sx={{
              color: 'rgba(255,255,255,0.52)',
              fontWeight: 800,
              fontSize: { xs: '0.95rem', md: '1.05rem' },
            }}
          >
            {episode.episodeNumber ? `Episode ${episode.episodeNumber}` : 'Selected Episode'}
          </Typography>

          <Typography
            variant="h3"
            sx={{
              color: '#fff',
              fontWeight: 900,
              fontSize: { xs: '1.75rem', md: '2.5rem' },
              lineHeight: 1.15,
            }}
          >
            {episode.title}
          </Typography>

          <Typography
            sx={{
              color: 'rgba(255,255,255,0.5)',
              fontWeight: 700,
              fontSize: { xs: '0.95rem', md: '1.05rem' },
            }}
          >
            {[episode.publishedLabel, episode.durationLabel].filter(Boolean).join(' | ')}
          </Typography>
        </Stack>

        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-start">
            <PlayerIconButton ariaLabel="Go back 10 seconds" onClick={() => handleSkip(-10)}>
              <Replay10Icon />
            </PlayerIconButton>

            <IconButton
              type="button"
              aria-label={isPlaying ? 'Pause episode' : 'Play episode'}
              onClick={togglePlayback}
              sx={{
                width: { xs: 42, md: 48 },
                height: { xs: 42, md: 48 },
                color: '#fff',
                bgcolor: '#ef4444',
                flexShrink: 0,
                '& svg': { fontSize: { xs: 23, md: 27 } },
                '&:hover': { bgcolor: '#ff5555' },
                '&:focus-visible': {
                  outline: '3px solid rgba(231,14,23,0.45)',
                  outlineOffset: 2,
                },
              }}
            >
              {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>

            <PlayerIconButton ariaLabel="Go forward 10 seconds" onClick={() => handleSkip(10)}>
              <Forward10Icon />
            </PlayerIconButton>
          </Stack>

          <Box
            component="input"
            type="range"
            min={0}
            max={resolvedDuration || 0}
            step={0.1}
            value={resolvedDuration ? Math.min(currentTime, resolvedDuration) : 0}
            disabled={!resolvedDuration}
            aria-label="Episode playback position"
            onChange={handleSeek}
            sx={playerRangeSx(progressPercent, resolvedDuration)}
          />
        </Stack>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
        >
          <Stack direction="row" spacing={1} justifyContent="space-between" sx={{ minWidth: { sm: 130 } }}>
            <Typography
              component="span"
              sx={{
                color: 'rgba(255,255,255,0.45)',
                fontVariantNumeric: 'tabular-nums',
                fontSize: { xs: '0.88rem', md: '0.98rem' },
              }}
            >
              {formatPlaybackTime(currentTime)}
            </Typography>

            <Typography
              component="span"
              sx={{
                color: 'rgba(255,255,255,0.45)',
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right',
                fontSize: { xs: '0.88rem', md: '0.98rem' },
              }}
            >
              {resolvedDuration ? formatPlaybackTime(resolvedDuration) : '--:--'}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'flex-end', sm: 'flex-start' }}>
            <IconButton
              type="button"
              aria-label={volume > 0 ? 'Mute episode' : 'Unmute episode'}
              onClick={toggleMute}
              sx={{
                width: 34,
                height: 34,
                color: 'rgba(255,255,255,0.72)',
                bgcolor: 'rgba(255,255,255,0.08)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.14)' },
                '& svg': { fontSize: 20 },
              }}
            >
              {volume > 0 ? <VolumeUpIcon /> : <VolumeOffIcon />}
            </IconButton>

            <Box
              component="input"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              aria-label="Episode volume"
              onChange={handleVolumeChange}
              sx={{
                ...playerRangeSx(volume * 100, 1),
                width: { xs: 130, md: 150 },
                '&::-webkit-slider-thumb': {
                  width: 14,
                  height: 14,
                  mt: '-3px',
                  borderRadius: '50%',
                  bgcolor: '#fff',
                  border: '2px solid #e70e17',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                  appearance: 'none',
                },
                '&::-moz-range-thumb': {
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: '#fff',
                  border: '2px solid #e70e17',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                },
              }}
            />
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
}

function PlayerIconButton({
  ariaLabel,
  children,
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <IconButton
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      sx={{
        width: { xs: 34, md: 38 },
        height: { xs: 34, md: 38 },
        color: 'rgba(255,255,255,0.8)',
        bgcolor: 'rgba(255,255,255,0.08)',
        flexShrink: 0,
        '& svg': { fontSize: { xs: 19, md: 21 } },
        '&:hover': {
          color: '#fff',
          bgcolor: 'rgba(255,255,255,0.14)',
        },
        '&:focus-visible': {
          outline: '3px solid rgba(231,14,23,0.45)',
          outlineOffset: 2,
        },
      }}
    >
      {children}
    </IconButton>
  );
}

function playerRangeSx(progressPercent: number, resolvedDuration: number) {
  return {
    width: '100%',
    height: 8,
    m: 0,
    p: 0,
    cursor: resolvedDuration ? 'pointer' : 'default',
    appearance: 'none',
    borderRadius: 1,
    bgcolor: 'transparent',
    background: `linear-gradient(to right, #e70e17 ${progressPercent}%, rgba(255,255,255,0.22) ${progressPercent}%)`,
    '&::-webkit-slider-runnable-track': {
      height: 8,
      borderRadius: 1,
    },
    '&::-webkit-slider-thumb': {
      appearance: 'none',
      width: 18,
      height: 18,
      mt: '-5px',
      borderRadius: '50%',
      bgcolor: '#fff',
      border: '3px solid #e70e17',
      boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
    },
    '&::-moz-range-track': {
      height: 8,
      borderRadius: 1,
      bgcolor: 'rgba(255,255,255,0.22)',
    },
    '&::-moz-range-progress': {
      height: 8,
      borderRadius: 1,
      bgcolor: '#e70e17',
    },
    '&::-moz-range-thumb': {
      width: 14,
      height: 14,
      borderRadius: '50%',
      bgcolor: '#fff',
      border: '3px solid #e70e17',
      boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
    },
    '&:focus-visible': {
      outline: '3px solid rgba(231,14,23,0.45)',
      outlineOffset: 4,
    },
  } as const;
}

function EpisodeList({
  episodes,
  selectedEpisodeId,
  onSelectEpisode,
}: {
  episodes: PodcastEpisode[];
  selectedEpisodeId: string | null;
  onSelectEpisode: (episodeId: string) => void;
}) {
  return (
    <Stack
      spacing={1.25}
      sx={{
        maxHeight: { xs: 'none', lg: '48rem' },
        overflowY: { xs: 'visible', lg: 'auto' },
        pr: { lg: 0.75 },
        scrollbarWidth: 'thin',
        scrollbarColor: '#e70e17 #111',
        '&::-webkit-scrollbar': {
          width: 10,
        },
        '&::-webkit-scrollbar-track': {
          bgcolor: '#111',
          borderRadius: 1,
        },
        '&::-webkit-scrollbar-thumb': {
          bgcolor: '#e70e17',
          borderRadius: 1,
          border: '2px solid #111',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          bgcolor: '#ff5555',
        },
      }}
    >
      {episodes.map((episode, index) => {
        const selected = episode.id === selectedEpisodeId;
        return (
          <Box
            key={episode.id}
            component="button"
            type="button"
            aria-pressed={selected}
            onClick={() => onSelectEpisode(episode.id)}
            sx={{
              width: '100%',
              border: '1px solid',
              borderColor: selected ? '#e70e17' : 'rgba(255,255,255,0.14)',
              borderRadius: 1,
              bgcolor: selected ? 'rgba(231,14,23,0.16)' : '#111',
              color: '#fff',
              cursor: 'pointer',
              p: { xs: 2.25, md: 2.5 },
              textAlign: 'left',
              font: 'inherit',
              transition: 'border-color 160ms ease, background-color 160ms ease, transform 160ms ease',
              '&:hover': {
                borderColor: '#ff5555',
                bgcolor: selected ? 'rgba(231,14,23,0.22)' : '#171717',
                transform: 'translateY(-1px)',
              },
              '&:focus-visible': {
                outline: '3px solid rgba(231,14,23,0.45)',
                outlineOffset: 2,
              },
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  minWidth: 42,
                  borderRadius: 1,
                  bgcolor: selected ? '#e70e17' : 'rgba(255,255,255,0.08)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  px: 1,
                }}
              >
                <Typography
                  component="span"
                  sx={{
                    color: '#fff',
                    fontWeight: 900,
                    fontSize: { xs: '0.95rem', md: '1.05rem' },
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatEpisodeBadge(episode, index, episodes.length)}
                </Typography>
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  sx={{
                    fontWeight: 800,
                    lineHeight: 1.35,
                    fontSize: { xs: '1rem', md: '1.08rem' },
                  }}
                >
                  {episode.title}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'rgba(255,255,255,0.68)',
                    mt: 0.75,
                    fontSize: { xs: '0.88rem', md: '0.95rem' },
                    lineHeight: 1.45,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {[formatEpisodeListMeta(episode), episode.durationLabel].filter(Boolean).join(' | ')}
                </Typography>
              </Box>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

function formatEpisodeListMeta(episode: PodcastEpisode): string {
  const parts = [episode.publishedLabel].filter(Boolean);

  return parts.join(' | ');
}

function formatEpisodeBadge(
  episode: PodcastEpisode,
  index: number,
  totalEpisodes: number,
): string {
  return String(episode.episodeNumber ?? totalEpisodes - index);
}

function formatPlaybackTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0:00';

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
