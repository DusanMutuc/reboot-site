import { createTheme } from '@mui/material/styles';

const BODY_FONT_FAMILY = '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif';
const DISPLAY_FONT_FAMILY = '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif';

export const adminCompactTextSx = {
  fontSize: '0.75rem',
  lineHeight: 1.2,
} as const;

export const adminCompactLabelSx = {
  ...adminCompactTextSx,
  fontWeight: 600,
} as const;

export const adminCompactStrongSx = {
  ...adminCompactTextSx,
  fontWeight: 700,
} as const;

declare module '@mui/material/styles' {
  interface Palette {
    turquoise: Palette['primary'];
    gray: Palette['primary'];
    pastelCyan: Palette['primary'];
  }

  interface PaletteOptions {
    turquoise?: PaletteOptions['primary'];
    gray?: PaletteOptions['primary'];
    pastelCyan?: PaletteOptions['primary'];
  }

  interface TypographyVariants {
    handwritten: React.CSSProperties;
    adminPageTitle: React.CSSProperties;
    adminSectionTitle: React.CSSProperties;
    adminMetric: React.CSSProperties;
    adminEyebrow: React.CSSProperties;
    metricLabelCompact: React.CSSProperties;
    kpiTrackerMetricTitle: React.CSSProperties;
  }

  interface TypographyVariantsOptions {
    handwritten?: React.CSSProperties;
    adminPageTitle?: React.CSSProperties;
    adminSectionTitle?: React.CSSProperties;
    adminMetric?: React.CSSProperties;
    adminEyebrow?: React.CSSProperties;
    metricLabelCompact?: React.CSSProperties;
    kpiTrackerMetricTitle?: React.CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    handwritten: true;
    adminPageTitle: true;
    adminSectionTitle: true;
    adminMetric: true;
    adminEyebrow: true;
    metricLabelCompact: true;
    kpiTrackerMetricTitle: true;
  }
}

declare module '@mui/material/Button' {
  interface ButtonPropsColorOverrides {
    turquoise: true;
    gray: true;
    pastelCyan: true;
  }
}

declare module '@mui/material/TextField' {
  interface TextFieldPropsColorOverrides {
    turquoise: true;
    gray: true;
    pastelCyan: true;
  }
}

const SCALE = 0.6;
const ROOT_REM_PX = 16 * SCALE;
const SPACING_BASE = 8 * SCALE;
const RADIUS_BASE = 8 * SCALE;

