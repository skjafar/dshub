import { createTheme, Theme } from '@mui/material/styles';
import { FONT_BODY, FONT_HEADLINE, FONT_MONO } from './theme';

// ─── TypeScript augmentation ──────────────────────────────────────────────────
declare module '@mui/material/styles' {
  interface Palette {
    custom: AppThemeColors;
  }
  interface PaletteOptions {
    custom?: AppThemeColors;
  }
}

// ─── Token interface ──────────────────────────────────────────────────────────
export interface AppThemeColors {
  readonly mode: 'dark' | 'light';
  // Accent
  readonly primary: string;
  readonly primaryFixed: string;  // dim variant — used for glows & alpha math
  readonly secondary: string;
  readonly tertiary: string;
  readonly error: string;
  // Text
  readonly onSurface: string;
  readonly onSurfaceVar: string;
  readonly outline: string;
  readonly outlineVar: string;
  // Surface hierarchy (5 tiers)
  readonly surfaceLowest: string;  // deepest inset — text inputs
  readonly surface: string;        // base background
  readonly surfaceContainer: string; // cards / sections
  readonly surfaceHigh: string;    // elevated
  readonly surfaceHighest: string; // top layer / overlays
  // Ghost borders
  readonly ghost: string;    // outline-variant @ 15%
  readonly ghost20: string;  // outline-variant @ 20%
  readonly ghostSep: string; // separator  @ 40%
}

export interface AppTheme {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly mode: 'dark' | 'light';
  readonly preview: readonly [string, string, string]; // primary, secondary, tertiary
  readonly colors: AppThemeColors;
}

// ─── Theme definitions ────────────────────────────────────────────────────────

const KINETIC_MONOLITH: AppTheme = {
  id: 'kinetic-monolith',
  name: 'Kinetic Monolith',
  description: 'Industrial precision · Cyan on deep black',
  mode: 'dark',
  preview: ['#00e5ff', '#75fd00', '#ffc938'],
  colors: {
    mode: 'dark',
    primary:        '#00e5ff',
    primaryFixed:   '#00daf3',
    secondary:      '#75fd00',
    tertiary:       '#ffc938',
    error:          '#ffb4ab',
    onSurface:      '#e5e2e1',
    onSurfaceVar:   '#bac9cc',
    outline:        '#849396',
    outlineVar:     '#3b494c',
    surfaceLowest:  '#0e0e0e',
    surface:        '#131313',
    surfaceContainer: '#201f1f',
    surfaceHigh:    '#2a2a2a',
    surfaceHighest: '#353534',
    ghost:    'rgba(59,73,76,0.15)',
    ghost20:  'rgba(59,73,76,0.20)',
    ghostSep: 'rgba(59,73,76,0.40)',
  },
};

const VOID_VIOLET: AppTheme = {
  id: 'void-violet',
  name: 'Void Violet',
  description: 'Electric purple on cool deep space',
  mode: 'dark',
  preview: ['#c084fc', '#4ade80', '#fb923c'],
  colors: {
    mode: 'dark',
    primary:        '#c084fc',
    primaryFixed:   '#a855f7',
    secondary:      '#4ade80',
    tertiary:       '#fb923c',
    error:          '#ffb4ab',
    onSurface:      '#ede8f5',
    onSurfaceVar:   '#c4b8d8',
    outline:        '#8878aa',
    outlineVar:     '#3d3558',
    surfaceLowest:  '#09080f',
    surface:        '#0f0d18',
    surfaceContainer: '#191626',
    surfaceHigh:    '#231f33',
    surfaceHighest: '#2d2a40',
    ghost:    'rgba(80,60,130,0.15)',
    ghost20:  'rgba(80,60,130,0.20)',
    ghostSep: 'rgba(80,60,130,0.40)',
  },
};

const CRIMSON_CORE: AppTheme = {
  id: 'crimson-core',
  name: 'Crimson Core',
  description: 'Hot coral red on warm dark surfaces',
  mode: 'dark',
  preview: ['#ff6b8a', '#fcd34d', '#f472b6'],
  colors: {
    mode: 'dark',
    primary:        '#ff6b8a',
    primaryFixed:   '#f43f5e',
    secondary:      '#fcd34d',
    tertiary:       '#f472b6',
    error:          '#ffb4ab',
    onSurface:      '#f5e0e4',
    onSurfaceVar:   '#d4b8bf',
    outline:        '#9b7880',
    outlineVar:     '#4d2d35',
    surfaceLowest:  '#0e0609',
    surface:        '#150b0f',
    surfaceContainer: '#1f1218',
    surfaceHigh:    '#291820',
    surfaceHighest: '#342028',
    ghost:    'rgba(120,50,70,0.15)',
    ghost20:  'rgba(120,50,70,0.20)',
    ghostSep: 'rgba(120,50,70,0.40)',
  },
};

