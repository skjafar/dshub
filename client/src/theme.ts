import { createTheme } from '@mui/material/styles';

// ─── Industrial Precision Theme — The Kinetic Monolith ────────────────────
// Stitch design system: editorial depth meets machine precision.
// Surface hierarchy via tonal shifts, no 100%-opacity structural lines.
// Ambient shadows tinted with primary-fixed-dim (cyan).

export const FONT_BODY     = '"Inter", -apple-system, BlinkMacSystemFont, sans-serif';
export const FONT_MONO     = FONT_BODY;
export const FONT_HEADLINE = '"Space Grotesk", "Inter", sans-serif';
const        FONT_DISPLAY  = FONT_HEADLINE;

// ─── Stitch Color Tokens (dark mode) ─────────────────────────────────────

// Surfaces (Level 0 → 3)
const S_BASE              = '#131313';  // surface / background
const S_LOWEST            = '#0e0e0e';  // surface-container-lowest
const S_LOW               = '#1c1b1b';  // surface-container-low
const S_CONTAINER         = '#201f1f';  // surface-container  (Level 1)
const S_HIGH              = '#2a2a2a';  // surface-container-high (Level 2)
const S_HIGHEST           = '#353534';  // surface-container-highest (Level 3)
const S_BRIGHT            = '#393939';  // surface-bright

// Outlines
const OUTLINE             = '#849396';
const OUTLINE_VAR         = '#3b494c';
const GHOST_BORDER        = `rgba(59, 73, 76, 0.15)`;  // outline-variant @ 15%
const GHOST_BORDER_20     = `rgba(59, 73, 76, 0.20)`;  // outline-variant @ 20%

// Primary (Cyan)
const PRIMARY             = '#c3f5ff';
const PRIMARY_CONTAINER   = '#00e5ff';
const PRIMARY_FIXED       = '#9cf0ff';
const PRIMARY_FIXED_DIM   = '#00daf3';
const ON_PRIMARY          = '#00363d';
const ON_PRIMARY_CONTAINER= '#00626e';
const INVERSE_PRIMARY     = '#006875';

// Secondary (Lime)
const SECONDARY_CONTAINER = '#75fd00';
const SECONDARY_FIXED     = '#80ff2c';
const SECONDARY_FIXED_DIM = '#67e100';
const ON_SECONDARY        = '#153800';
const ON_SECONDARY_CONTAINER = '#307000';

// Tertiary (Gold)
const TERTIARY            = '#ffebc3';
const TERTIARY_CONTAINER  = '#ffc938';
const TERTIARY_FIXED      = '#ffdf99';
const TERTIARY_FIXED_DIM  = '#f7be00';
const ON_TERTIARY         = '#3f2e00';
const ON_TERTIARY_CONTAINER = '#705500';

// Error
const ERROR               = '#ffb4ab';
const ERROR_CONTAINER     = '#93000a';
const ON_ERROR            = '#690005';
const ON_ERROR_CONTAINER  = '#ffdad6';

// Text
const ON_SURFACE          = '#e5e2e1';
const ON_SURFACE_VARIANT  = '#bac9cc';

// Ambient shadow (tinted with primary-fixed-dim, not black)
const AMBIENT_SHADOW      = '0 24px 48px rgba(0, 218, 243, 0.08)';
const BUTTON_GLOW         = '0 0 8px rgba(0, 218, 243, 0.4)';

// ─── Shared Component Structure (theme-independent) ───────────────────────

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
    borderRadius: 2,   // machined — 2px square feel
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
    fontFamily: FONT_BODY,
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
    fontFamily: FONT_HEADLINE,
    fontSize: '1rem',
    fontWeight: 600,
  },
};

