'use client';

import { Box, Typography, InputBase } from '@mui/material';

export default function Search() {
  return (
    <section style={{ width: '100%', scrollSnapAlign: 'start' }}>
      {/* ─────────── Hero banner ─────────── */}
      <Box
        sx={{
          width: '100%',
          height: { xs: '20rem', md: '30rem' },
          backgroundImage: "url('/search-hero.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 2,
          textAlign: 'center',
        }}
      >
        <Typography
          variant="h2"
          sx={{
            color: '#fff',
            fontWeight: 800,
            fontSize: { xs: 'clamp(2rem, 8vw, 3rem)', md: 'clamp(3.5rem, 6vw, 8rem)' },
          }}
        >
          REBOOT SEARCH ENGINE
        </Typography>
      </Box>

      {/* ─────────── Green panel ─────────── */}
      <Box
        sx={{
          bgcolor: '#5cbca8',
          pt: { xs: 4, md: 6 },
          pb: { xs: 6, md: 10 },
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
            fontSize: { xs: '1.25rem', md: '2rem' },
            maxWidth: '38ch',
            mx: 'auto',
            // removed textWrap: 'balance' to satisfy lint/TS
          }}
        >
          Type any keyword to find related Reboot resources, tools &amp; training
        </Typography>

        {/* Search bar mock (readOnly, touch-sized) */}
        <Box sx={{ maxWidth: '56rem', mx: 'auto', position: 'relative' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              bgcolor: '#fff',
              borderRadius: '3.125rem',
              px: { xs: '1rem', md: '1.5rem' },
              py: 0,
              minHeight: { xs: 48, md: 56 },
              boxShadow: '0 .1875rem .5rem rgba(0,0,0,0.15)',
              gap: 1,
            }}
          >
            <span aria-hidden style={{ fontSize: '1.5rem', marginRight: '0.5rem', color: '#666' }}>
              🔍
            </span>

            <InputBase
              inputProps={{ readOnly: true, 'aria-label': 'Search', role: 'searchbox' }}
              placeholder="Search…"
              sx={{ flex: 1, fontSize: { xs: '1rem', md: '1.25rem' } }}
            />
          </Box>

          <Box
            component="img"
            src="/Website Arrow 2.png"
            alt=""
            sx={{
              display: { xs: 'none', md: 'block' },
              position: 'absolute',
              top: '-3.125rem',
              right: '-5rem',
              height: '6.25rem',
              pointerEvents: 'none',
            }}
          />
        </Box>

        {/* Placeholder box for results (responsive) */}
        <Box
          sx={{
            maxWidth: '56rem',
            mx: 'auto',
            mt: 4,
            bgcolor: '#fff',
            borderRadius: 3,
            boxShadow: '0 .25rem .75rem rgba(0,0,0,0.2)',
            minHeight: { xs: '12rem', md: '18rem', lg: '24rem' },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 2,
            textAlign: 'center',
          }}
        >
          <Typography
            sx={{
              fontWeight: 600,
              color: '#333',
              fontSize: { xs: 'clamp(1.25rem, 5vw, 2rem)', md: 'clamp(2rem, 3.5vw, 3rem)' },
            }}
          >
            Coming soon…
          </Typography>
        </Box>
      </Box>
    </section>
  );
}
