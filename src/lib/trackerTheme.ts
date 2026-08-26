import { createTheme } from '@mui/material/styles';
import baseTheme from '@/lib/theme';

const BODY_FONT_FAMILY = '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif';
const DISPLAY_FONT_FAMILY = '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif';

/** Compact theme scoped only to the editable KPI fields. */
const trackerTheme = createTheme(baseTheme, {
  spacing: (factor: number) => 6 * factor,
  shape: { borderRadius: 8 },
  typography: {
    htmlFontSize: 12,
    fontFamily: BODY_FONT_FAMILY,
    h3: { fontFamily: DISPLAY_FONT_FAMILY, fontSize: 20, fontWeight: 700, lineHeight: 1.2 },
    h4: { fontFamily: DISPLAY_FONT_FAMILY, fontSize: 20, fontWeight: 700, lineHeight: 1.2 },
    h5: { fontFamily: DISPLAY_FONT_FAMILY, fontSize: 18, fontWeight: 700, lineHeight: 1.2 },
    h6: { fontFamily: BODY_FONT_FAMILY, fontSize: 16, fontWeight: 600, lineHeight: 1.25 },
    subtitle1: { fontFamily: BODY_FONT_FAMILY, fontSize: 14, lineHeight: 1.45 },
    subtitle2: { fontFamily: BODY_FONT_FAMILY, fontSize: 13, lineHeight: 1.4 },
    body1: { fontFamily: BODY_FONT_FAMILY, fontSize: 14, lineHeight: 1.5 },
    body2: { fontFamily: BODY_FONT_FAMILY, fontSize: 13, lineHeight: 1.5 },
    caption: { fontFamily: BODY_FONT_FAMILY, fontSize: 12, lineHeight: 1.4 },
    button: {
      fontFamily: BODY_FONT_FAMILY,
      fontSize: 14,
      fontWeight: 600,
      textTransform: 'none',
    },
    metricLabelCompact: {
      fontFamily: BODY_FONT_FAMILY,
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1.25,
    },
    kpiTrackerMetricTitle: {
      fontFamily: BODY_FONT_FAMILY,
      fontSize: 15,
      fontWeight: 700,
      lineHeight: 1.25,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          minHeight: 40,
          padding: '9px 16px',
          fontSize: 14,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 8, fontSize: 14 },
      },
    },
  },
});

export default trackerTheme;
