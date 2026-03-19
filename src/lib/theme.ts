import { createTheme } from '@mui/material/styles';

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
  }
  interface TypographyVariantsOptions {
    handwritten?: React.CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    handwritten: true;
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

/** ── GLOBAL SIZE KNOB ───────────────────────────── */
const SCALE = 0.6;                            // <— tweak this to shrink/grow the whole UI
const ROOT_REM_PX = 20 * SCALE;                // what 1rem equals (in px) for your app
const SPACING_BASE = 8 * SCALE;                // theme.spacing() base
const RADIUS_BASE = 8 * SCALE;                 // theme.shape.borderRadius

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

  /** Make rem + theme.spacing scale */
  typography: {
    htmlFontSize: ROOT_REM_PX,   // drives MUI’s pxToRem
    fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif', fontWeight: 700, fontSize: '3rem', lineHeight: 1.2 },
    h2: { fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif', fontWeight: 600, fontSize: '2.5rem', lineHeight: 1.2 },
    h3: { fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif', fontWeight: 600, fontSize: '2rem', lineHeight: 1.2 },
    h4: { fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif', fontWeight: 600, fontSize: '1.75rem', lineHeight: 1.2 },
    h5: { fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif', fontWeight: 600, fontSize: '1.5rem', lineHeight: 1.2 },
    h6: { fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif', fontWeight: 600, fontSize: '1.25rem', lineHeight: 1.2 },
    body1: { fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif', fontSize: '1rem', lineHeight: 1.5 },
    body2: { fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif', fontSize: '0.875rem', lineHeight: 1.5 },
    button: { fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif', fontWeight: 600, textTransform: 'none' },
    caption: { fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif', fontSize: '0.75rem', lineHeight: 1.5 },
    overline: { fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' },
    handwritten: { fontFamily: '"Permanent Marker", "cursive", "Roboto", "Helvetica", "Arial", sans-serif', fontSize: '1.1rem', lineHeight: 1.4, fontWeight: 400 },
  },

  /** Make theme.spacing() scale */
  spacing: (factor: number) => SPACING_BASE * factor,

  /** Make default radius scale */
  shape: { borderRadius: RADIUS_BASE },

  components: {
    /** Sync the browser root so *plain* CSS rem also scales */
    MuiCssBaseline: {
      styleOverrides: {
        html: { fontSize: `${ROOT_REM_PX}px` },  // ensures 1rem == ROOT_REM_PX everywhere
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,         // already scales via shape.borderRadius above
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
      styleOverrides: { root: { borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' } },
    },

    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 12 } },
    },
  },
});

const ADMIN_ROOT_REM_PX = 20; // 14.4px for admin/coach pages

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
