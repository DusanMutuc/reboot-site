'use client';

import { ThemeProvider } from '@mui/material/styles';
import GlobalStyles from '@mui/material/GlobalStyles';
import homeTheme, { brand } from '@/lib/homeTheme';

/**
 * Scopes the rebuilt home theme to its own route subtree.
 *
 * The root layout applies the legacy theme, whose CssBaseline writes
 * `html { font-size: 9.6px }`. This registry mounts after it, so these rules
 * win for equal specificity and restore a conventional 16px root. Sizes in
 * `homeTheme` are px-based regardless, so this is a correctness safeguard for
 * MUI internals rather than something the layout depends on.
 */
export default function HomeThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={homeTheme}>
      <GlobalStyles
        styles={{
          // globals.css sets `overflow-x: hidden` on html/body for the legacy
          // pages. That forces overflow-y to compute as `auto`, turning them
          // into scroll containers and breaking `position: sticky` for every
          // descendant. These routes have no horizontal overflow, so restoring
          // `visible` here is safe and lets the sticky bar actually pin.
          'html, body': { overflowX: 'visible' },
          html: { fontSize: '16px' },
          body: {
            fontFamily: '"Poppins", "Helvetica Neue", Arial, sans-serif',
            backgroundColor: brand.page,
            color: brand.ink,
            WebkitFontSmoothing: 'antialiased',
          },
          // Self-contained rather than inheriting the anchor reset from
          // globals.css: this subtree owns its own baseline.
          a: { color: 'inherit', textDecoration: 'none' },
          '@keyframes homeRise': {
            from: { opacity: 0, transform: 'translateY(10px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
          '@media (prefers-reduced-motion: reduce)': {
            '*': { animation: 'none !important', transition: 'none !important' },
          },
        }}
      />
      {children}
    </ThemeProvider>
  );
}
