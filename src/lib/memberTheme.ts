import { createTheme } from '@mui/material/styles';
import homeTheme from '@/lib/homeTheme';

const BODY_FONT_FAMILY = '"Poppins", "Helvetica Neue", Arial, sans-serif';
const DISPLAY_FONT_FAMILY = '"League Spartan", "Poppins", Arial, sans-serif';

/**
 * Shared theme for the member experience outside the rebuilt home route.
 *
 * It inherits the approved Home palette, spacing, controls and 16px reading
 * scale, then fills in the heading and custom typography variants used by the
 * older member screens. Keeping this separate from the legacy root theme
 * prevents the scale change from leaking into admin, coach and public pages.
 */
const memberTheme = createTheme(homeTheme, {
  typography: {
    h4: {
      fontFamily: DISPLAY_FONT_FAMILY,
      fontSize: 24,
      fontWeight: 700,
      lineHeight: 1.2,
    },
    h5: {
      fontFamily: DISPLAY_FONT_FAMILY,
      fontSize: 21,
      fontWeight: 700,
      lineHeight: 1.2,
    },
    h6: {
      fontFamily: BODY_FONT_FAMILY,
      fontSize: 19,
      fontWeight: 600,
      lineHeight: 1.25,
    },
    caption: {
      fontFamily: BODY_FONT_FAMILY,
      fontSize: 13,
      lineHeight: 1.45,
    },
    overline: {
      fontFamily: BODY_FONT_FAMILY,
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1.4,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
    },
    metricLabelCompact: {
      fontFamily: BODY_FONT_FAMILY,
      fontSize: 13,
      fontWeight: 600,
      lineHeight: 1.25,
    },
    kpiTrackerMetricTitle: {
      fontFamily: BODY_FONT_FAMILY,
      fontSize: 17,
      fontWeight: 700,
      lineHeight: 1.25,
    },
  },
});

export default memberTheme;
