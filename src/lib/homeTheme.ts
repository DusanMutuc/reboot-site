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

/**
 * Three tiers of colour, and the rule that keeps them apart.
 *
 * The surface has one saturated hue doing every job at once, which is why it
 * reads as quiet: turquoise marks what you can click, what you have finished,
 * and what the brand is, so none of those three readings is distinct. Red from
 * the logo gives the brand its own register — but only if it is held to one
 * job, because a red interface reads as an alarmed interface.
 *
 *   1  BRAND (red)        identity and structure, and only ever as a field:
 *                         a full-bleed band that owns a whole zone, with the
 *                         rosette in it. Never a rule, an edge or a trim —
 *                         red along a border reads as an artifact of the
 *                         surface above it rather than as a decision, and a
 *                         4px strip on a card is the house style of every
 *                         dashboard template ever shipped. Never interactive,
 *                         never attached to a value.
 *   2  SIGNAL (turquoise) interaction and affirmation. Buttons, links, hover,
 *                         done-states, progress fills, active chips. Unchanged.
 *   3  STATUS (pos/neg)   reserved. Deltas and the green/amber/red member
 *                         status this business already runs on.
 *
 * The load-bearing rule is tier 1 versus tier 3. `negative` (#c0492f) and the
 * coach-side "Red — Emergency" chip mean *something is wrong*, and that
 * reading is not something a design system gets to opt out of. So brand red is
 * only ever used where there is no data to misread — the two full-bleed bands
 * that frame the page and nothing else. It never tints a metric, a progress
 * element, or a card interior.
 *
 * What keeps red and turquoise from vibrating — they sit near-opposite on the
 * wheel (~0 and ~168 degrees) — is that they are never adjacent at similar
 * value or area. Red appears as a dark field carrying white type; turquoise
 * appears small on light neutral ground; a neutral zone always separates them.
 * Deep low-lightness red reads as authority, where the bright high-chroma red
 * of an alert only reads that way as a small mark on a light surface.
 */
export const brand = {
  turquoise: '#5cbca8',
  turquoiseDark: '#489c8a',
  turquoiseDeep: '#2f7767',
  turquoiseTint: '#eaf6f3',

  /**
   * Both reds are sampled from `Reboot Logo - Color.png`. Contrast is against
   * white unless noted.
   */
  /** The logo's darker red. 7.60:1 — safe for text at any size. */
  red: '#a22021',
  /** The logo's brighter red. 4.49:1 — large text, fills and marks only. */
  redBright: '#db2129',
  /** A field to set white type on. 10.24:1 with white. */
  redDeep: '#7e1a1b',
  /** The far end of a gradient, so a large band has depth. 13.30:1 with white. */
  redShadow: '#5e1314',

  ink: '#16211f',
  inkSoft: '#5b6a67',
  inkMuted: '#5f6d6a',
  slate: '#2a2a2a',
  slateSoft: '#3c4240',
  page: '#f6f8f7',
  card: '#ffffff',
  border: '#e2e9e7',
  borderStrong: '#cbd6d3',
  /**
   * Outline for a shape that carries meaning on its own — the "missed" block
   * in the attendance row. `borderStrong` is 1.49:1 on white, which is fine
   * for a decorative edge but fails WCAG 1.4.11's 3:1 for non-text UI. This
   * clears it at 3.03:1.
   */
  borderMuted: '#8a9794',
  positive: '#2f8f5b',
  negative: '#c0492f',
} as const;

/**
 * Candidate surfaces for the content half of the page. The page background is
 * `brand.page` (#f6f8f7); each of these is a step down from it, so the content
 * zone reads as a distinct surface and the white cards sitting on it gain
 * definition rather than losing it.
 */
export const contentSurfaces = {
  /** No tint at all — tests whether the banner alone carries the separation. */
  none: '#f6f8f7',
  soft: '#eef2f1',
  neutral: '#e8eeec',
  deep: '#e0e8e6',
  tint: '#eaf6f3',
} as const;

export type ContentSurface = keyof typeof contentSurfaces;

export const HOME_MAX_WIDTH = 1180;

/** One radius for every card. Padding still varies by role — a hero card
 *  earns more air — but the corner never does. */
export const CARD_RADIUS = '14px';
export const HOME_GUTTER = { xs: 20, md: 32 } as const;

declare module '@mui/material/styles' {
  interface TypographyVariants {
    slabTitle: React.CSSProperties;
    sectionLabel: React.CSSProperties;
    eyebrow: React.CSSProperties;
    kicker: React.CSSProperties;
    cardTitle: React.CSSProperties;
    metricValue: React.CSSProperties;
    metricLabel: React.CSSProperties;
    meta: React.CSSProperties;
  }

  interface TypographyVariantsOptions {
    slabTitle?: React.CSSProperties;
    sectionLabel?: React.CSSProperties;
    eyebrow?: React.CSSProperties;
    kicker?: React.CSSProperties;
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
    eyebrow: true;
    kicker: true;
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
    // League Spartan is the brand's voice and it is meant to be loud. These sit
    // well above the body scale without returning to the legacy 6:1 ratio.
    slabTitle: {
      fontFamily: DISPLAY_FONT_FAMILY,
      fontSize: 38,
      lineHeight: 1.06,
      fontWeight: 700,
      letterSpacing: '-0.015em',
    },
    sectionLabel: {
      fontFamily: DISPLAY_FONT_FAMILY,
      fontSize: 25,
      lineHeight: 1.1,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.035em',
    },
    /**
     * The two label tokens. Every uppercase label on this surface is one of
     * these: `eyebrow` names a section or card, `kicker` tags an item inside
     * one. Colour still varies by context, but size, weight and tracking do
     * not — nine hand-tuned variants is what made the surface read as drift.
     */
    eyebrow: {
      fontFamily: DISPLAY_FONT_FAMILY,
      fontSize: 12,
      lineHeight: 1.2,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
    },
    kicker: {
      fontFamily: BODY_FONT_FAMILY,
      fontSize: 11,
      lineHeight: 1.2,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.09em',
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
    meta: { fontFamily: BODY_FONT_FAMILY, fontSize: 14, lineHeight: 1.45, fontWeight: 400 },
    body1: { fontFamily: BODY_FONT_FAMILY, fontSize: 16, lineHeight: 1.55 },
    body2: { fontFamily: BODY_FONT_FAMILY, fontSize: 15, lineHeight: 1.5 },
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
          fontSize: 16,
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
