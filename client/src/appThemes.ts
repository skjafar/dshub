import { createTheme, Theme } from '@mui/material/styles';
import {
  FONT_BODY,
  FONT_HEADLINE,
  FONT_MONO,
  RADIUS,
  HEADER_HEIGHT,
  buttonBase,
  chipBase,
  tableCellBase,
} from './design/tokens';
import { StatusColors, statusColors } from './design/status';
import { alphaOf, hexCh } from './design/contrast';

export { hexCh };

// ─── TypeScript augmentation ──────────────────────────────────────────────────
declare module '@mui/material/styles' {
  interface Palette {
    custom: AppThemeColors;
  }
  interface PaletteOptions {
    custom?: AppThemeColors;
  }
  interface TypographyVariants {
    label: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    label?: React.CSSProperties;
  }
}
declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    label: true;
  }
}

// ─── Token interface ──────────────────────────────────────────────────────────

/** The palette a theme author supplies. Status colour is added automatically. */
export interface AppThemePalette {
  readonly mode: 'dark' | 'light';
  // Accent — brand and chrome only. Never used to express status.
  readonly primary: string;
  readonly primaryFixed: string;  // dim variant — used for glows & alpha math
  readonly secondary: string;
  readonly tertiary: string;
  // Text
  readonly onSurface: string;
  readonly onSurfaceVar: string;
  readonly outline: string;
  readonly outlineVar: string;
  // Surface hierarchy (5 tiers)
  readonly surfaceLowest: string;    // deepest inset — text inputs
  readonly surface: string;          // base background
  readonly surfaceContainer: string; // cards / sections
  readonly surfaceHigh: string;      // elevated
  readonly surfaceHighest: string;   // top layer / overlays
  // Ghost borders
  readonly ghost: string;    // outline-variant, faint
  readonly ghost20: string;  // outline-variant, hover
  readonly ghostSep: string; // separator
}

export interface AppThemeColors extends AppThemePalette {
  /** Theme-invariant semantic status ramp. See `design/status.ts`. */
  readonly status: StatusColors;
  /** Alias of `status.error`, kept for call sites that read `custom.error`. */
  readonly error: string;
}

export interface AppTheme {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly mode: 'dark' | 'light';
  readonly preview: readonly [string, string, string]; // primary, secondary, tertiary
  readonly colors: AppThemeColors;
}

function defineTheme(
  meta: { id: string; name: string; description: string; preview: readonly [string, string, string] },
  palette: AppThemePalette
): AppTheme {
  const status = statusColors(palette.mode);
  return {
    ...meta,
    mode: palette.mode,
    colors: { ...palette, status, error: status.error },
  };
}

// ─── Theme definitions ────────────────────────────────────────────────────────
// Four curated themes: two dark, two light. Themes removed in the 0.3 overhaul
// (Crimson Core, Phosphor, Forge, Sage) are remapped by `LEGACY_THEME_IDS` below.

const KINETIC_MONOLITH = defineTheme(
  {
    id: 'kinetic-monolith',
    name: 'Kinetic Monolith',
    description: 'Industrial precision · Cyan on deep navy',
    preview: ['#00e5ff', '#75fd00', '#ffc938'],
  },
  {
    mode: 'dark',
    primary:        '#00e5ff',
    primaryFixed:   '#00daf3',
    secondary:      '#75fd00',
    tertiary:       '#ffc938',
    onSurface:      '#e5e2e1',
    onSurfaceVar:   '#bac9cc',
    outline:        '#849396',
    outlineVar:     '#1e3048',
    surfaceLowest:  '#060911',
    surface:        '#0b0d1a',
    surfaceContainer: '#0f1628',
    surfaceHigh:    '#141d32',
    surfaceHighest: '#1a243c',
    ghost:    'rgba(30,48,72,0.20)',
    ghost20:  'rgba(30,48,72,0.28)',
    ghostSep: 'rgba(30,48,72,0.45)',
  }
);

const VOID_VIOLET = defineTheme(
  {
    id: 'void-violet',
    name: 'Void Violet',
    description: 'Electric purple on cool deep space',
    preview: ['#c084fc', '#22d3ee', '#fb923c'],
  },
  {
    mode: 'dark',
    primary:        '#c084fc',
    primaryFixed:   '#a855f7',
    secondary:      '#22d3ee',
    tertiary:       '#fb923c',
    onSurface:      '#ede8f5',
    onSurfaceVar:   '#c4b8d8',
    outline:        '#8878aa',
    outlineVar:     '#3d3558',
    surfaceLowest:  '#09080f',
    surface:        '#0f0d18',
    surfaceContainer: '#191626',
    surfaceHigh:    '#231f33',
    surfaceHighest: '#2d2a40',
    ghost:    'rgba(80,60,130,0.18)',
    ghost20:  'rgba(80,60,130,0.26)',
    ghostSep: 'rgba(80,60,130,0.42)',
  }
);

