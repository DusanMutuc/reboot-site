import { createTheme } from '@mui/material/styles';

/**
 * Theme for the rebuilt member home experience.
 *
 * Deliberately independent of `src/lib/theme.ts`, which sets a 9.6px root font
 * size (SCALE = 0.6) for the original marketing sections. Every size here is
 * declared in px so this surface renders correctly regardless of the global
 * root font size. `HomeThemeRegistry` also restores a 16px root for MUI
 * internals that still reason in rem.
 */

const BODY_FONT_FAMILY = '"Poppins", "Helvetica Neue", Arial, sans-serif';
const DISPLAY_FONT_FAMILY = '"League Spartan", "Poppins", Arial, sans-serif';

export const brand = {
  turquoise: '#5cbca8',
  turquoiseDark: '#489c8a',
  turquoiseDeep: '#2f7767',
  turquoiseTint: '#eaf6f3',
  ink: '#16211f',
  inkSoft: '#5b6a67',
  inkMuted: '#8a9794',
  slate: '#2a2a2a',
  slateSoft: '#3c4240',
  page: '#f6f8f7',
  card: '#ffffff',
  border: '#e2e9e7',
  borderStrong: '#cbd6d3',
  positive: '#2f8f5b',
  negative: '#c0492f',
} as const;

export const HOME_MAX_WIDTH = 1180;
export const HOME_GUTTER = { xs: 20, md: 32 } as const;

declare module '@mui/material/styles' {
  interface TypographyVariants {
    slabTitle: React.CSSProperties;
    sectionLabel: React.CSSProperties;
    cardTitle: React.CSSProperties;
    metricValue: React.CSSProperties;
    metricLabel: React.CSSProperties;
    meta: React.CSSProperties;
  }

  interface TypographyVariantsOptions {
    slabTitle?: React.CSSProperties;
    sectionLabel?: React.CSSProperties;
    cardTitle?: React.CSSProperties;
    metricValue?: React.CSSProperties;
    metricLabel?: React.CSSProperties;
    meta?: React.CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    slabTitle: true;
    sectionLabel: true;
    cardTitle: true;
    metricValue: true;
    metricLabel: true;
    meta: true;
  }
}

const homeTheme = createTheme({
  palette: {
    primary: {
      main: brand.turquoise,
      dark: brand.turquoiseDark,
      light: brand.turquoiseTint,
      contrastText: brand.ink,
    },
    secondary: {
      main: brand.slate,
      light: brand.slateSoft,
      contrastText: '#ffffff',
    },
    background: { default: brand.page, paper: brand.card },
    text: { primary: brand.ink, secondary: brand.inkSoft, disabled: brand.inkMuted },
    divider: brand.border,
    success: { main: brand.positive },
    error: { main: brand.negative },
  },

  spacing: 8,
  shape: { borderRadius: 12 },

  typography: {
    htmlFontSize: 16,
    fontFamily: BODY_FONT_FAMILY,

    // Display: the brand voice. Uppercase League Spartan, used structurally.
    slabTitle: {
      fontFamily: DISPLAY_FONT_FAMILY,
      fontSize: 34,
      lineHeight: 1.08,
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    sectionLabel: {
      fontFamily: DISPLAY_FONT_FAMILY,
      fontSize: 19,
      lineHeight: 1.15,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    },
    metricValue: {
      fontFamily: DISPLAY_FONT_FAMILY,
      fontSize: 30,
      lineHeight: 1.05,
      fontWeight: 700,
      letterSpacing: '-0.015em',
    },

    // Body: Poppins, at sizes a 55-year-old agent can read without leaning in.
    cardTitle: { fontFamily: BODY_FONT_FAMILY, fontSize: 17, lineHeight: 1.35, fontWeight: 600 },
    metricLabel: { fontFamily: BODY_FONT_FAMILY, fontSize: 13, lineHeight: 1.3, fontWeight: 500 },
    meta: { fontFamily: BODY_FONT_FAMILY, fontSize: 13.5, lineHeight: 1.45, fontWeight: 400 },
    body1: { fontFamily: BODY_FONT_FAMILY, fontSize: 16, lineHeight: 1.55 },
    body2: { fontFamily: BODY_FONT_FAMILY, fontSize: 14.5, lineHeight: 1.5 },
    button: { fontFamily: BODY_FONT_FAMILY, fontSize: 15, fontWeight: 600, textTransform: 'none' },

    h1: { fontFamily: DISPLAY_FONT_FAMILY, fontSize: 40, fontWeight: 700, lineHeight: 1.1 },
    h2: { fontFamily: DISPLAY_FONT_FAMILY, fontSize: 30, fontWeight: 700, lineHeight: 1.15 },
    h3: { fontFamily: DISPLAY_FONT_FAMILY, fontSize: 24, fontWeight: 700, lineHeight: 1.2 },
  },

  components: {
    MuiButtonBase: {
      defaultProps: { disableRipple: false },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 10,
          paddingTop: 11,
          paddingBottom: 11,
          paddingLeft: 20,
          paddingRight: 20,
          minHeight: 46,
          boxShadow: 'none',
          transition: 'background-color .16s ease, border-color .16s ease, transform .16s ease',
          '&:active': { transform: 'translateY(1px)' },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: 'none',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: brand.card,
          fontSize: 15.5,
          '& fieldset': { borderColor: brand.border },
          '&:hover fieldset': { borderColor: brand.borderStrong },
          '&.Mui-focused fieldset': { borderColor: brand.turquoise, borderWidth: 2 },
        },
        input: { paddingTop: 13, paddingBottom: 13 },
      },
    },
  },
});

export default homeTheme;
