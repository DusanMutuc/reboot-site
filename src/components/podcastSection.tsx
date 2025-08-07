'use client';

import { Box, Typography } from '@mui/material';

/* button style */
const subscribeBtn: React.CSSProperties = {
  marginTop: 32,
  backgroundColor: '#ff2b2b',
  color: '#ffffff',
  border: 'none',
  padding: '16px 48px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 40,
  fontWeight: 700,
  fontFamily: "'Poppins', sans-serif",
  textTransform: 'uppercase',
  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
  transition: 'transform 0.2s ease, background-color 0.2s ease',
};

export default function PodcastSection() {
  return (
    <section
      style={{
        width: '100%',
        backgroundColor: '#000',
        paddingBottom: 50,          // only bottom padding here
        textAlign: 'center',
      }}
    >
      {/* ─────────── Hero banner (edge-to-edge) ─────────── */}
      <Box
        sx={{
          width: '100%',
          height: { xs: 300, md: 400 },
          backgroundImage: "url('/podcast-hero.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundColor: '#000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: 2,                    // small inner padding for text
        }}
      >
        <Typography variant="h2" sx={{ fontWeight: 800, color: '#fff', mb: 1, fontSize: { xs: '4rem', md: '8rem' } }}>
          PRIVATE PODCAST
        </Typography>

        <Typography variant="subtitle1" sx={{ color: '#fff', fontSize: { xs: '0.9rem', md: '1.3rem' }, maxWidth: 720 }}>
          Listen to Coaching Replays, Masterclasses&nbsp;&amp;&nbsp;Powerful Live Coaching Moments
        </Typography>
      </Box>

      {/* ─────────── Content BELOW the banner ─────────── */}
      <Box sx={{ maxWidth: 1000, mx: 'auto', mt: 6, mb: 6, px: 2 }}>
        <Box
          sx={{
            borderRadius: 2,
            overflow: 'hidden',
            boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
          }}
        >
          <iframe
            title="Reboot Podcast"
            width="100%"
            height="500"
            frameBorder="0"
            scrolling="no"
            seamless
            src="https://share.transistor.fm/e/real-estate-reboot-coaching-private-tribe-podcast/playlist"
          />
        </Box>
      </Box>

      <a
        href="https://subscribe.transistor.fm/shared_invite/CogGHmkX0IYZZ6DRM9EiMHplXXx6YebwAqBR"
        target="_blank"
        rel="noopener noreferrer"
        style={subscribeBtn}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)';
          e.currentTarget.style.backgroundColor = '#ff5555';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.backgroundColor = '#ff2b2b';
        }}
      >
        SUBSCRIBE
      </a>

      <Typography sx={{ color: '#ffffff', fontWeight: 700, mt: 6, fontSize: '1.3rem',  }}>
        NEVER MISS OUT AGAIN!
      </Typography>
    </section>
  );
}
