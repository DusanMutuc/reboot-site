'use client';

import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import HomeThemeRegistry from '@/components/home/HomeThemeRegistry';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';
import CoachTopBar from './CoachTopBar';

export const COACH_MAX_WIDTH = HOME_MAX_WIDTH;

type Props = {
  children: ReactNode;
  coachName?: string;
  roleLabel?: string;
};

/** The coach hub shares the member redesign's theme without changing the meeting workspace. */
export default function CoachShell({ children, coachName, roleLabel }: Props) {
  return (
    <HomeThemeRegistry>
      <Box sx={{ minHeight: '100svh', bgcolor: brand.page }}>
        <CoachTopBar coachName={coachName} roleLabel={roleLabel} />
        {children}
      </Box>
    </HomeThemeRegistry>
  );
}
