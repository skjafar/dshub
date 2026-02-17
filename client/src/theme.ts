import { createTheme } from '@mui/material/styles';

// ─── Industrial Precision Theme ───────────────────────────────────────────────
// Dark-first, monospace-heavy, tight data density.
// Oscilloscope meets modern IDE.

export const FONT_MONO = '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace';
export const FONT_BODY = '"IBM Plex Sans", "Inter", -apple-system, sans-serif';
const FONT_DISPLAY = FONT_MONO;

// ─── Shared Component Styles (theme-independent structure) ───────────────────

const buttonBase = {
  root: {
    borderRadius: 4,
    padding: '6px 14px',
    boxShadow: 'none',
    fontWeight: 600,
    fontSize: '0.8125rem',
    letterSpacing: '0.03em',
    '&:hover': { boxShadow: 'none' },
  },
  sizeSmall: {
    padding: '4px 10px',
    fontSize: '0.75rem',
  },
};

const chipBase = {
  root: {
    borderRadius: 4,
    fontWeight: 500,
    height: 22,
    fontSize: '0.6875rem',
  },
  sizeSmall: {
    height: 20,
    fontSize: '0.625rem',
  },
};

const tableCellBase = {
  root: {
    padding: '6px 12px',
    fontSize: '0.8125rem',
  },
  head: {
    fontWeight: 600,
    fontSize: '0.6875rem',
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  },
};

const tabBase = {
  root: {
    fontFamily: FONT_MONO,
    fontSize: '0.75rem',
    fontWeight: 500,
    letterSpacing: '0.02em',
    textTransform: 'none' as const,
    minHeight: 36,
    padding: '6px 16px',
  },
};

const dialogTitleBase = {
  root: {
    fontFamily: FONT_DISPLAY,
    fontSize: '1rem',
    fontWeight: 600,
  },
};

// ─── Light Theme ──────────────────────────────────────────────────────────────

