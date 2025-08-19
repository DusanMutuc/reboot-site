// src/theme/adminTheme.ts
import { createTheme } from '@mui/material/styles';

const adminTheme = createTheme({
  typography: {
    fontSize: 16,  // base font size (default is 14)
    h1: { fontSize: '3.5rem' },
    h2: { fontSize: '2.5rem' },
    h3: { fontSize: '2rem' },
    body1: { fontSize: '1.5rem' }, // default body text
    body2: { fontSize: '1.25rem' },     // slightly smaller
  },
});

export default adminTheme;
