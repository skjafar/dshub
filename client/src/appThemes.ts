import { StatusColors, statusColors } from './design/status';
import { hexCh } from './design/contrast';

export { hexCh };

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
    colors: { ...palette, status },
  };
}

// ─── Theme definitions ────────────────────────────────────────────────────────
// Two themes: one dark, one light. They are the two faces of one visual
// language, not two languages — the light palette is the tonal counterpart of
// the dark one, holding the same cyan/lime/gold accent family at the lightness
// a light surface needs. Four themes multiplied the cost of every visual change
// by four and offered an operator a choice they did not need; the only choice
// that carries information is dim cabinet or sunlit floor.
//
// Themes removed in the 0.3 overhaul (Crimson Core, Phosphor, Forge, Sage) and
// in this rebuild (Void Violet, Arctic) are remapped by `LEGACY_THEME_IDS`.

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

/**
 * The light face of the same language.
 *
 * The accents are the cyan/lime/gold family of the dark theme taken to the
 * lightness a light surface needs, rather than a different palette wearing the
 * same layout — the two themes should read as one instrument under two lighting
 * conditions. Every accent here is chosen at the darkest value that still reads
 * as its hue, because the bar is 4.5:1 against `surfaceContainer`, and the
 * obvious brighter picks all fail it.
 */
const BLUEPRINT = defineTheme(
  {
    id: 'blueprint',
    name: 'Blueprint',
    description: 'Deep cyan on cool light paper',
    preview: ['#155e75', '#3f6212', '#7a5200'],
  },
  {
    mode: 'light',
    // Every accent is published as a token, so any of them can end up as text on
    // any surface. These are darker than the obvious cyan-700/lime-700/yellow-700
    // picks, which read well on white and then fail AA around 3.6:1 on
    // `surfaceHighest` — the deepest surface a light theme has.
    primary:        '#155e75',
    // The dim variant darkens rather than lightens here: on light paper a hover
    // state that got brighter would read as receding rather than responding.
    primaryFixed:   '#164e63',
    secondary:      '#3f6212',
    tertiary:       '#7a5200',
    onSurface:      '#0f1b2d',
    onSurfaceVar:   '#3f5165',
    outline:        '#5b6b7d',
    outlineVar:     '#c8d4e0',
    surfaceLowest:  '#ffffff',
    surface:        '#f4f7fa',
    surfaceContainer: '#eaeff5',
    surfaceHigh:    '#dee6ef',
    surfaceHighest: '#d2dce8',
    ghost:    'rgba(20,45,75,0.12)',
    ghost20:  'rgba(20,45,75,0.18)',
    ghostSep: 'rgba(20,45,75,0.26)',
  }
);

export const APP_THEMES: readonly AppTheme[] = [
  KINETIC_MONOLITH,
  BLUEPRINT,
];

export const DEFAULT_THEME_ID = 'kinetic-monolith';

/**
 * Retired themes, mapped to the survivor of their own mode so a saved
 * preference lands somewhere deliberate instead of silently defaulting — and,
 * more importantly, so a user who chose a light theme is not thrown into a dark
 * one by an upgrade.
 *
 * Retired in the 0.3 overhaul: Crimson Core, Phosphor, Forge, Sage. Retired in
 * the interface rebuild: Void Violet (dark), Arctic (light). Crimson Core and
 * Void Violet chain — `crimson-core` resolved to `void-violet`, which is itself
 * gone now — so both are listed against their final destination rather than
 * relying on the lookup following a chain, which it does not do.
 */
export const LEGACY_THEME_IDS: Readonly<Record<string, string>> = {
  'crimson-core': 'kinetic-monolith',
  'phosphor': 'kinetic-monolith',
  'void-violet': 'kinetic-monolith',
  'forge': 'blueprint',
  'sage': 'blueprint',
  'arctic': 'blueprint',
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
