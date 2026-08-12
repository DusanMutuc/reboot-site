'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import { brand } from '@/lib/homeTheme';
import type { CallStatus } from './types';

const VERSIONS = [
  { path: '/home', label: 'Separate destinations' },
  { path: '/home/onepage', label: 'One-pager' },
];

const STATES: Array<{ key: CallStatus; label: string }> = [
  { key: 'imminent', label: 'Call starting soon' },
  { key: 'booked', label: 'Booked, further out' },
  { key: 'none', label: 'Nothing booked' },
];

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box
      component={Link}
      href={href}
      sx={{
        fontSize: 12.5,
        fontWeight: active ? 600 : 400,
        px: 1.25,
        py: 0.5,
        borderRadius: '6px',
        border: `1px solid ${active ? brand.turquoise : brand.border}`,
        bgcolor: active ? brand.turquoiseTint : 'transparent',
        color: active ? brand.turquoiseDeep : brand.inkSoft,
        whiteSpace: 'nowrap',
        '&:hover': { borderColor: brand.turquoise },
      }}
    >
      {children}
    </Box>
  );
}

/** Review-only affordance. Remove before this ships to members. */
export default function CompareStrip({
  currentPath,
  status,
}: {
  currentPath: string;
  status: CallStatus;
}) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: '10px',
        border: `1px dashed ${brand.borderStrong}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
        <Typography sx={{ fontSize: 12.5, color: brand.inkMuted, minWidth: 96 }}>
          Layout version
        </Typography>
        {VERSIONS.map((version) => (
          <Chip
            key={version.path}
            href={`${version.path}?state=${status}`}
            active={version.path === currentPath}
          >
            {version.label}
          </Chip>
        ))}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
        <Typography sx={{ fontSize: 12.5, color: brand.inkMuted, minWidth: 96 }}>
          Call band state
        </Typography>
        {STATES.map((state) => (
          <Chip
            key={state.key}
            href={`${currentPath}?state=${state.key}`}
            active={state.key === status}
          >
            {state.label}
          </Chip>
        ))}
      </Box>
    </Box>
  );
}
