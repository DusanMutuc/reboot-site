'use client';

import { Box, Typography } from '@mui/material';

export default function Search() {
  return (
    <section style={{ width: '100%', scrollSnapAlign: 'start' }}>
      {/* ─────────── Hero banner ─────────── */}
      <Box
        sx={{
          width: '100%',
          height: { xs: '18.75rem', md: '25rem' }, // 300 / 400px
          backgroundImage: "url('/search-hero.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
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
            fontSize: { xs: 'clamp(2.5rem, 10vw, 4rem)', md: 'clamp(4rem, 6vw, 8rem)' },
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
            fontSize: { xs: '1.75rem', md: '2.5rem' }, // bigger for readability
          }}
        >
          Type any keyword to find related reboot resources, tools &amp; training
        </Typography>

        {/* Search bar mock */}
        <Box
          sx={{
            maxWidth: '90rem', // 800px
            mx: 'auto',
            position: 'relative',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              bgcolor: '#fff',
              borderRadius: '3.125rem', // 50px
              px: '1.5rem', // 24px
              py: { xs: '0.75rem', md: '1rem' }, // 12 / 16px
              boxShadow: '0 .1875rem .5rem rgba(0,0,0,0.15)', // 0 3px 8px
            }}
          >
            <span style={{ fontSize: '2rem', marginRight: '0.75rem', color: '#666' }}>🔍</span>
            <input
              disabled
              placeholder="Search…"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: '1.5rem', // 18px
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
              top: '-3.125rem', // 50px
              right: '-5rem', // 80px
              height: '6.25rem', // 100px
              pointerEvents: 'none',
            }}
          />
        </Box>

        {/* Placeholder box for results */}
        <Box
          sx={{
            maxWidth: '90rem', // 800px
            mx: 'auto',
            mt: 4,
            bgcolor: '#fff',
            borderRadius: 3,
            boxShadow: '0 .25rem .75rem rgba(0,0,0,0.2)',
            height: '36rem', // 380px → original height
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography sx={{ fontWeight: 600, fontSize: '5rem', color: '#333' }}>
            Coming soon…
          </Typography>
        </Box>
      </Box>
    </section>
  );
}
