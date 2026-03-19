'use client';

import { ThemeProvider } from '@mui/material';
import { adminTheme } from '@/lib/theme';

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={adminTheme}>
      {children}
    </ThemeProvider>
  );
}
