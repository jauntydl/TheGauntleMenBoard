'use client';
import { createTheme } from '@mui/material/styles';

/**
 * Avionics MFD, not cyberpunk.
 *
 * Gauntlet's Season 4 variant is jets-only, and the cockpit multi-function
 * displays it borrows from are amber phosphor on a blue-black ground. That is
 * where the palette comes from — a subject link rather than a neon mood.
 *
 * Two accents, one job each: amber carries rank and data, ice carries anything
 * interactive plus the ✈ badge (sky reads as aviation). Nothing else glows.
 */
export const palette = {
  void: '#06080D',
  panel: '#0C1118',
  line: '#1B2634',
  amber: '#FFB020',
  ice: '#7DE2FF',
  text: '#C9D6E4',
  dim: '#6B7C90',
};

const display = 'var(--font-display), "Trebuchet MS", sans-serif';
const body = 'var(--font-body), system-ui, sans-serif';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: palette.void, paper: palette.panel },
    primary: { main: palette.amber },
    secondary: { main: palette.ice },
    text: { primary: palette.text, secondary: palette.dim },
    divider: palette.line,
  },
  typography: {
    fontFamily: body,
    h1: { fontFamily: display, fontWeight: 700, letterSpacing: '0.02em' },
    h4: { fontFamily: display, fontWeight: 700, letterSpacing: '0.04em' },
    h6: { fontFamily: display, fontWeight: 600, letterSpacing: '0.06em' },
    button: { fontFamily: display, textTransform: 'none' },
  },
  shape: { borderRadius: 2 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: 'transparent' },
        // Keyboard focus must stay obvious against a busy ground.
        '*:focus-visible': {
          outline: `2px solid ${palette.ice}`,
          outlineOffset: 2,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontFamily: display,
          // MUI shouts tabs in caps by default; sentence case reads as content.
          textTransform: 'none',
          letterSpacing: '0.04em',
          fontSize: '0.95rem',
          color: palette.dim,
          '&.Mui-selected': { color: palette.amber },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
          backgroundColor: palette.amber,
          boxShadow: `0 0 12px ${palette.amber}`,
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: palette.ice,
          textDecorationColor: 'rgba(125,226,255,0.35)',
          textUnderlineOffset: '0.25em',
          '&:hover': { textDecorationColor: palette.ice },
        },
      },
    },
  },
});
