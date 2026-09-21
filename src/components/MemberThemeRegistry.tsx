'use client';

import type { ReactNode } from 'react';
import GlobalStyles from '@mui/material/GlobalStyles';
import { ThemeProvider } from '@mui/material/styles';
import memberTheme from '@/lib/memberTheme';
import { brand } from '@/lib/homeTheme';

/** Restores the approved Home scale for member-only route subtrees. */
export default function MemberThemeRegistry({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={memberTheme}>
      <GlobalStyles
        styles={{
          'html, body': { overflowX: 'visible' },
          html: { fontSize: '16px' },
          body: {
            fontFamily: '"Poppins", "Helvetica Neue", Arial, sans-serif',
            backgroundColor: brand.page,
            color: brand.ink,
            WebkitFontSmoothing: 'antialiased',
          },
          a: { color: 'inherit', textDecoration: 'none' },
          '@media (prefers-reduced-motion: reduce)': {
            '*': { animation: 'none !important', transition: 'none !important' },
          },
        }}
      />
      {children}
    </ThemeProvider>
  );
}
