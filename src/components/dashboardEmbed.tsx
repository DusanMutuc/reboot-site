'use client';

import { Box, Typography } from '@mui/material';

type Props = {
  /** Looker Studio (or any) embed URL */
  src: string;

  /** Optional hero background image in /public */
  heroImage?: string;

  /** Optional heading text */
  title?: string;
};

/**
 * Hero banner  ➜  16 : 9 dashboard iframe.
 */
export default function DashboardEmbed({
  src,
  heroImage = '/m2-hero.jpg',         // TODO: drop real banner in /public
  title = 'YOUR M2 TRACKER',
}: Props) {
  return (
    <section style={{ width: '100%', scrollSnapAlign: 'start' }}>
      {/* ── Hero banner ────────────────────────── */}
      <Box
        sx={{
          width: '100%',
          height: { xs: 300, md: 400 },
          background: `url('/graph.png') center/cover`,
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
          {title}
        </Typography>
      </Box>

      {/* ── Dashboard iframe ───────────────────── */}
      <div style={{ width: '100%', aspectRatio: '16/9', background: '#2a2a2a', padding: 40 }}>
        <iframe
          width="100%"
          height="100%"
          src={src}
          frameBorder="0"
          sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          title="M2 Dashboard"
        />
      </div>
    </section>
  );
}
