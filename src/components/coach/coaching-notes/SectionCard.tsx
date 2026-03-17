'use client';

import type { ReactNode } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';

type SectionCardProps = {
  icon: ReactNode;
  title: string;
  children: ReactNode;
};

export default function SectionCard({ icon, title, children }: SectionCardProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        border: '1px solid',
        borderColor: 'grey.200',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1.5,
            background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
        >
          {icon}
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18 }}>
          {title}
        </Typography>
      </Stack>

      {children}
    </Paper>
  );
}
