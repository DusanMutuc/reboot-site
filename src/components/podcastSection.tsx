'use client';

import { Box, Button, Typography } from '@mui/material';

export default function PodcastSection() {
  return (
    <section
      style={{
        width: '100%',
        backgroundColor: '#000',
        paddingBottom: '3.125rem', // 50px → rem
        textAlign: 'center',
      }}
    >
      {/* ─────────── Hero banner (edge-to-edge) ─────────── */}
      <Box
        sx={{
          width: '100%',
          height: { xs: '18.75rem', md: '25rem' }, // 300/400px → rem
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
            mb: 1,
            fontSize: { xs: 'clamp(2.5rem, 10vw, 4rem)', md: 'clamp(4rem, 6vw, 8rem)' },
          }}
        >
          PRIVATE PODCAST
        </Typography>

        <Typography
          variant="subtitle1"
          sx={{
            color: '#fff',
            fontSize: { xs: '1.7rem', md: '2.3rem' },
            fontWeight: 700,
            whiteSpace: 'nowrap',
            textAlign: 'center'
            
          }}
        >
          Listen to Coaching Replays, Masterclasses&nbsp;&amp;&nbsp;Powerful Live Coaching Moments
        </Typography>
      </Box>

      {/* ─────────── Content BELOW the banner ─────────── */}
      <Box sx={{ maxWidth: '90rem', mx: 'auto', mt: 6, mb: 6, px: 2 }}>
        <Box
          sx={{
            borderRadius: 2,
            overflow: 'hidden',
            boxShadow: '0 .375rem 1.125rem rgba(0,0,0,0.4)', // 0 6px 18px
          }}
        >
          <iframe
            title="Reboot Podcast"
            width="100%"
            style={{ height: 'clamp(420px, 50vw, 420px)', display: 'block', border: 0 }}
            scrolling="no"
            src="https://share.transistor.fm/e/real-estate-reboot-coaching-private-tribe-podcast/playlist"
          />

        </Box>
      </Box>

      <Button
        component="a"
        href="https://subscribe.transistor.fm/shared_invite/CogGHmkX0IYZZ6DRM9EiMHplXXx6YebwAqBR"
        target="_blank"
        rel="noopener noreferrer"
        variant="contained"
        sx={{
          mt: '2rem',                 // 32px → rem
          px: '3rem',                 // 48px → rem
          py: '1rem',                 // 16px → rem
          borderRadius: '0.5rem',     // 8px → rem
          fontSize: '2.5rem',         // 40px → rem (big on purpose)
          fontWeight: 700,
          textTransform: 'uppercase',
          boxShadow: '0 .25rem .75rem rgba(0,0,0,0.25)', // 0 4px 12px
          backgroundColor: '#e70e17 !important',
          '&:hover': {
            backgroundColor: '#ff5555',
            transform: 'translateY(-2px) scale(1.03)',
          },
        }}
      >
        SUBSCRIBE
      </Button>

      <Typography sx={{ color: '#ffffff', fontWeight: 700, mt: 6, fontSize: '2rem' }}>
        NEVER MISS OUT AGAIN!
      </Typography>
    </section>
  );
}
