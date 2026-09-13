'use client';
import { createTheme } from '@mui/material/styles';

/** Dark theme — this is a gaming community board, viewed mostly at night. */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#0e1116', paper: '#161b22' },
    primary: { main: '#ff6b35' },
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
});