const theme = createTheme({
  palette: {
    primary: { main: '#5cbca8', light: '#7dc8b8', dark: '#4a9a8a', contrastText: '#ffffff' },
    secondary: { main: '#2a2a2a', light: '#4a4a4a', dark: '#1a1a1a', contrastText: '#ffffff' },
    turquoise: { main: '#5cbca8', light: '#7dc8b8', dark: '#4a9a8a', contrastText: '#ffffff' },
    gray: { main: '#2a2a2a', light: '#4a4a4a', dark: '#1a1a1a', contrastText: '#ffffff' },
    pastelCyan: { main: '#99d9d9', light: '#b3e3e3', dark: '#7ac7c7', contrastText: '#2a2a2a' },
    background: { default: '#ffffff', paper: '#ffffff' },
    text: { primary: '#2a2a2a', secondary: '#666666' },
  },
  typography: {
    htmlFontSize: ROOT_REM_PX,
    fontFamily: BODY_FONT_FAMILY,
    h1: { fontFamily: DISPLAY_FONT_FAMILY, fontWeight: 700, fontSize: '3rem', lineHeight: 1.2 },
    h2: { fontFamily: DISPLAY_FONT_FAMILY, fontWeight: 600, fontSize: '2.5rem', lineHeight: 1.2 },
    h3: { fontFamily: DISPLAY_FONT_FAMILY, fontWeight: 600, fontSize: '2rem', lineHeight: 1.2 },
    h4: { fontFamily: DISPLAY_FONT_FAMILY, fontWeight: 600, fontSize: '1.75rem', lineHeight: 1.2 },
    h5: { fontFamily: DISPLAY_FONT_FAMILY, fontWeight: 600, fontSize: '1.5rem', lineHeight: 1.2 },
    h6: { fontFamily: BODY_FONT_FAMILY, fontWeight: 600, fontSize: '1.25rem', lineHeight: 1.2 },
    body1: { fontFamily: BODY_FONT_FAMILY, fontSize: '1rem', lineHeight: 1.5 },
    body2: { fontFamily: BODY_FONT_FAMILY, fontSize: '0.875rem', lineHeight: 1.5 },
    button: { fontFamily: BODY_FONT_FAMILY, fontWeight: 600, textTransform: 'none' },
    caption: { fontFamily: BODY_FONT_FAMILY, fontSize: '0.75rem', lineHeight: 1.5 },
    overline: {
      fontFamily: BODY_FONT_FAMILY,
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
    },
    handwritten: {
      fontFamily: '"Permanent Marker", "cursive", "Roboto", "Helvetica", "Arial", sans-serif',
      fontSize: '1.1rem',
      lineHeight: 1.4,
      fontWeight: 400,
    },
    adminPageTitle: {
      fontFamily: DISPLAY_FONT_FAMILY,
      fontWeight: 700,
      fontSize: '1.75rem',
      lineHeight: 1.2,
    },
    adminSectionTitle: {
      fontFamily: BODY_FONT_FAMILY,
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.3,
    },
    adminMetric: {
      fontFamily: DISPLAY_FONT_FAMILY,
      fontWeight: 700,
      fontSize: '1.5rem',
      lineHeight: 1.2,
    },
    adminEyebrow: {
      fontFamily: BODY_FONT_FAMILY,
      fontSize: '0.75rem',
      fontWeight: 600,
      lineHeight: 1.3,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
    },
    metricLabelCompact: {
      fontFamily: BODY_FONT_FAMILY,
      fontSize: '0.82rem',
      fontWeight: 600,
      lineHeight: 1.2,
    },
    kpiTrackerMetricTitle: {
      fontFamily: BODY_FONT_FAMILY,
      fontSize: '1.05rem',
      fontWeight: 700,
      lineHeight: 1.2,
    },
  },
  spacing: (factor: number) => SPACING_BASE * factor,
  shape: { borderRadius: RADIUS_BASE },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { fontSize: `${ROOT_REM_PX}px` },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '12px 24px',
          fontSize: '1rem',
          fontWeight: 600,
          textTransform: 'none',
          boxShadow: 'none',
          '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' },
        },
        contained: {
          '&.MuiButton-containedPrimary': {
            backgroundColor: '#5cbca8',
            color: '#ffffff',
            '&:hover': { backgroundColor: '#4a9a8a' },
          },
          '&.MuiButton-containedSecondary': {
            backgroundColor: '#2a2a2a',
            color: '#ffffff',
            '&:hover': { backgroundColor: '#1a1a1a' },
          },
        },
        outlined: {
          '&.MuiButton-outlinedPrimary': {
            borderColor: '#5cbca8',
            color: '#5cbca8',
            '&:hover': { backgroundColor: 'rgba(92, 188, 168, 0.08)' },
          },
        },
        text: {
          '&.MuiButton-textPrimary': {
            color: '#5cbca8',
            '&:hover': { backgroundColor: 'rgba(92, 188, 168, 0.08)' },
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            '& fieldset': { borderColor: '#e0e0e0' },
            '&:hover fieldset': { borderColor: '#5cbca8' },
            '&.Mui-focused fieldset': { borderColor: '#5cbca8' },
          },
          '& .MuiInputLabel-root': {
            '&.Mui-focused': { color: '#5cbca8' },
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 12 },
      },
    },
  },
});

const ADMIN_ROOT_REM_PX = 24 * SCALE;

export const adminTheme = createTheme(theme, {
  typography: {
    htmlFontSize: ADMIN_ROOT_REM_PX,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { fontSize: `${ADMIN_ROOT_REM_PX}px` },
      },
    },
  },
});

export default theme;