const PHOSPHOR: AppTheme = {
  id: 'phosphor',
  name: 'Phosphor',
  description: 'Terminal green on near-black substrate',
  mode: 'dark',
  preview: ['#39ff14', '#ffd60a', '#00ffff'],
  colors: {
    mode: 'dark',
    primary:        '#39ff14',
    primaryFixed:   '#00e600',
    secondary:      '#ffd60a',
    tertiary:       '#00ffff',
    error:          '#ffb4ab',
    onSurface:      '#d0f0d0',
    onSurfaceVar:   '#9ac09a',
    outline:        '#4a7a4a',
    outlineVar:     '#1e3e1e',
    surfaceLowest:  '#050805',
    surface:        '#080d08',
    surfaceContainer: '#101810',
    surfaceHigh:    '#182018',
    surfaceHighest: '#212b21',
    ghost:    'rgba(30,80,30,0.15)',
    ghost20:  'rgba(30,80,30,0.20)',
    ghostSep: 'rgba(30,80,30,0.40)',
  },
};

const BLUEPRINT: AppTheme = {
  id: 'blueprint',
  name: 'Blueprint',
  description: 'Navy engineering blue on cool light paper',
  mode: 'light',
  preview: ['#1d4ed8', '#0f766e', '#b45309'],
  colors: {
    mode: 'light',
    primary:        '#1d4ed8',
    primaryFixed:   '#2563eb',
    secondary:      '#0f766e',
    tertiary:       '#b45309',
    error:          '#b91c1c',
    onSurface:      '#0f1b3d',
    onSurfaceVar:   '#3d4f7c',
    outline:        '#4b6380',
    outlineVar:     '#c5d3e8',
    surfaceLowest:  '#ffffff',
    surface:        '#f0f4ff',
    surfaceContainer: '#e8eeff',
    surfaceHigh:    '#dde5f8',
    surfaceHighest: '#d1daf2',
    ghost:    'rgba(30,60,130,0.12)',
    ghost20:  'rgba(30,60,130,0.18)',
    ghostSep: 'rgba(30,60,130,0.25)',
  },
};

const ARCTIC: AppTheme = {
  id: 'arctic',
  name: 'Arctic',
  description: 'Sky blue & violet on bright white',
  mode: 'light',
  preview: ['#0284c7', '#7c3aed', '#059669'],
  colors: {
    mode: 'light',
    primary:        '#0284c7',
    primaryFixed:   '#0ea5e9',
    secondary:      '#7c3aed',
    tertiary:       '#059669',
    error:          '#dc2626',
    onSurface:      '#0f172a',
    onSurfaceVar:   '#334155',
    outline:        '#64748b',
    outlineVar:     '#cbd5e1',
    surfaceLowest:  '#ffffff',
    surface:        '#f8fafc',
    surfaceContainer: '#f1f5f9',
    surfaceHigh:    '#e2eaf3',
    surfaceHighest: '#d8e4ef',
    ghost:    'rgba(15,23,42,0.10)',
    ghost20:  'rgba(15,23,42,0.16)',
    ghostSep: 'rgba(15,23,42,0.22)',
  },
};

const FORGE: AppTheme = {
  id: 'forge',
  name: 'Forge',
  description: 'Burnt copper on warm industrial cream',
  mode: 'light',
  preview: ['#c2410c', '#1e3a5f', '#166534'],
  colors: {
    mode: 'light',
    primary:        '#c2410c',
    primaryFixed:   '#ea580c',
    secondary:      '#1e3a5f',
    tertiary:       '#166534',
    error:          '#b91c1c',
    onSurface:      '#2c1a08',
    onSurfaceVar:   '#5c3d1e',
    outline:        '#7c6040',
    outlineVar:     '#d4b896',
    surfaceLowest:  '#fdfaf7',
    surface:        '#faf5ef',
    surfaceContainer: '#f3ebe0',
    surfaceHigh:    '#e9e0d0',
    surfaceHighest: '#dfd4bf',
    ghost:    'rgba(100,60,20,0.12)',
    ghost20:  'rgba(100,60,20,0.18)',
    ghostSep: 'rgba(100,60,20,0.25)',
  },
};

