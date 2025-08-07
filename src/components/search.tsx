'use client';

import { Box, Typography } from '@mui/material';

export default function Search() {
  return (
    <section style={{ width: '100%', scrollSnapAlign: 'start' }}>
      {/* ─────────── Hero banner ─────────── */}
      <Box
  sx={{
    width: '100%',
    height: { xs: 300, md: 400 },
    backgroundImage: "url('/search-hero.png')",
    backgroundSize: 'cover',      // scale until the box is filled
    backgroundPosition: 'center', // crop top and bototm equally
    backgroundRepeat: 'no-repeat',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    px: 2,
  }}
>
        <Typography
          variant="h2"
          sx={{
            color: '#fff',
            fontWeight: 800,
            fontSize: { xs: '4rem', md: '8rem' },
            textAlign: 'center',
          }}
        >
          REBOOT SEARCH ENGINE
        </Typography>
      </Box>

      {/* ─────────── Green panel ─────────── */}
      <Box
        sx={{
          bgcolor: '#5cbca8',
          pt: 6,
          pb: 10,
          px: { xs: 2, md: 6 },
          textAlign: 'center',
        }}
      >
        {/* Sub-heading */}
        <Typography
          variant="h6"
          sx={{
            color: '#fff',
            fontWeight: 700,
            mb: 3,
            fontSize: { xs: '1rem', md: '1.25rem' },
          }}
        >
          Type any keyword to find related reboot resources, tools &amp; Training
        </Typography>

        {/* Search bar mock */}
        <Box
          sx={{
            maxWidth: 800,
            mx: 'auto',
            position: 'relative',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              bgcolor: '#fff',
              borderRadius: 50,
              px: 3,
              py: { xs: 1.5, md: 2 },
              boxShadow: '0 3px 8px rgba(0,0,0,0.15)',
            }}
          >
            <span style={{ fontSize: 24, marginRight: 12, color: '#666' }}>🔍</span>
            <input
              disabled
              placeholder="Search…"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: 18,
                background: 'transparent',
              }}
            />
          </Box>

          <Box
            component="img"
            src="/Website Arrow 2.png"
            alt="Arrow"
            sx={{
              position: 'absolute',
              top: -50,
              right: -80,
              height: 100,
              pointerEvents: 'none',
            }}
          />

        </Box>

        {/* Results placeholder list */}
        <Box
          sx={{
            maxWidth: 800,
            mx: 'auto',
            mt: 4,
            bgcolor: '#fff',
            borderRadius: 3,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            maxHeight: 380,
            overflowY: 'auto',
          }}
        >
          {[
            'Hiring Your First Assistant',
            'Second Part-Time Hire',
            'Part-Time Assistant Hired',
            'Ep 4 – Hiring a new Assistant [Coaching Replay]',
            'Ep 9 – Hiring an Assistant & Choosing between two candidates [Coaching Replay]',
            'Ep 12 – Hiring an Assistant – Should you hire full time & Should you overpay [Coaching Replay]',
          ].map((text, i) => (
            <Box
              key={i}
              sx={{
                px: 2.5,
                py: 1.5,
                borderBottom: i === 5 ? 'none' : '1px solid #e0e0e0',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                bgcolor: i % 2 ? '#f7f7f7' : '#eaeaea',
              }}
            >
              <span style={{ fontSize: 20 }}>📄</span>
              <Typography sx={{ fontWeight: 500, fontSize: 15, textAlign: 'left' }}>
                {text}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </section>
  );
}