const BLUEPRINT = defineTheme(
  {
    id: 'blueprint',
    name: 'Blueprint',
    description: 'Navy engineering blue on cool light paper',
    preview: ['#1d4ed8', '#0f766e', '#b45309'],
  },
  {
    mode: 'light',
    primary:        '#1d4ed8',
    primaryFixed:   '#2563eb',
    secondary:      '#0f766e',
    tertiary:       '#b45309',
    onSurface:      '#0f1b3d',
    onSurfaceVar:   '#3d4f7c',
    outline:        '#48607d',
    outlineVar:     '#c5d3e8',
    surfaceLowest:  '#ffffff',
    surface:        '#f0f4ff',
    surfaceContainer: '#e8eeff',
    surfaceHigh:    '#dde5f8',
    surfaceHighest: '#d1daf2',
    ghost:    'rgba(30,60,130,0.14)',
    ghost20:  'rgba(30,60,130,0.20)',
    ghostSep: 'rgba(30,60,130,0.28)',
  }
);

const ARCTIC = defineTheme(
  {
    id: 'arctic',
    name: 'Arctic',
    description: 'Sky blue & violet on bright white',
    preview: ['#0369a1', '#6d28d9', '#047857'],
  },
  {
    mode: 'light',
    // Darkened from #0284c7, which sat at ~3.9:1 on surfaceContainer and failed AA
    // for the small text and icons this colour is used for.
    primary:        '#0369a1',
    primaryFixed:   '#0284c7',
    secondary:      '#6d28d9',
    tertiary:       '#047857',
    onSurface:      '#0f172a',
    onSurfaceVar:   '#334155',
    outline:        '#5a6b80',
    outlineVar:     '#cbd5e1',
    surfaceLowest:  '#ffffff',
    surface:        '#f8fafc',
    surfaceContainer: '#f1f5f9',
    surfaceHigh:    '#e2eaf3',
    surfaceHighest: '#d8e4ef',
    ghost:    'rgba(15,23,42,0.10)',
    ghost20:  'rgba(15,23,42,0.16)',
    ghostSep: 'rgba(15,23,42,0.22)',
  }
);

export const APP_THEMES: readonly AppTheme[] = [
  KINETIC_MONOLITH,
  VOID_VIOLET,
  BLUEPRINT,
  ARCTIC,
];

export const DEFAULT_THEME_ID = 'kinetic-monolith';

/**
 * Themes retired in the 0.3 design overhaul, mapped to their nearest survivor so
 * a saved preference lands somewhere deliberate instead of silently defaulting.
 */
export const LEGACY_THEME_IDS: Readonly<Record<string, string>> = {
  'crimson-core': 'void-violet',
  'phosphor': 'kinetic-monolith',
  'forge': 'blueprint',
  'sage': 'arctic',
};

/** Resolves a stored theme id, following the legacy remap. */
export function resolveThemeId(id: string | undefined): string {
  if (!id) return DEFAULT_THEME_ID;
  if (APP_THEMES.some(t => t.id === id)) return id;
  return LEGACY_THEME_IDS[id] ?? DEFAULT_THEME_ID;
}

export function getThemeById(id: string): AppTheme {
  const resolved = resolveThemeId(id);
  return APP_THEMES.find(t => t.id === resolved) ?? KINETIC_MONOLITH;
}

// ─── MUI Theme builder ────────────────────────────────────────────────────────