// ─── Light Theme ──────────────────────────────────────────────────────────

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
    divider: 'rgba(0, 0, 0, 0.1)',
    action: {
      active: '#1A1A2E',
      hover: 'rgba(0, 119, 182, 0.04)',
      selected: 'rgba(0, 119, 182, 0.08)',
      disabled: 'rgba(0, 0, 0, 0.26)',
      disabledBackground: 'rgba(0, 0, 0, 0.06)',
    },
  },
  typography: {
    fontFamily: FONT_BODY,
    h1: { fontFamily: FONT_DISPLAY, fontSize: '2rem',     fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em' },
    h2: { fontFamily: FONT_DISPLAY, fontSize: '1.5rem',   fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em' },
    h3: { fontFamily: FONT_DISPLAY, fontSize: '1.25rem',  fontWeight: 600, lineHeight: 1.4 },
    h4: { fontFamily: FONT_DISPLAY, fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.4 },
    h5: { fontFamily: FONT_DISPLAY, fontSize: '1rem',     fontWeight: 600, lineHeight: 1.5 },
    h6: { fontFamily: FONT_DISPLAY, fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.6, letterSpacing: '0.02em', textTransform: 'uppercase' },
    subtitle1: { fontFamily: FONT_BODY, fontSize: '0.9375rem', fontWeight: 500 },
    subtitle2: { fontFamily: FONT_BODY, fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' },
    body1:     { fontFamily: FONT_BODY, fontSize: '0.875rem',  lineHeight: 1.6 },
    body2:     { fontFamily: FONT_BODY, fontSize: '0.8125rem', lineHeight: 1.5 },
    caption:   { fontFamily: FONT_BODY, fontSize: '0.6875rem', lineHeight: 1.4, letterSpacing: '0.05em', textTransform: 'uppercase' },
    button:    { fontFamily: FONT_BODY, textTransform: 'none',  fontWeight: 600, fontSize: '0.8125rem', letterSpacing: '0.03em' },
    overline:  { fontFamily: FONT_MONO, fontSize: '0.625rem',   fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' },
  },
  shape: {
    borderRadius: 4,
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
            boxShadow: '0 0 12px rgba(0, 119, 182, 0.2)',
          },
        },
        outlined: {
          borderColor: 'rgba(0,0,0,0.15)',
          '&:hover': {
            borderColor: 'rgba(0,0,0,0.3)',
            backgroundColor: 'rgba(0, 119, 182, 0.04)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          boxShadow: 'none',
          border: '1px solid rgba(0,0,0,0.12)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: 'none',
          border: '1px solid rgba(0,0,0,0.1)',
        },
        elevation2: {
          boxShadow: 'none',
          border: '1px solid rgba(0,0,0,0.1)',
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
          borderBottom: '1px solid rgba(0,0,0,0.08)',
        },
        head: {
          ...tableCellBase.head,
          color: '#5A5A72',
          backgroundColor: '#F5F5F8',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          ...tabBase.root,
          color: '#5A5A72',
          '&.Mui-selected': {
            color: '#0077B6',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
          backgroundColor: '#0077B6',
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
          backgroundColor: 'rgba(5, 150, 105, 0.06)',
          borderColor: 'rgba(5, 150, 105, 0.25)',
          color: '#047857',
        },
        standardError: {
          backgroundColor: 'rgba(220, 38, 38, 0.06)',
          borderColor: 'rgba(220, 38, 38, 0.25)',
          color: '#B91C1C',
        },
        standardWarning: {
          backgroundColor: 'rgba(217, 119, 6, 0.06)',
          borderColor: 'rgba(217, 119, 6, 0.25)',
          color: '#B45309',
        },
        standardInfo: {
          backgroundColor: 'rgba(0, 119, 182, 0.06)',
          borderColor: 'rgba(0, 119, 182, 0.25)',
          color: '#005A8C',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 119, 182, 0.06)',
            borderLeft: '3px solid #0077B6',
            '&:hover': {
              backgroundColor: 'rgba(0, 119, 182, 0.1)',
            },
          },
        },
      },
    },
    MuiTooltip: {
      defaultProps: {
        disableInteractive: true,
      },
      styleOverrides: {
        tooltip: {
          fontFamily: FONT_BODY,
          fontSize: '0.6875rem',
          borderRadius: 4,
          backgroundColor: '#1A1A2E',
          border: '1px solid rgba(0,0,0,0.15)',
          color: '#E8E8EC',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          border: '1px solid rgba(0,0,0,0.1)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: dialogTitleBase,
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: 4,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: '0.8125rem',
          '&:hover': {
            backgroundColor: 'rgba(0, 119, 182, 0.06)',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 119, 182, 0.1)',
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': {
            color: '#0077B6',
          },
          '&.Mui-checked + .MuiSwitch-track': {
            backgroundColor: '#0077B6',
          },
        },
      },
    },
  },
});

// ─── Dark Theme — The Kinetic Monolith ────────────────────────────────────
// Full Stitch design system: tonal depth, cyan accents, machined precision.

