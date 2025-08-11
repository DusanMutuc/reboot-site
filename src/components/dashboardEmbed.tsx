'use client';

import { Box, Typography } from '@mui/material';
import { useRef, useCallback, useMemo } from 'react';

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

  const handleIframeLoad = useCallback(() => {
    // If the iframe grabbed focus, drop it and restore where we were.
    iframeRef.current?.blur();
    // On first render you’re at the top — force back to top to prevent the jump.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  return (
    <section style={{ width: '100%', scrollSnapAlign: 'start' }}>
      {/* ── Hero banner ────────────────────────── */}
      <Box
        sx={{
          width: '100%',
          height: { xs: '18.75rem', md: '25rem' },
          backgroundImage: `url('${heroImage}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
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
          {title}
        </Typography>
      </Box>

      {/* ── Dashboard iframe ───────────────────── */}
      <div
        style={{
          width: '100%',
          aspectRatio: '16/9',
          background: '#2a2a2a',
          padding: '2.5rem',
        }}
      >
        <iframe
          ref={iframeRef}
          tabIndex={-1}                 // ← prevent auto-focus from causing a jump
          onLoad={handleIframeLoad}     // ← blur + restore scroll
          loading="lazy"                // ← optional: defer loading
          width="100%"
          height="100%"
          src={src}
          frameBorder="0"
          style={{ display: 'block' }}
          sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          title="M2 Dashboard"
        />
      </div>
    </section>
  );
}