export function buildMuiTheme(appTheme: AppTheme): Theme {
  const c = appTheme.colors;
  const s = c.status;
  const isDark = c.mode === 'dark';

  const ambientShadow = isDark
    ? `0 24px 48px ${alphaOf(c.primaryFixed, 0.08)}`
    : '0 8px 24px rgba(0,0,0,0.10)';
  const buttonGlow = `0 0 8px ${alphaOf(c.primaryFixed, 0.4)}`;

  // Contrast text for a filled status/accent chip.
  const onAccent = isDark ? c.surfaceLowest : '#ffffff';
  const onStatus = isDark ? '#0b0d1a' : '#ffffff';

  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: {
        main:  c.primary,
        light: c.primaryFixed,
        dark:  c.primaryFixed,
        contrastText: onAccent,
      },
      secondary: {
        main:  c.secondary,
        light: c.secondary,
        dark:  c.secondary,
        contrastText: onAccent,
      },
      // Semantic slots come from the theme-invariant ramp, never from accents.
      success: { main: s.ok,    light: s.ok,    dark: s.ok,    contrastText: onStatus },
      warning: { main: s.warn,  light: s.warn,  dark: s.warn,  contrastText: onStatus },
      error:   { main: s.error, light: s.error, dark: s.error, contrastText: onStatus },
      info:    { main: s.info,  light: s.info,  dark: s.info,  contrastText: onStatus },
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
        hover:              alphaOf(c.primaryFixed, 0.04),
        selected:           alphaOf(c.primaryFixed, 0.08),
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
      // `caption` carries dynamic content (timestamps, device names, helper text),
      // so it must not force uppercase. Use the explicit `label` variant for the
      // uppercase + tracked treatment.
      caption: { fontFamily: FONT_BODY, fontSize: '0.6875rem', lineHeight: 1.4 },
      label:   { fontFamily: FONT_BODY, fontSize: '0.6875rem', lineHeight: 1.4, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' },
      button:  { fontFamily: FONT_BODY, textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', letterSpacing: '0.03em' },
      overline:{ fontFamily: FONT_BODY, fontSize: '0.625rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' },
    },

    shape: { borderRadius: RADIUS.large },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            fontFeatureSettings: '"tnum"',
            backgroundColor: c.surface,
            color: c.onSurface,
          },
          // Every interactive element gets a visible keyboard focus ring.
          ':focus-visible': {
            outline: `2px solid ${c.primary}`,
            outlineOffset: '2px',
          },
        },
      },

      MuiTypography: {
        defaultProps: {
          variantMapping: { label: 'span' },
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
            color: onAccent,
            '&:hover': {
              boxShadow: buttonGlow,
              background: isDark
                ? `linear-gradient(135deg, ${c.primaryFixed} 0%, ${c.primary} 100%)`
                : c.primaryFixed,
            },
            '&.Mui-disabled': {
              background: c.surfaceHigh,
              color: c.outline,
            },
          },
          outlined: {
            borderColor: c.ghost20,
            color: c.primary,
            '&:hover': {
              borderColor: c.ghostSep,
              backgroundColor: alphaOf(c.primaryFixed, 0.05),
            },
          },
          text: {
            color: c.primary,
            '&:hover': { backgroundColor: alphaOf(c.primaryFixed, 0.05) },
          },
        },
      },

      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.large,
            boxShadow: 'none',
            border: `1px solid ${c.ghost20}`,
            backgroundColor: c.surfaceContainer,
            backgroundImage: 'none',
          },
        },
      },

      MuiPaper: {
        styleOverrides: {
          root: { borderRadius: RADIUS.base, backgroundImage: 'none', backgroundColor: c.surfaceContainer },
          elevation1: { boxShadow: 'none', border: `1px solid ${c.ghost}`, backgroundColor: c.surfaceContainer },
          elevation2: { boxShadow: ambientShadow, border: `1px solid ${c.ghost}`, backgroundColor: c.surfaceHigh },
          elevation3: { boxShadow: ambientShadow, border: `1px solid ${c.ghost}`, backgroundColor: c.surfaceHighest },
        },
      },

      MuiTextField: {
        // Suppress the WebView/browser saved-form-history dropdown ("Saved info").
        // Device write fields must show the live value only — a stale autofill
        // suggestion next to a register entry field is misleading and clickable.
        defaultProps: { autoComplete: 'off' },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: RADIUS.base,
              backgroundColor: c.surfaceLowest,
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
            backgroundColor: alphaOf(c.primary, 0.12),
            color: c.primary,
            border: `1px solid ${alphaOf(c.primary, 0.25)}`,
          },
          colorSuccess: {
            backgroundColor: alphaOf(s.ok, 0.12),
            color: s.ok,
            border: `1px solid ${alphaOf(s.ok, 0.25)}`,
          },
          colorWarning: {
            backgroundColor: alphaOf(s.warn, 0.12),
            color: s.warn,
            border: `1px solid ${alphaOf(s.warn, 0.25)}`,
          },
          colorError: {
            backgroundColor: alphaOf(s.error, 0.12),
            color: s.error,
            border: `1px solid ${alphaOf(s.error, 0.25)}`,
          },
          colorInfo: {
            backgroundColor: alphaOf(s.info, 0.12),
            color: s.info,
            border: `1px solid ${alphaOf(s.info, 0.25)}`,
          },
        },
      },

      MuiTableCell: {
        styleOverrides: {
          ...tableCellBase,
          // Decimal data aligns via tabular figures in the body face; true
          // monospace is reserved for hex/binary/packet columns, which opt in.
          root: {
            ...tableCellBase.root,
            borderBottom: `1px solid ${c.ghost}`,
            color: c.onSurface,
            fontFamily: FONT_BODY,
            fontVariantNumeric: 'tabular-nums',
            fontSize: '0.8125rem',
          },
          head: {
            ...tableCellBase.head,
            color: c.onSurfaceVar,
            backgroundColor: isDark ? c.surfaceLowest : c.surfaceHighest,
            fontFamily: FONT_BODY,
            borderBottom: `1px solid ${c.ghost20}`,
          },
        },
      },

      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': { backgroundColor: alphaOf(c.primaryFixed, 0.03) },
          },
        },
      },

      MuiTab: {
        styleOverrides: {
          root: {
            fontFamily: FONT_BODY, fontSize: '0.75rem', fontWeight: 500,
            letterSpacing: '0.02em', textTransform: 'none' as const,
            minHeight: 40, padding: '8px 16px',
            color: c.onSurfaceVar,
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
          root: { borderRadius: RADIUS.base, fontSize: '0.8125rem', border: '1px solid' },
          standardSuccess: {
            backgroundColor: alphaOf(s.ok, 0.10),
            borderColor: alphaOf(s.ok, 0.30),
            color: s.ok,
          },
          standardError: {
            backgroundColor: alphaOf(s.error, 0.10),
            borderColor: alphaOf(s.error, 0.30),
            color: s.error,
          },
          standardWarning: {
            backgroundColor: alphaOf(s.warn, 0.10),
            borderColor: alphaOf(s.warn, 0.30),
            color: s.warn,
          },
          standardInfo: {
            backgroundColor: alphaOf(s.info, 0.10),
            borderColor: alphaOf(s.info, 0.30),
            color: s.info,
          },
        },
      },

      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&.Mui-selected': {
              backgroundColor: alphaOf(c.primaryFixed, 0.07),
              borderLeft: `3px solid ${c.primary}`,
              paddingLeft: '13px',
              '&:hover': { backgroundColor: alphaOf(c.primaryFixed, 0.11) },
            },
            '&:hover': { backgroundColor: alphaOf(c.primaryFixed, 0.04) },
          },
        },
      },

      MuiTooltip: {
        defaultProps: {
          disableInteractive: true,
        },
        styleOverrides: {
          tooltip: {
            fontFamily: FONT_BODY, fontSize: '0.6875rem', borderRadius: RADIUS.base,
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
            borderRadius: RADIUS.large, backgroundColor: c.surfaceContainer,
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
            backgroundColor: isDark ? alphaOf(c.surfaceHighest, 0.88) : c.surfaceLowest,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${c.ghost}`, borderRadius: RADIUS.base, boxShadow: ambientShadow, backgroundImage: 'none',
          },
        },
      },

      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: '0.8125rem', fontFamily: FONT_BODY, color: c.onSurface,
            '&:hover': { backgroundColor: alphaOf(c.primaryFixed, 0.06) },
            '&.Mui-selected': { backgroundColor: alphaOf(c.primaryFixed, 0.10), color: c.primary },
            '&.Mui-selected:hover': { backgroundColor: alphaOf(c.primaryFixed, 0.14) },
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
          root: { fontFamily: FONT_BODY, fontSize: '0.8125rem', color: c.onSurface, fontVariantNumeric: 'tabular-nums' },
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
            color: c.onSurfaceVar, borderRadius: RADIUS.base,
            '&:hover': { backgroundColor: alphaOf(c.primaryFixed, 0.07), color: c.primary },
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
          root: { backgroundColor: c.surfaceLowest, borderBottom: `1px solid ${c.ghost}`, boxShadow: 'none', backgroundImage: 'none' },
        },
      },

      MuiToolbar: {
        styleOverrides: {
          // One header rhythm across the AppBar, drawer header and panel headers.
          // These previously disagreed (64px vs a forced 48px), so the nav list
          // never lined up with the top of the content area.
          root: {
            minHeight: HEADER_HEIGHT,
            '@media (min-width:600px)': { minHeight: HEADER_HEIGHT },
          },
          dense: { minHeight: HEADER_HEIGHT },
        },
      },

      MuiPopover: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? alphaOf(c.surfaceHighest, 0.88) : c.surfaceLowest,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${c.ghost}`, borderRadius: RADIUS.base, boxShadow: ambientShadow, backgroundImage: 'none',
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
            '&:hover, &.Mui-focusVisible': { boxShadow: `0 0 0 8px ${alphaOf(c.primary, 0.12)}` },
          },
          mark: { backgroundColor: c.outlineVar },
          markActive: { backgroundColor: c.primaryFixed },
        },
      },

      MuiLinearProgress: {
        styleOverrides: {
          root: { backgroundColor: c.outlineVar, borderRadius: RADIUS.sharp, height: 4 },
          bar: { background: `linear-gradient(90deg, ${c.primary} 0%, ${c.primaryFixed} 100%)`, borderRadius: RADIUS.sharp },
        },
      },

      MuiCircularProgress: {
        styleOverrides: { circle: { strokeLinecap: 'round' } },
      },

      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            backgroundColor: c.surfaceHighest, border: `1px solid ${c.ghost}`,
            borderRadius: RADIUS.base, color: c.onSurface, boxShadow: ambientShadow,
          },
        },
      },

      MuiBadge: {
        styleOverrides: {
          badge: { fontFamily: FONT_BODY, fontSize: '0.625rem', fontWeight: 600, minWidth: 16, height: 16, borderRadius: RADIUS.sharp },
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
            '&::after': { background: `linear-gradient(90deg, transparent, ${alphaOf(c.primaryFixed, 0.04)}, transparent)` },
          },
        },
      },

      MuiStepLabel: {
        styleOverrides: {
          label: {
            fontFamily: FONT_BODY, fontSize: '0.8125rem', color: c.outline,
            '&.Mui-active': { color: c.primary },
            '&.Mui-completed': { color: s.ok },
          },
        },
      },

      MuiStepIcon: {
        styleOverrides: {
          root: {
            color: c.outlineVar,
            '&.Mui-active': { color: c.primary },
            '&.Mui-completed': { color: s.ok },
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
            borderRadius: RADIUS.sharp, color: c.onSurfaceVar,
            '&.Mui-selected': {
              backgroundColor: alphaOf(c.primary, 0.12),
              color: c.primary,
              border: `1px solid ${alphaOf(c.primary, 0.25)}`,
            },
          },
        },
      },

      MuiToggleButton: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.base, borderColor: c.ghost20, color: c.onSurfaceVar,
            fontSize: '0.75rem', fontFamily: FONT_BODY,
            '&.Mui-selected': {
              backgroundColor: alphaOf(c.primary, 0.12), color: c.primary,
              borderColor: alphaOf(c.primary, 0.25),
              '&:hover': { backgroundColor: alphaOf(c.primary, 0.16) },
            },
            '&:hover': { backgroundColor: alphaOf(c.primaryFixed, 0.05) },
          },
        },
      },

      MuiCheckbox: {
        styleOverrides: {
          root: { color: c.outline, borderRadius: RADIUS.sharp, '&.Mui-checked': { color: c.primary } },
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
            backgroundColor: isDark ? alphaOf(c.surfaceHighest, 0.88) : c.surfaceLowest,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${c.ghost}`, borderRadius: RADIUS.base, boxShadow: ambientShadow,
          },
          option: {
            fontSize: '0.8125rem', fontFamily: FONT_BODY,
            '&[aria-selected="true"]': { backgroundColor: alphaOf(c.primaryFixed, 0.10), color: c.primary },
            '&:hover': { backgroundColor: alphaOf(c.primaryFixed, 0.06) },
          },
          noOptions: { fontSize: '0.8125rem', color: c.outline, fontFamily: FONT_BODY },
          tag: { backgroundColor: c.surfaceHigh, color: c.onSurface },
          clearIndicator: {
            color: c.outline,
            '&:hover': { color: c.primary, backgroundColor: alphaOf(c.primaryFixed, 0.06) },
          },
          popupIndicator: {
            color: c.outline,
            '&:hover': { color: c.primary, backgroundColor: alphaOf(c.primaryFixed, 0.06) },
          },
        },
      },
    },
  });
}