export const dsHubDarkTheme = createTheme({
  ...dsHubTheme,
  palette: {
    mode: 'dark',
    primary: {
      main:          PRIMARY_CONTAINER,    // #00e5ff  — CTA, indicators
      light:         PRIMARY,              // #c3f5ff  — lighter cyan
      dark:          PRIMARY_FIXED_DIM,    // #00daf3  — dim accent
      contrastText:  ON_PRIMARY_CONTAINER, // #00626e
    },
    secondary: {
      main:          SECONDARY_CONTAINER,  // #75fd00  — Lime, healthy states
      light:         SECONDARY_FIXED,      // #80ff2c
      dark:          SECONDARY_FIXED_DIM,  // #67e100
      contrastText:  ON_SECONDARY_CONTAINER, // #307000
    },
    error: {
      main:          ERROR,                // #ffb4ab
      light:         ON_ERROR_CONTAINER,   // #ffdad6
      dark:          ERROR_CONTAINER,      // #93000a
      contrastText:  ON_ERROR,             // #690005
    },
    warning: {
      main:          TERTIARY_CONTAINER,   // #ffc938  — Gold
      light:         TERTIARY_FIXED,       // #ffdf99
      dark:          TERTIARY_FIXED_DIM,   // #f7be00
      contrastText:  ON_TERTIARY,          // #3f2e00
    },
    info: {
      main:          PRIMARY_FIXED_DIM,    // #00daf3
      light:         PRIMARY_FIXED,        // #9cf0ff
      dark:          INVERSE_PRIMARY,      // #006875
      contrastText:  ON_PRIMARY,           // #00363d
    },
    success: {
      main:          SECONDARY_CONTAINER,  // #75fd00  — Lime
      light:         SECONDARY_FIXED,      // #80ff2c
      dark:          SECONDARY_FIXED_DIM,  // #67e100
      contrastText:  ON_SECONDARY,         // #153800
    },
    background: {
      default: S_BASE,       // #131313  — Level 0
      paper:   S_CONTAINER,  // #201f1f  — Level 1 sections
    },
    text: {
      primary:   ON_SURFACE,         // #e5e2e1
      secondary: ON_SURFACE_VARIANT, // #bac9cc
      disabled:  OUTLINE,            // #849396
    },
    divider: GHOST_BORDER,
    action: {
      active:            ON_SURFACE,
      hover:             'rgba(0, 218, 243, 0.04)',
      selected:          'rgba(0, 218, 243, 0.08)',
      disabled:          `rgba(${ON_SURFACE}, 0.2)`,
      disabledBackground:'rgba(255, 255, 255, 0.04)',
    },
  },
  components: {
    ...dsHubTheme.components,

    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFeatureSettings: '"tnum"',
          backgroundColor: S_BASE,
          color: ON_SURFACE,
        },
      },
    },

    // ─── Buttons: radius 4, solid CTA + ghost outlined, stateful glow ────
    MuiButton: {
      styleOverrides: {
        ...buttonBase,
        contained: {
          boxShadow: 'none',
          background: `linear-gradient(135deg, ${PRIMARY_CONTAINER} 0%, ${PRIMARY_FIXED_DIM} 100%)`,
          color: ON_PRIMARY,
          '&:hover': {
            boxShadow: BUTTON_GLOW,
            background: `linear-gradient(135deg, ${PRIMARY_FIXED} 0%, ${PRIMARY_CONTAINER} 100%)`,
          },
        },
        outlined: {
          borderColor: GHOST_BORDER_20,
          color: PRIMARY_CONTAINER,
          '&:hover': {
            borderColor: `rgba(59, 73, 76, 0.4)`,
            backgroundColor: 'rgba(0, 218, 243, 0.04)',
          },
        },
        text: {
          color: PRIMARY_CONTAINER,
          '&:hover': {
            backgroundColor: 'rgba(0, 218, 243, 0.04)',
          },
        },
      },
    },

    // ─── Cards: Level 2 surface, ghost border, no shadow ─────────────────
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          boxShadow: 'none',
          border: `1px solid ${GHOST_BORDER}`,
          backgroundColor: S_CONTAINER,
          backgroundImage: 'none',
        },
      },
    },

    // ─── Paper: tonal depth via elevation → surface tier ─────────────────
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          backgroundImage: 'none',
          backgroundColor: S_CONTAINER,
        },
        elevation1: {
          boxShadow: 'none',
          border: `1px solid ${GHOST_BORDER}`,
          backgroundColor: S_CONTAINER,
        },
        elevation2: {
          boxShadow: AMBIENT_SHADOW,
          border: `1px solid ${GHOST_BORDER}`,
          backgroundColor: S_HIGH,
        },
        elevation3: {
          boxShadow: AMBIENT_SHADOW,
          border: `1px solid ${GHOST_BORDER}`,
          backgroundColor: S_HIGHEST,
        },
      },
    },

    // ─── TextField: surface-lowest base, outline-variant border, cyan focus
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 4,
            backgroundColor: S_LOWEST,
            fontFamily: FONT_MONO,
            '& fieldset': {
              borderColor: GHOST_BORDER,
            },
            '&:hover fieldset': {
              borderColor: GHOST_BORDER_20,
            },
            '&.Mui-focused fieldset': {
              borderColor: PRIMARY,
              borderWidth: '1.5px',
            },
          },
          '& .MuiInputLabel-root': {
            color: OUTLINE,
            fontFamily: FONT_BODY,
            fontSize: '0.8125rem',
          },
          '& .MuiInputLabel-root.Mui-focused': {
            color: PRIMARY,
          },
          '& .MuiInputBase-input': {
            color: ON_SURFACE,
          },
        },
      },
    },

    // ─── Select / Autocomplete ────────────────────────────────────────────
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '& fieldset': {
            borderColor: GHOST_BORDER,
          },
          '&:hover fieldset': {
            borderColor: GHOST_BORDER_20,
          },
          '&.Mui-focused fieldset': {
            borderColor: PRIMARY,
          },
        },
      },
    },

    // ─── Chips: 2px radius for machined feel ─────────────────────────────
    MuiChip: {
      styleOverrides: {
        ...chipBase,
        root: {
          ...chipBase.root,
          backgroundColor: S_HIGH,
          color: ON_SURFACE,
        },
        outlined: {
          borderColor: GHOST_BORDER_20,
          color: ON_SURFACE_VARIANT,
        },
        colorPrimary: {
          backgroundColor: `rgba(0, 229, 255, 0.12)`,
          color: PRIMARY_CONTAINER,
          border: `1px solid rgba(0, 229, 255, 0.2)`,
        },
        colorSuccess: {
          backgroundColor: `rgba(117, 253, 0, 0.12)`,
          color: SECONDARY_CONTAINER,
          border: `1px solid rgba(117, 253, 0, 0.2)`,
        },
        colorWarning: {
          backgroundColor: `rgba(255, 201, 56, 0.12)`,
          color: TERTIARY_CONTAINER,
          border: `1px solid rgba(255, 201, 56, 0.2)`,
        },
        colorError: {
          backgroundColor: `rgba(255, 180, 171, 0.12)`,
          color: ERROR,
          border: `1px solid rgba(255, 180, 171, 0.2)`,
        },
      },
    },

    // ─── Table: ghost borders, surface-low header, monospace data ────────
    MuiTableCell: {
      styleOverrides: {
        ...tableCellBase,
        root: {
          ...tableCellBase.root,
          borderBottom: `1px solid ${GHOST_BORDER}`,
          color: ON_SURFACE,
          fontFamily: FONT_MONO,
          fontSize: '0.8125rem',
        },
        head: {
          ...tableCellBase.head,
          color: ON_SURFACE_VARIANT,
          backgroundColor: S_LOW,
          fontFamily: FONT_BODY,
          borderBottom: `1px solid ${GHOST_BORDER_20}`,
        },
      },
    },

    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: `rgba(0, 218, 243, 0.03)`,
          },
        },
      },
    },

    // ─── Tabs: cyan active indicator, outline for inactive ────────────────
    MuiTab: {
      styleOverrides: {
        root: {
          ...tabBase.root,
          color: OUTLINE,
          '&.Mui-selected': {
            color: PRIMARY_CONTAINER,
          },
          '&:hover': {
            color: PRIMARY_CONTAINER,
            opacity: 1,
          },
        },
      },
    },

    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
          backgroundColor: PRIMARY_CONTAINER,
        },
        root: {
          borderBottom: `1px solid ${GHOST_BORDER}`,
        },
      },
    },

    // ─── Alerts: tinted backgrounds, no harsh borders ─────────────────────
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          fontSize: '0.8125rem',
          border: '1px solid',
        },
        standardSuccess: {
          backgroundColor: 'rgba(117, 253, 0, 0.08)',
          borderColor: 'rgba(117, 253, 0, 0.2)',
          color: SECONDARY_CONTAINER,
        },
        standardError: {
          backgroundColor: 'rgba(147, 0, 10, 0.15)',
          borderColor: 'rgba(255, 180, 171, 0.3)',
          color: ERROR,
          // Emergency: surface_bright 1px top-edge highlight
          borderTop: `1px solid ${S_BRIGHT}`,
        },
        standardWarning: {
          backgroundColor: 'rgba(255, 201, 56, 0.08)',
          borderColor: 'rgba(255, 201, 56, 0.2)',
          color: TERTIARY_CONTAINER,
        },
        standardInfo: {
          backgroundColor: 'rgba(0, 218, 243, 0.08)',
          borderColor: 'rgba(0, 218, 243, 0.2)',
          color: PRIMARY,
        },
      },
    },

    // ─── List: cyan selection, border-left accent ─────────────────────────
    MuiListItemButton: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 218, 243, 0.06)',
            borderLeft: `3px solid ${PRIMARY_CONTAINER}`,
            paddingLeft: '13px',  // compensate for border
            '&:hover': {
              backgroundColor: 'rgba(0, 218, 243, 0.1)',
            },
          },
          '&:hover': {
            backgroundColor: 'rgba(0, 218, 243, 0.03)',
          },
        },
      },
    },

    // ─── Tooltip: surface-lowest + ghost border ───────────────────────────
    MuiTooltip: {
      defaultProps: {
        disableInteractive: true,
      },
      styleOverrides: {
        tooltip: {
          fontFamily: FONT_BODY,
          fontSize: '0.6875rem',
          borderRadius: 4,
          backgroundColor: S_LOWEST,
          border: `1px solid ${GHOST_BORDER_20}`,
          color: ON_SURFACE,
          boxShadow: AMBIENT_SHADOW,
        },
        arrow: {
          color: S_LOWEST,
        },
      },
    },

    // ─── Dialog: surface-container, ambient shadow, xl radius ────────────
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          backgroundColor: S_CONTAINER,
          border: `1px solid ${GHOST_BORDER}`,
          boxShadow: AMBIENT_SHADOW,
          backgroundImage: 'none',
        },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: {
          ...dialogTitleBase.root,
          color: ON_SURFACE,
          borderBottom: `1px solid ${GHOST_BORDER}`,
          paddingBottom: '12px',
        },
      },
    },

    MuiDialogContent: {
      styleOverrides: {
        root: {
          backgroundColor: S_CONTAINER,
        },
      },
    },

    MuiDialogActions: {
      styleOverrides: {
        root: {
          borderTop: `1px solid ${GHOST_BORDER}`,
          backgroundColor: S_LOW,
          padding: '12px 24px',
        },
      },
    },

    // ─── Menu: glassmorphism HUD overlay ─────────────────────────────────
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(53, 53, 52, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${GHOST_BORDER}`,
          borderRadius: 4,
          boxShadow: AMBIENT_SHADOW,
          backgroundImage: 'none',
        },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: '0.8125rem',
          fontFamily: FONT_BODY,
          color: ON_SURFACE,
          '&:hover': {
            backgroundColor: 'rgba(0, 218, 243, 0.06)',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 218, 243, 0.1)',
            color: PRIMARY_CONTAINER,
          },
          '&.Mui-selected:hover': {
            backgroundColor: 'rgba(0, 218, 243, 0.14)',
          },
        },
      },
    },

    // ─── Select dropdown ──────────────────────────────────────────────────
    MuiSelect: {
      styleOverrides: {
        icon: {
          color: OUTLINE,
        },
      },
    },

    // ─── Switch: cyan when checked ────────────────────────────────────────
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': {
            color: PRIMARY_CONTAINER,
          },
          '&.Mui-checked + .MuiSwitch-track': {
            backgroundColor: PRIMARY_FIXED_DIM,
          },
        },
        track: {
          backgroundColor: OUTLINE_VAR,
          opacity: 1,
        },
      },
    },

    // ─── Divider: ghost border ────────────────────────────────────────────
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: GHOST_BORDER,
        },
      },
    },

    // ─── Input base (used by Select, Autocomplete, etc.) ─────────────────
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontFamily: FONT_MONO,
          fontSize: '0.8125rem',
          color: ON_SURFACE,
        },
        input: {
          '&::placeholder': {
            color: OUTLINE,
            opacity: 1,
          },
        },
      },
    },

    // ─── Form labels ─────────────────────────────────────────────────────
    MuiFormLabel: {
      styleOverrides: {
        root: {
          color: OUTLINE,
          fontFamily: FONT_BODY,
          fontSize: '0.8125rem',
          '&.Mui-focused': {
            color: PRIMARY,
          },
        },
      },
    },

    // ─── Icon Button ─────────────────────────────────────────────────────
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: ON_SURFACE_VARIANT,
          borderRadius: 4,
          '&:hover': {
            backgroundColor: 'rgba(0, 218, 243, 0.06)',
            color: PRIMARY_CONTAINER,
          },
        },
      },
    },

    // ─── Drawer / Sidebar ─────────────────────────────────────────────────
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: S_CONTAINER,
          borderRight: `1px solid ${GHOST_BORDER}`,
          backgroundImage: 'none',
        },
      },
    },

    // ─── AppBar / Toolbar ────────────────────────────────────────────────
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: S_LOW,
          borderBottom: `1px solid ${GHOST_BORDER}`,
          boxShadow: 'none',
          backgroundImage: 'none',
        },
      },
    },

    // ─── Popover ─────────────────────────────────────────────────────────
    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(53, 53, 52, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${GHOST_BORDER}`,
          borderRadius: 4,
          boxShadow: AMBIENT_SHADOW,
          backgroundImage: 'none',
        },
      },
    },

    // ─── Accordion ───────────────────────────────────────────────────────
    MuiAccordion: {
      styleOverrides: {
        root: {
          backgroundColor: S_CONTAINER,
          border: `1px solid ${GHOST_BORDER}`,
          boxShadow: 'none',
          backgroundImage: 'none',
          '&:before': {
            display: 'none',
          },
          '&.Mui-expanded': {
            backgroundColor: S_HIGH,
          },
        },
      },
    },

    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${GHOST_BORDER}`,
          '&.Mui-expanded': {
            borderBottom: `1px solid ${GHOST_BORDER_20}`,
          },
        },
        expandIconWrapper: {
          color: OUTLINE,
        },
      },
    },

    // ─── Slider ───────────────────────────────────────────────────────────
    MuiSlider: {
      styleOverrides: {
        track: {
          background: `linear-gradient(90deg, ${PRIMARY_CONTAINER} 0%, ${PRIMARY_FIXED_DIM} 100%)`,
          border: 'none',
        },
        rail: {
          backgroundColor: OUTLINE_VAR,
          opacity: 1,
        },
        thumb: {
          backgroundColor: PRIMARY_CONTAINER,
          border: `2px solid ${S_CONTAINER}`,
          '&:hover, &.Mui-focusVisible': {
            boxShadow: `0 0 0 8px rgba(0, 229, 255, 0.12)`,
          },
        },
        mark: {
          backgroundColor: OUTLINE_VAR,
        },
        markActive: {
          backgroundColor: PRIMARY_FIXED_DIM,
        },
      },
    },

    // ─── Linear Progress ─────────────────────────────────────────────────
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: OUTLINE_VAR,
          borderRadius: 2,
          height: 4,
        },
        bar: {
          background: `linear-gradient(90deg, ${PRIMARY_CONTAINER} 0%, ${PRIMARY_FIXED_DIM} 100%)`,
          borderRadius: 2,
        },
      },
    },

    // ─── Circular Progress ────────────────────────────────────────────────
    MuiCircularProgress: {
      styleOverrides: {
        circle: {
          strokeLinecap: 'round',
        },
      },
    },

    // ─── Snackbar / Toast ─────────────────────────────────────────────────
    MuiSnackbarContent: {
      styleOverrides: {
        root: {
          backgroundColor: S_HIGHEST,
          border: `1px solid ${GHOST_BORDER}`,
          borderRadius: 4,
          color: ON_SURFACE,
          boxShadow: AMBIENT_SHADOW,
        },
      },
    },

    // ─── Badge ────────────────────────────────────────────────────────────
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontFamily: FONT_MONO,
          fontSize: '0.625rem',
          fontWeight: 600,
          minWidth: 16,
          height: 16,
          borderRadius: 2,
        },
      },
    },

    // ─── List / ListItem ─────────────────────────────────────────────────
    MuiListItem: {
      styleOverrides: {
        root: {
          color: ON_SURFACE,
        },
      },
    },

    MuiListItemText: {
      styleOverrides: {
        primary: {
          fontSize: '0.8125rem',
          color: ON_SURFACE,
          fontFamily: FONT_BODY,
        },
        secondary: {
          fontSize: '0.6875rem',
          color: ON_SURFACE_VARIANT,
          fontFamily: FONT_BODY,
        },
      },
    },

    MuiListItemIcon: {
      styleOverrides: {
        root: {
          color: ON_SURFACE_VARIANT,
          minWidth: 36,
        },
      },
    },

    // ─── Skeleton (loading placeholder) ──────────────────────────────────
    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: S_HIGH,
          '&::after': {
            background: `linear-gradient(90deg, transparent, rgba(0, 218, 243, 0.04), transparent)`,
          },
        },
      },
    },

    // ─── Step / Stepper ───────────────────────────────────────────────────
    MuiStepLabel: {
      styleOverrides: {
        label: {
          fontFamily: FONT_BODY,
          fontSize: '0.8125rem',
          color: OUTLINE,
          '&.Mui-active': {
            color: PRIMARY_CONTAINER,
          },
          '&.Mui-completed': {
            color: SECONDARY_CONTAINER,
          },
        },
      },
    },

    MuiStepIcon: {
      styleOverrides: {
        root: {
          color: OUTLINE_VAR,
          '&.Mui-active': {
            color: PRIMARY_CONTAINER,
          },
          '&.Mui-completed': {
            color: SECONDARY_CONTAINER,
          },
        },
      },
    },

    // ─── Breadcrumbs ──────────────────────────────────────────────────────
    MuiBreadcrumbs: {
      styleOverrides: {
        root: {
          fontSize: '0.75rem',
          color: ON_SURFACE_VARIANT,
        },
        separator: {
          color: OUTLINE,
        },
      },
    },

    // ─── Pagination ───────────────────────────────────────────────────────
    MuiPaginationItem: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          color: ON_SURFACE_VARIANT,
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 229, 255, 0.12)',
            color: PRIMARY_CONTAINER,
            border: `1px solid rgba(0, 229, 255, 0.2)`,
          },
        },
      },
    },

    // ─── Toggle Button ────────────────────────────────────────────────────
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          borderColor: GHOST_BORDER_20,
          color: ON_SURFACE_VARIANT,
          fontSize: '0.75rem',
          fontFamily: FONT_BODY,
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 229, 255, 0.12)',
            color: PRIMARY_CONTAINER,
            borderColor: 'rgba(0, 229, 255, 0.2)',
            '&:hover': {
              backgroundColor: 'rgba(0, 229, 255, 0.16)',
            },
          },
          '&:hover': {
            backgroundColor: 'rgba(0, 218, 243, 0.04)',
          },
        },
      },
    },

    // ─── Checkbox ─────────────────────────────────────────────────────────
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: OUTLINE,
          borderRadius: 2,
          '&.Mui-checked': {
            color: PRIMARY_CONTAINER,
          },
        },
      },
    },

    // ─── Radio ────────────────────────────────────────────────────────────
    MuiRadio: {
      styleOverrides: {
        root: {
          color: OUTLINE,
          '&.Mui-checked': {
            color: PRIMARY_CONTAINER,
          },
        },
      },
    },

    // ─── Autocomplete ─────────────────────────────────────────────────────
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(53, 53, 52, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${GHOST_BORDER}`,
          borderRadius: 4,
          boxShadow: AMBIENT_SHADOW,
        },
        option: {
          fontSize: '0.8125rem',
          fontFamily: FONT_BODY,
          '&[aria-selected="true"]': {
            backgroundColor: 'rgba(0, 218, 243, 0.1)',
            color: PRIMARY_CONTAINER,
          },
          '&:hover': {
            backgroundColor: 'rgba(0, 218, 243, 0.06)',
          },
        },
        noOptions: {
          fontSize: '0.8125rem',
          color: OUTLINE,
          fontFamily: FONT_BODY,
        },
        tag: {
          backgroundColor: S_HIGH,
          color: ON_SURFACE,
        },
        clearIndicator: {
          color: OUTLINE,
          '&:hover': {
            color: PRIMARY_CONTAINER,
            backgroundColor: 'rgba(0, 218, 243, 0.06)',
          },
        },
        popupIndicator: {
          color: OUTLINE,
          '&:hover': {
            color: PRIMARY_CONTAINER,
            backgroundColor: 'rgba(0, 218, 243, 0.06)',
          },
        },
      },
    },
  },
});
