'use client';

import { Box, Typography } from '@mui/material';

type Props = {
  heroImage?: string;
  title?: string;
};

export default function UserDashboardBanner({
  heroImage = '/graph.png',
  title = 'YOUR M2 TRACKER',
}: Props) {
  return (
    <Box
      sx={{
        width: '100%',
        height: { xs: '14rem', md: '25rem' },
        backgroundImage: `url('${heroImage}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        textAlign: 'center',
        mb: 3, // small gap before the rest of the dashboard
      }}
    >
      <Typography
        variant="h2"
        sx={{
          color: '#fff',
          fontWeight: 800,
          fontSize: {
            xs: 'clamp(2rem, 8.5vw, 3rem)',
            md: 'clamp(4rem, 6vw, 8rem)',
          },
        }}
      >
        {title}
      </Typography>
    </Box>
  );
}