const SAGE: AppTheme = {
  id: 'sage',
  name: 'Sage',
  description: 'Forest green & violet on soft mint white',
  mode: 'light',
  preview: ['#15803d', '#7e22ce', '#c2410c'],
  colors: {
    mode: 'light',
    primary:        '#15803d',
    primaryFixed:   '#16a34a',
    secondary:      '#7e22ce',
    tertiary:       '#c2410c',
    error:          '#b91c1c',
    onSurface:      '#0d1f0d',
    onSurfaceVar:   '#2d4a2d',
    outline:        '#4a6a4a',
    outlineVar:     '#b8d4b8',
    surfaceLowest:  '#ffffff',
    surface:        '#f4f7f4',
    surfaceContainer: '#eaf1ea',
    surfaceHigh:    '#dde9dd',
    surfaceHighest: '#d0e1d0',
    ghost:    'rgba(20,60,20,0.10)',
    ghost20:  'rgba(20,60,20,0.16)',
    ghostSep: 'rgba(20,60,20,0.22)',
  },
};

export const APP_THEMES: readonly AppTheme[] = [
  KINETIC_MONOLITH,
  VOID_VIOLET,
  CRIMSON_CORE,
  PHOSPHOR,
  BLUEPRINT,
  ARCTIC,
  FORGE,
  SAGE,
];

export const DEFAULT_THEME_ID = 'kinetic-monolith';

export function getThemeById(id: string): AppTheme {
  return APP_THEMES.find(t => t.id === id) ?? KINETIC_MONOLITH;
}

// ─── MUI Theme builder ────────────────────────────────────────────────────────