export const dsHubTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0077B6',
      light: '#0096D6',
      dark: '#005A8C',
      contrastText: '#fff',
    },
    secondary: {
      main: '#6E40C9',
      light: '#8B5CF6',
      dark: '#553098',
      contrastText: '#fff',
    },
    error: {
      main: '#DC2626',
      light: '#EF4444',
      dark: '#B91C1C',
    },
    warning: {
      main: '#D97706',
      light: '#F59E0B',
      dark: '#B45309',
    },
    info: {
      main: '#0077B6',
      light: '#0096D6',
      dark: '#005A8C',
    },
    success: {
      main: '#059669',
      light: '#10B981',
      dark: '#047857',
    },
    background: {
      default: '#F0F1F5',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1A1A2E',
      secondary: '#5A5A72',
      disabled: '#9CA3AF',
    },
    divider: 'rgba(0, 0, 0, 0.06)',
  },
  typography: {
    fontFamily: FONT_BODY,
    h1: { fontFamily: FONT_DISPLAY, fontSize: '2rem', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em' },
    h2: { fontFamily: FONT_DISPLAY, fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em' },
    h3: { fontFamily: FONT_DISPLAY, fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.4 },
    h4: { fontFamily: FONT_DISPLAY, fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.4 },
    h5: { fontFamily: FONT_DISPLAY, fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 },
    h6: { fontFamily: FONT_DISPLAY, fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.6, letterSpacing: '0.02em', textTransform: 'uppercase' },
    subtitle1: { fontFamily: FONT_BODY, fontSize: '0.9375rem', fontWeight: 500 },
    subtitle2: { fontFamily: FONT_BODY, fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' },
    body1: { fontFamily: FONT_BODY, fontSize: '0.875rem', lineHeight: 1.6 },
    body2: { fontFamily: FONT_BODY, fontSize: '0.8125rem', lineHeight: 1.5 },
    caption: { fontFamily: FONT_BODY, fontSize: '0.6875rem', lineHeight: 1.4, letterSpacing: '0.01em' },
    button: { fontFamily: FONT_BODY, textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', letterSpacing: '0.03em' },
    overline: { fontFamily: FONT_MONO, fontSize: '0.625rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' },
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFeatureSettings: '"tnum"',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        ...buttonBase,
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          boxShadow: 'none',
          border: '1px solid rgba(0,0,0,0.08)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: 'none',
          border: '1px solid rgba(0,0,0,0.08)',
        },
        elevation2: {
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          border: '1px solid rgba(0,0,0,0.06)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 4,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: chipBase,
    },
    MuiTableCell: {
      styleOverrides: {
        ...tableCellBase,
        root: {
          ...tableCellBase.root,
          borderBottom: '1px solid rgba(0,0,0,0.06)',
        },
        head: {
          ...tableCellBase.head,
          color: '#5A5A72',
          backgroundColor: '#F5F5F8',
        },
      },
    },
    MuiTab: {
      styleOverrides: tabBase,
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          fontSize: '0.8125rem',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontFamily: FONT_BODY,
          fontSize: '0.6875rem',
          borderRadius: 4,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: dialogTitleBase,
    },
  },
});

// ─── Dark Theme — Industrial Precision ────────────────────────────────────────

export const dsHubDarkTheme = createTheme({
  ...dsHubTheme,
  palette: {
    mode: 'dark',
    primary: {
      main: '#00D4FF',
      light: '#5CE1FF',
      dark: '#00A3CC',
      contrastText: '#0C0C0E',
    },
    secondary: {
      main: '#A78BFA',
      light: '#C4B5FD',
      dark: '#7C3AED',
      contrastText: '#0C0C0E',
    },
    error: {
      main: '#FF3D71',
      light: '#FF6B8A',
      dark: '#E5234E',
      contrastText: '#fff',
    },
    warning: {
      main: '#FFAB00',
      light: '#FFC233',
      dark: '#CC8900',
      contrastText: '#0C0C0E',
    },
    info: {
      main: '#00D4FF',
      light: '#5CE1FF',
      dark: '#00A3CC',
      contrastText: '#0C0C0E',
    },
    success: {
      main: '#00E676',
      light: '#33EB91',
      dark: '#00B85E',
      contrastText: '#0C0C0E',
    },
    background: {
      default: '#0C0C0E',
      paper: '#14141A',
    },
    text: {
      primary: '#E8E8EC',
      secondary: '#7A7A8A',
      disabled: '#4A4A5A',
    },
    divider: 'rgba(255, 255, 255, 0.04)',
    action: {
      active: '#E8E8EC',
      hover: 'rgba(255, 255, 255, 0.04)',
      selected: 'rgba(0, 212, 255, 0.08)',
      disabled: 'rgba(255, 255, 255, 0.2)',
      disabledBackground: 'rgba(255, 255, 255, 0.06)',
    },
  },
  components: {
    ...dsHubTheme.components,
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFeatureSettings: '"tnum"',
          backgroundColor: '#0C0C0E',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        ...buttonBase,
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 0 12px rgba(0, 212, 255, 0.15)',
          },
        },
        outlined: {
          borderColor: 'rgba(255,255,255,0.12)',
          '&:hover': {
            borderColor: 'rgba(255,255,255,0.24)',
            backgroundColor: 'rgba(255,255,255,0.04)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          boxShadow: 'none',
          border: '1px solid rgba(255,255,255,0.06)',
          backgroundColor: '#14141A',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundImage: 'none',
          backgroundColor: '#14141A',
        },
        elevation1: {
          boxShadow: 'none',
          border: '1px solid rgba(255,255,255,0.06)',
        },
        elevation2: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.06)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 4,
            '& fieldset': {
              borderColor: 'rgba(255,255,255,0.1)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(255,255,255,0.2)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#00D4FF',
              borderWidth: '1.5px',
            },
          },
          '& .MuiInputLabel-root': {
            color: '#7A7A8A',
          },
          '& .MuiInputBase-input': {
            color: '#E8E8EC',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        ...chipBase,
        outlined: {
          borderColor: 'rgba(255,255,255,0.12)',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        ...tableCellBase,
        root: {
          ...tableCellBase.root,
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        },
        head: {
          ...tableCellBase.head,
          color: '#7A7A8A',
          backgroundColor: '#1A1A24',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          ...tabBase.root,
          color: '#7A7A8A',
          '&.Mui-selected': {
            color: '#00D4FF',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
          backgroundColor: '#00D4FF',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          fontSize: '0.8125rem',
          border: '1px solid',
        },
        standardSuccess: {
          backgroundColor: 'rgba(0, 230, 118, 0.08)',
          borderColor: 'rgba(0, 230, 118, 0.2)',
          color: '#00E676',
        },
        standardError: {
          backgroundColor: 'rgba(255, 61, 113, 0.08)',
          borderColor: 'rgba(255, 61, 113, 0.2)',
          color: '#FF6B8A',
        },
        standardWarning: {
          backgroundColor: 'rgba(255, 171, 0, 0.08)',
          borderColor: 'rgba(255, 171, 0, 0.2)',
          color: '#FFC233',
        },
        standardInfo: {
          backgroundColor: 'rgba(0, 212, 255, 0.08)',
          borderColor: 'rgba(0, 212, 255, 0.2)',
          color: '#5CE1FF',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 212, 255, 0.06)',
            borderLeft: '3px solid #00D4FF',
            '&:hover': {
              backgroundColor: 'rgba(0, 212, 255, 0.1)',
            },
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontFamily: FONT_BODY,
          fontSize: '0.6875rem',
          borderRadius: 4,
          backgroundColor: '#1A1A24',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#E8E8EC',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          backgroundColor: '#14141A',
          border: '1px solid rgba(255,255,255,0.08)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: dialogTitleBase,
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1A1A24',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: '0.8125rem',
          '&:hover': {
            backgroundColor: 'rgba(0, 212, 255, 0.06)',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 212, 255, 0.1)',
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': {
            color: '#00D4FF',
          },
          '&.Mui-checked + .MuiSwitch-track': {
            backgroundColor: '#00D4FF',
          },
        },
      },
    },
  },
});
