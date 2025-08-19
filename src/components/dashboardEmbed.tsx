'use client';

import { Box, Typography, Button, Stack } from '@mui/material';
import { useRef, useCallback } from 'react';

type Props = {
  src: string;
  heroImage?: string;
  title?: string;
};

export default function DashboardEmbed({
  src,
  heroImage = '/graph.png',
  title = 'YOUR M2 TRACKER',
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const handleIframeLoad = useCallback(() => {
    // If the iframe grabbed focus, drop it and restore where we were.
    iframeRef.current?.blur();
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const goFullscreen = () => {
    const el = wrapperRef.current;
    if (!el) return;
    const req =
      el.requestFullscreen ||
      // Safari
      (el as any).webkitRequestFullscreen ||
      (el as any).msRequestFullscreen;
    if (req) req.call(el);
  };

  return (
    <section style={{ width: '100%', scrollSnapAlign: 'start' }}>
      {/* ── Hero banner ────────────────────────── */}
      <Box
        sx={{
          width: '100%',
          height: { xs: '14rem', md: '25rem' }, // slightly shorter on phones
          backgroundImage: `url('${heroImage}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
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
            fontSize: { xs: 'clamp(2rem, 8.5vw, 3rem)', md: 'clamp(4rem, 6vw, 8rem)' },
          }}
        >
          {title}
        </Typography>
      </Box>

      {/* ── Mobile controls (helpful on phones) ───────────────────── */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          display: { xs: 'flex', md: 'none' },
          justifyContent: 'center',
          alignItems: 'center',
          mt: 2,
          mb: 1,
          px: 2,
        }}
      >
        <Button size="small" variant="contained" onClick={goFullscreen}>
          Full screen
        </Button>
        <Button
          size="small"
          variant="outlined"
          component="a"
          href={src}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in new tab
        </Button>
      </Stack>

      {/* ── Dashboard iframe ───────────────────── */}
      <Box
        ref={wrapperRef}
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          background: '#2a2a2a',
          p: { xs: 0, md: '2.5rem' }, // no padding on phones; same look on desktop
        }}
      >
        {/* Portrait overlay hint (phones only). Hidden in landscape. */}
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' },
            alignItems: 'center',
            justifyContent: 'center',
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            '@media (orientation: landscape)': { display: 'none' },
          }}
        >
          <Box
            sx={{
              bgcolor: 'rgba(0,0,0,0.55)',
              color: '#fff',
              fontWeight: 700,
              px: 2,
              py: 1,
              borderRadius: 2,
              textAlign: 'center',
            }}
          >
            Best viewed in landscape • or use Full screen
          </Box>
        </Box>

        <iframe
          ref={iframeRef}
          tabIndex={-1}
          onLoad={handleIframeLoad}
          loading="lazy"
          width="100%"
          height="100%"
          src={src}
          frameBorder="0"
          style={{ display: 'block' }}
          // Fullscreen support:
          allow="fullscreen"
          allowFullScreen
          // Keep sandboxed, but allow scripts/same-origin as needed for LS:
          sandbox="allow-scripts allow-same-origin allow-storage-access-by-user-activation allow-popups allow-popups-to-escape-sandbox"
          title="M2 Dashboard"
        />
      </Box>
    </section>
  );
}