export function buildMuiTheme(appTheme: AppTheme): Theme {
  const c = appTheme.colors;
  const isDark = c.mode === 'dark';

  const ambientShadow = isDark
    ? `0 24px 48px rgba(${hexCh(c.primaryFixed)},0.08)`
    : `0 8px 24px rgba(0,0,0,0.10)`;
  const buttonGlow = `0 0 8px rgba(${hexCh(c.primaryFixed)},0.4)`;

  // Shared structural overrides (font, shape — not color)
  const buttonBase = {
    root: { borderRadius: 4, padding: '6px 14px', boxShadow: 'none', fontWeight: 600, fontSize: '0.8125rem', letterSpacing: '0.03em', '&:hover': { boxShadow: 'none' } },
    sizeSmall: { padding: '4px 10px', fontSize: '0.75rem' },
  };
  const chipBase = {
    root: { borderRadius: 2, fontWeight: 500, height: 22, fontSize: '0.6875rem' },
    sizeSmall: { height: 20, fontSize: '0.625rem' },
  };
  const tableCellBase = {
    root: { padding: '6px 12px', fontSize: '0.8125rem' },
    head: { fontWeight: 600, fontSize: '0.6875rem', letterSpacing: '0.05em', textTransform: 'uppercase' as const },
  };

  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: {
        main:  c.primary,
        light: c.primaryFixed,
        dark:  c.primaryFixed,
        contrastText: isDark ? c.surfaceLowest : '#ffffff',
      },
      secondary: {
        main:  c.secondary,
        light: c.secondary,
        dark:  c.secondary,
        contrastText: isDark ? '#000000' : '#ffffff',
      },
      error: {
        main: c.error,
        dark: isDark ? '#93000a' : '#b91c1c',
      },
      warning: {
        main: c.tertiary,
        light: c.tertiary,
        dark: c.tertiary,
        contrastText: isDark ? '#000' : '#fff',
      },
      info: {
        main: c.primaryFixed,
        light: c.primary,
        dark: c.primaryFixed,
      },
      success: {
        main: c.secondary,
        light: c.secondary,
        dark: c.secondary,
        contrastText: '#000',
      },
      background: {
        default: c.surface,
        paper:   c.surfaceContainer,
      },
      text: {
        primary:   c.onSurface,
        secondary: c.onSurfaceVar,
        disabled:  c.outline,
      },
      divider: c.ghost,
      action: {
        active:             c.onSurface,
        hover:              `rgba(${hexCh(c.primaryFixed)},0.04)`,
        selected:           `rgba(${hexCh(c.primaryFixed)},0.08)`,
        disabled:           isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.26)',
        disabledBackground: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
      },
      custom: c,
    },

    typography: {
      fontFamily: FONT_BODY,
      h1: { fontFamily: FONT_HEADLINE, fontSize: '2rem',     fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em' },
      h2: { fontFamily: FONT_HEADLINE, fontSize: '1.5rem',   fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em' },
      h3: { fontFamily: FONT_HEADLINE, fontSize: '1.25rem',  fontWeight: 600, lineHeight: 1.4 },
      h4: { fontFamily: FONT_HEADLINE, fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.4 },
      h5: { fontFamily: FONT_HEADLINE, fontSize: '1rem',     fontWeight: 600, lineHeight: 1.5 },
      h6: { fontFamily: FONT_HEADLINE, fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.6, letterSpacing: '0.02em', textTransform: 'uppercase' },
      subtitle1: { fontFamily: FONT_BODY, fontSize: '0.9375rem', fontWeight: 500 },
      subtitle2: { fontFamily: FONT_BODY, fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' },
      body1:  { fontFamily: FONT_BODY, fontSize: '0.875rem',  lineHeight: 1.6 },
      body2:  { fontFamily: FONT_BODY, fontSize: '0.8125rem', lineHeight: 1.5 },
      caption:{ fontFamily: FONT_BODY, fontSize: '0.6875rem', lineHeight: 1.4, letterSpacing: '0.05em', textTransform: 'uppercase' },
      button: { fontFamily: FONT_BODY, textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', letterSpacing: '0.03em' },
      overline:{ fontFamily: FONT_MONO, fontSize: '0.625rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' },
    },

    shape: { borderRadius: 4 },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            fontFeatureSettings: '"tnum"',
            backgroundColor: c.surface,
            color: c.onSurface,
          },
        },
      },

      MuiButton: {
        styleOverrides: {
          ...buttonBase,
          contained: {
            boxShadow: 'none',
            background: isDark
              ? `linear-gradient(135deg, ${c.primary} 0%, ${c.primaryFixed} 100%)`
              : c.primary,
            color: isDark ? c.surfaceLowest : '#ffffff',
            '&:hover': {
              boxShadow: buttonGlow,
              background: isDark
                ? `linear-gradient(135deg, ${c.primaryFixed} 0%, ${c.primary} 100%)`
                : c.primaryFixed,
            },
          },
          outlined: {
            borderColor: c.ghost20,
            color: c.primary,
            '&:hover': {
              borderColor: c.ghostSep,
              backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.05)`,
            },
          },
          text: {
            color: c.primary,
            '&:hover': { backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.05)` },
          },
        },
      },

      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            boxShadow: 'none',
            border: `1px solid ${c.ghost}`,
            backgroundColor: c.surfaceContainer,
            backgroundImage: 'none',
          },
        },
      },

      MuiPaper: {
        styleOverrides: {
          root: { borderRadius: 4, backgroundImage: 'none', backgroundColor: c.surfaceContainer },
          elevation1: { boxShadow: 'none', border: `1px solid ${c.ghost}`, backgroundColor: c.surfaceContainer },
          elevation2: { boxShadow: ambientShadow, border: `1px solid ${c.ghost}`, backgroundColor: c.surfaceHigh },
          elevation3: { boxShadow: ambientShadow, border: `1px solid ${c.ghost}`, backgroundColor: c.surfaceHighest },
        },
      },

      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 4,
              backgroundColor: c.surfaceLowest,
              fontFamily: FONT_MONO,
              '& fieldset': { borderColor: c.ghost },
              '&:hover fieldset': { borderColor: c.ghost20 },
              '&.Mui-focused fieldset': { borderColor: c.primary, borderWidth: '1.5px' },
            },
            '& .MuiInputLabel-root': { color: c.outline, fontFamily: FONT_BODY, fontSize: '0.8125rem' },
            '& .MuiInputLabel-root.Mui-focused': { color: c.primary },
            '& .MuiInputBase-input': { color: c.onSurface },
          },
        },
      },

      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '& fieldset': { borderColor: c.ghost },
            '&:hover fieldset': { borderColor: c.ghost20 },
            '&.Mui-focused fieldset': { borderColor: c.primary },
          },
        },
      },

      MuiChip: {
        styleOverrides: {
          ...chipBase,
          root: { ...chipBase.root, backgroundColor: c.surfaceHigh, color: c.onSurface },
          outlined: { borderColor: c.ghost20, color: c.onSurfaceVar },
          colorPrimary: {
            backgroundColor: `rgba(${hexCh(c.primary)},0.12)`,
            color: c.primary,
            border: `1px solid rgba(${hexCh(c.primary)},0.25)`,
          },
          colorSuccess: {
            backgroundColor: `rgba(${hexCh(c.secondary)},0.12)`,
            color: c.secondary,
            border: `1px solid rgba(${hexCh(c.secondary)},0.25)`,
          },
          colorWarning: {
            backgroundColor: `rgba(${hexCh(c.tertiary)},0.12)`,
            color: c.tertiary,
            border: `1px solid rgba(${hexCh(c.tertiary)},0.25)`,
          },
          colorError: {
            backgroundColor: `rgba(${hexCh(c.error)},0.12)`,
            color: c.error,
            border: `1px solid rgba(${hexCh(c.error)},0.25)`,
          },
        },
      },

      MuiTableCell: {
        styleOverrides: {
          ...tableCellBase,
          root: { ...tableCellBase.root, borderBottom: `1px solid ${c.ghost}`, color: c.onSurface, fontFamily: FONT_MONO, fontSize: '0.8125rem' },
          head: { ...tableCellBase.head, color: c.onSurfaceVar, backgroundColor: isDark ? c.surfaceLowest : c.surfaceHighest, fontFamily: FONT_BODY, borderBottom: `1px solid ${c.ghost20}` },
        },
      },

      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': { backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.03)` },
          },
        },
      },

      MuiTab: {
        styleOverrides: {
          root: {
            fontFamily: FONT_BODY, fontSize: '0.75rem', fontWeight: 500,
            letterSpacing: '0.02em', textTransform: 'none' as const, minHeight: 36, padding: '6px 16px',
            color: c.outline,
            '&.Mui-selected': { color: c.primary },
            '&:hover': { color: c.primary, opacity: 1 },
          },
        },
      },

      MuiTabs: {
        styleOverrides: {
          indicator: { height: 2, backgroundColor: c.primary },
          root: { borderBottom: `1px solid ${c.ghost}` },
        },
      },

      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 4, fontSize: '0.8125rem', border: '1px solid' },
          standardSuccess: {
            backgroundColor: `rgba(${hexCh(c.secondary)},0.08)`,
            borderColor: `rgba(${hexCh(c.secondary)},0.25)`,
            color: c.secondary,
          },
          standardError: {
            backgroundColor: `rgba(${hexCh(c.error)},0.10)`,
            borderColor: `rgba(${hexCh(c.error)},0.30)`,
            color: c.error,
          },
          standardWarning: {
            backgroundColor: `rgba(${hexCh(c.tertiary)},0.08)`,
            borderColor: `rgba(${hexCh(c.tertiary)},0.25)`,
            color: c.tertiary,
          },
          standardInfo: {
            backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.08)`,
            borderColor: `rgba(${hexCh(c.primaryFixed)},0.25)`,
            color: c.primary,
          },
        },
      },

      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&.Mui-selected': {
              backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.07)`,
              borderLeft: `3px solid ${c.primary}`,
              paddingLeft: '13px',
              '&:hover': { backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.11)` },
            },
            '&:hover': { backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.04)` },
          },
        },
      },

      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontFamily: FONT_BODY, fontSize: '0.6875rem', borderRadius: 4,
            backgroundColor: c.surfaceLowest,
            border: `1px solid ${c.ghost20}`,
            color: c.onSurface,
            boxShadow: ambientShadow,
          },
          arrow: { color: c.surfaceLowest },
        },
      },

      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 8, backgroundColor: c.surfaceContainer,
            border: `1px solid ${c.ghost}`, boxShadow: ambientShadow, backgroundImage: 'none',
          },
        },
      },

      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontFamily: FONT_HEADLINE, fontSize: '1rem', fontWeight: 600,
            color: c.onSurface, borderBottom: `1px solid ${c.ghost}`, paddingBottom: '12px',
          },
        },
      },

      MuiDialogContent: {
        styleOverrides: { root: { backgroundColor: c.surfaceContainer } },
      },

      MuiDialogActions: {
        styleOverrides: {
          root: { borderTop: `1px solid ${c.ghost}`, backgroundColor: isDark ? c.surfaceLowest : c.surfaceHighest, padding: '12px 24px' },
        },
      },

      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? `rgba(${hexCh(c.surfaceHighest)},0.88)` : c.surfaceLowest,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${c.ghost}`, borderRadius: 4, boxShadow: ambientShadow, backgroundImage: 'none',
          },
        },
      },

      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: '0.8125rem', fontFamily: FONT_BODY, color: c.onSurface,
            '&:hover': { backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.06)` },
            '&.Mui-selected': { backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.10)`, color: c.primary },
            '&.Mui-selected:hover': { backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.14)` },
          },
        },
      },

      MuiSelect: { styleOverrides: { icon: { color: c.outline } } },

      MuiSwitch: {
        styleOverrides: {
          switchBase: {
            '&.Mui-checked': { color: c.primary },
            '&.Mui-checked + .MuiSwitch-track': { backgroundColor: c.primaryFixed },
          },
          track: { backgroundColor: c.outlineVar, opacity: 1 },
        },
      },

      MuiDivider: { styleOverrides: { root: { borderColor: c.ghost } } },

      MuiInputBase: {
        styleOverrides: {
          root: { fontFamily: FONT_MONO, fontSize: '0.8125rem', color: c.onSurface },
          input: { '&::placeholder': { color: c.outline, opacity: 1 } },
        },
      },

      MuiFormLabel: {
        styleOverrides: {
          root: { color: c.outline, fontFamily: FONT_BODY, fontSize: '0.8125rem', '&.Mui-focused': { color: c.primary } },
        },
      },

      MuiIconButton: {
        styleOverrides: {
          root: {
            color: c.onSurfaceVar, borderRadius: 4,
            '&:hover': { backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.07)`, color: c.primary },
          },
        },
      },

      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: c.surfaceContainer, borderRight: `1px solid ${c.ghost}`, backgroundImage: 'none' },
        },
      },

      MuiAppBar: {
        styleOverrides: {
          root: { backgroundColor: isDark ? c.surfaceLowest : c.surfaceLowest, borderBottom: `1px solid ${c.ghost}`, boxShadow: 'none', backgroundImage: 'none' },
        },
      },

      MuiPopover: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? `rgba(${hexCh(c.surfaceHighest)},0.88)` : c.surfaceLowest,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${c.ghost}`, borderRadius: 4, boxShadow: ambientShadow, backgroundImage: 'none',
          },
        },
      },

      MuiAccordion: {
        styleOverrides: {
          root: {
            backgroundColor: c.surfaceContainer, border: `1px solid ${c.ghost}`,
            boxShadow: 'none', backgroundImage: 'none',
            '&:before': { display: 'none' },
            '&.Mui-expanded': { backgroundColor: c.surfaceHigh },
          },
        },
      },

      MuiAccordionSummary: {
        styleOverrides: {
          root: { borderBottom: `1px solid ${c.ghost}`, '&.Mui-expanded': { borderBottom: `1px solid ${c.ghost20}` } },
          expandIconWrapper: { color: c.outline },
        },
      },

      MuiSlider: {
        styleOverrides: {
          track: { background: `linear-gradient(90deg, ${c.primary} 0%, ${c.primaryFixed} 100%)`, border: 'none' },
          rail: { backgroundColor: c.outlineVar, opacity: 1 },
          thumb: {
            backgroundColor: c.primary, border: `2px solid ${c.surfaceContainer}`,
            '&:hover, &.Mui-focusVisible': { boxShadow: `0 0 0 8px rgba(${hexCh(c.primary)},0.12)` },
          },
          mark: { backgroundColor: c.outlineVar },
          markActive: { backgroundColor: c.primaryFixed },
        },
      },

      MuiLinearProgress: {
        styleOverrides: {
          root: { backgroundColor: c.outlineVar, borderRadius: 2, height: 4 },
          bar: { background: `linear-gradient(90deg, ${c.primary} 0%, ${c.primaryFixed} 100%)`, borderRadius: 2 },
        },
      },

      MuiCircularProgress: {
        styleOverrides: { circle: { strokeLinecap: 'round' } },
      },

      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            backgroundColor: c.surfaceHighest, border: `1px solid ${c.ghost}`,
            borderRadius: 4, color: c.onSurface, boxShadow: ambientShadow,
          },
        },
      },

      MuiBadge: {
        styleOverrides: {
          badge: { fontFamily: FONT_MONO, fontSize: '0.625rem', fontWeight: 600, minWidth: 16, height: 16, borderRadius: 2 },
        },
      },

      MuiListItem: {
        styleOverrides: { root: { color: c.onSurface } },
      },

      MuiListItemText: {
        styleOverrides: {
          primary: { fontSize: '0.8125rem', color: c.onSurface, fontFamily: FONT_BODY },
          secondary: { fontSize: '0.6875rem', color: c.onSurfaceVar, fontFamily: FONT_BODY },
        },
      },

      MuiListItemIcon: {
        styleOverrides: { root: { color: c.onSurfaceVar, minWidth: 36 } },
      },

      MuiSkeleton: {
        styleOverrides: {
          root: {
            backgroundColor: c.surfaceHigh,
            '&::after': { background: `linear-gradient(90deg, transparent, rgba(${hexCh(c.primaryFixed)},0.04), transparent)` },
          },
        },
      },

      MuiStepLabel: {
        styleOverrides: {
          label: {
            fontFamily: FONT_BODY, fontSize: '0.8125rem', color: c.outline,
            '&.Mui-active': { color: c.primary },
            '&.Mui-completed': { color: c.secondary },
          },
        },
      },

      MuiStepIcon: {
        styleOverrides: {
          root: {
            color: c.outlineVar,
            '&.Mui-active': { color: c.primary },
            '&.Mui-completed': { color: c.secondary },
          },
        },
      },

      MuiBreadcrumbs: {
        styleOverrides: {
          root: { fontSize: '0.75rem', color: c.onSurfaceVar },
          separator: { color: c.outline },
        },
      },

      MuiPaginationItem: {
        styleOverrides: {
          root: {
            borderRadius: 2, color: c.onSurfaceVar,
            '&.Mui-selected': {
              backgroundColor: `rgba(${hexCh(c.primary)},0.12)`,
              color: c.primary,
              border: `1px solid rgba(${hexCh(c.primary)},0.25)`,
            },
          },
        },
      },

      MuiToggleButton: {
        styleOverrides: {
          root: {
            borderRadius: 4, borderColor: c.ghost20, color: c.onSurfaceVar,
            fontSize: '0.75rem', fontFamily: FONT_BODY,
            '&.Mui-selected': {
              backgroundColor: `rgba(${hexCh(c.primary)},0.12)`, color: c.primary,
              borderColor: `rgba(${hexCh(c.primary)},0.25)`,
              '&:hover': { backgroundColor: `rgba(${hexCh(c.primary)},0.16)` },
            },
            '&:hover': { backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.05)` },
          },
        },
      },

      MuiCheckbox: {
        styleOverrides: {
          root: { color: c.outline, borderRadius: 2, '&.Mui-checked': { color: c.primary } },
        },
      },

      MuiRadio: {
        styleOverrides: {
          root: { color: c.outline, '&.Mui-checked': { color: c.primary } },
        },
      },

      MuiAutocomplete: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? `rgba(${hexCh(c.surfaceHighest)},0.88)` : c.surfaceLowest,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${c.ghost}`, borderRadius: 4, boxShadow: ambientShadow,
          },
          option: {
            fontSize: '0.8125rem', fontFamily: FONT_BODY,
            '&[aria-selected="true"]': { backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.10)`, color: c.primary },
            '&:hover': { backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.06)` },
          },
          noOptions: { fontSize: '0.8125rem', color: c.outline, fontFamily: FONT_BODY },
          tag: { backgroundColor: c.surfaceHigh, color: c.onSurface },
          clearIndicator: {
            color: c.outline,
            '&:hover': { color: c.primary, backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.06)` },
          },
          popupIndicator: {
            color: c.outline,
            '&:hover': { color: c.primary, backgroundColor: `rgba(${hexCh(c.primaryFixed)},0.06)` },
          },
        },
      },
    },
  });
}

// ─── Utility: hex → "R,G,B" channel string for rgba() ────────────────────────
export function hexCh(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return `${r},${g},${b}`;
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}
