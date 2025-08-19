'use client';

import { Box, Button, Typography, Link as MuiLink } from '@mui/material';

const TRANSISTOR_SLUG = 'real-estate-reboot-coaching-private-tribe-podcast';
// Switch quickly if the playlist is acting up in a given browser
const PLAYER_MODE: 'playlist' | 'latest' = 'playlist';

export default function PodcastSection() {
  const src =
    PLAYER_MODE === 'playlist'
      ? `https://share.transistor.fm/e/${TRANSISTOR_SLUG}/playlist`
      : `https://share.transistor.fm/e/${TRANSISTOR_SLUG}/latest`;

  return (
    <section
      style={{
        width: '100%',
        backgroundColor: '#000',
        paddingBottom: '3.125rem',
        textAlign: 'center',
      }}
    >
      {/* Hero (smaller on phones) */}
      <Box
        sx={{
          width: '100%',
          minHeight: { xs: '14rem', md: '25rem' }, // ↓ reduced
          backgroundImage: "url('/podcast-hero.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundColor: '#000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: 2,
        }}
      >
        <Typography
          variant="h2"
          sx={{
            fontWeight: 800,
            color: '#fff',
            mb: .5,
            fontSize: { xs: 'clamp(2rem, 7.5vw, 2.75rem)', md: 'clamp(3.25rem, 5.5vw, 6rem)' }, // ↓ smaller
          }}
        >
          PRIVATE PODCAST
        </Typography>

        <Typography
          variant="subtitle1"
          sx={{
            color: '#fff',
            fontSize: { xs: '1rem', md: '1.8rem' }, // ↓ smaller
            fontWeight: 700,
            maxWidth: { xs: '48ch', md: 'unset' },
            mx: 'auto',
            textAlign: 'center',
          }}
        >
          Listen to Coaching Replays, Masterclasses&nbsp;&amp;&nbsp;Powerful Live Coaching Moments
        </Typography>
      </Box>

      {/* Player: responsive height, lazy, with 'allow' for safer playback */}
      <Box sx={{ maxWidth: '90rem', mx: 'auto', mt: 4, mb: 4, px: 2 }}>
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: { xs: 360, md: 390 },           // Transistor’s playlist is ~390px tall on desktop
            borderRadius: 2,
            overflow: 'hidden',
            boxShadow: '0 .375rem 1.125rem rgba(0,0,0,0.4)',
          }}
        >
          <iframe
            title="Reboot Podcast"
            loading="lazy"
            scrolling="no"
            src={src}
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

        {/* Fallback: open player in new tab if an extension/device blocks embeds */}
        <Typography sx={{ color: '#bbb', mt: 1, fontSize: '.9rem' }}>
          Having trouble playing?{' '}
          <MuiLink href={src} target="_blank" rel="noopener noreferrer" sx={{ color: '#fff' }}>
            Open the player in a new tab
          </MuiLink>
          .
        </Typography>
      </Box>

      {/* CTA */}
      <Button
        component="a"
        href="https://subscribe.transistor.fm/shared_invite/CogGHmkX0IYZZ6DRM9EiMHplXXx6YebwAqBR"
        target="_blank"
        rel="noopener noreferrer"
        variant="contained"
        sx={{
          mt: '1.5rem',
          px: { xs: '1.25rem', md: '2.5rem' },
          py: { xs: '.65rem', md: '.9rem' },
          minHeight: 44,
          borderRadius: '.5rem',
          fontSize: { xs: '1.05rem', md: '1.75rem' },
          fontWeight: 700,
          textTransform: 'uppercase',
          boxShadow: '0 .25rem .75rem rgba(0,0,0,0.25)',
          backgroundColor: '#e70e17 !important',
          '&:hover': {
            backgroundColor: '#ff5555',
            transform: 'translateY(-2px) scale(1.03)',
          },
        }}
      >
        SUBSCRIBE
      </Button>

      <Typography
        sx={{
          color: '#ffffff',
          fontWeight: 700,
          mt: 4,
          fontSize: { xs: '1.1rem', md: '1.75rem' },
        }}
      >
        NEVER MISS OUT AGAIN!
      </Typography>
    </section>
  );
}
