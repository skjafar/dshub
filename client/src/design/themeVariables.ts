/**
 * The one place design tokens become CSS custom properties.
 *
 * Every stylesheet in the application — first-party CSS Modules and any
 * third-party library themed by custom properties alike — reads the active
 * theme through these names. That is the whole mechanism: no component imports
 * a palette, and changing the visual language means changing what this function
 * returns rather than touching the components that consume it.
 *
 * Structural tokens are published alongside colour, on purpose. A library
 * following our theme needs spacing and type as much as it needs hues, and
 * splitting the two across separate mechanisms would give it two things to
 * follow instead of one.
 */

import type { AppTheme } from '../appThemes';
import { alphaOf } from './contrast';
import {
  CONTROL_HEIGHT,
  DURATION,
  EASING,
  FOCUS_RING_WIDTH,
  FONT_BODY,
  FONT_HEADLINE,
  FONT_MONO,
  HEADER_HEIGHT,
  LEADING,
  RADIUS,
  ROW_HEIGHT,
  SPACE,
  TEXT,
  TRACKING,
  WEIGHT,
} from './tokens';

/** A map of custom-property name to value, ready to set on an element. */
export type CssVariables = Readonly<Record<string, string>>;

export function themeCssVariables(theme: AppTheme): CssVariables {
  const c = theme.colors;

  return {
    // ── Surface hierarchy ────────────────────────────────────────────────────
    '--surface': c.surface,
    '--surface-lowest': c.surfaceLowest,
    '--surface-container': c.surfaceContainer,
    '--surface-container-high': c.surfaceHigh,
    '--surface-container-highest': c.surfaceHighest,

    // ── Text and outline ─────────────────────────────────────────────────────
    '--on-surface': c.onSurface,
    '--on-surface-variant': c.onSurfaceVar,
    '--outline': c.outline,
    '--outline-variant': c.outlineVar,

    // ── Brand accents. Chrome only — these never express a condition. ────────
    '--primary': c.primary,
    '--primary-dim': c.primaryFixed,
    '--secondary': c.secondary,
    '--tertiary': c.tertiary,

    // ── Ghost borders ────────────────────────────────────────────────────────
    '--ghost': c.ghost,
    '--ghost-20': c.ghost20,
    '--ghost-sep': c.ghostSep,

    // ── Status. Identical across every theme of a mode, by contract. ─────────
    '--status-ok': c.status.ok,
    '--status-warn': c.status.warn,
    '--status-error': c.status.error,
    '--status-info': c.status.info,
    '--status-idle': c.status.idle,

    // ── Derived washes ───────────────────────────────────────────────────────
    // Computed here rather than in a stylesheet because `color-mix` is not
    // available on every WebView this ships to.
    '--status-ok-wash': alphaOf(c.status.ok, 0.14),
    '--status-warn-wash': alphaOf(c.status.warn, 0.14),
    '--status-error-wash': alphaOf(c.status.error, 0.14),
    '--status-info-wash': alphaOf(c.status.info, 0.14),
    '--primary-wash': alphaOf(c.primary, 0.14),
    '--selection-bg': alphaOf(c.primary, 0.22),
    '--hud-bg': alphaOf(c.surfaceContainer, 0.72),
    // Derived from the theme's own ink rather than a literal, so a change to the
    // palette cannot leave the scrim behind on a colour nothing else uses.
    '--scrim': alphaOf(c.onSurface, c.mode === 'dark' ? 0.72 : 0.5),

    // ── Elevation ────────────────────────────────────────────────────────────
    // Depth in this interface is tonal, not shadow-based. The two exceptions are
    // things that genuinely float over other content, where a surface change
    // alone does not separate them. Both are tinted by the theme's ink rather
    // than pure black, which is what made them read as a dark-theme artefact
    // sitting on light paper.
    '--shadow-overlay': `0 8px 24px ${alphaOf(c.onSurface, c.mode === 'dark' ? 0.45 : 0.16)}`,
    '--shadow-dialog': `0 16px 48px ${alphaOf(c.onSurface, c.mode === 'dark' ? 0.55 : 0.22)}`,

    // ── Disabled ─────────────────────────────────────────────────────────────
    // One value, so "unavailable" reads the same on every control.
    '--disabled-opacity': '0.45',

    // ── Scrollbars ───────────────────────────────────────────────────────────
    '--scrollbar-thumb': c.ghostSep,
    '--scrollbar-thumb-hover': c.primaryFixed,

    // ── Focus ────────────────────────────────────────────────────────────────
    // One ring, one colour, everywhere. Focus that changes appearance per
    // surface is focus a keyboard user has to re-learn on every pane.
    '--focus-ring': c.primary,
    '--focus-ring-width': FOCUS_RING_WIDTH,

    // ── Type ─────────────────────────────────────────────────────────────────
    '--font-body': FONT_BODY,
    '--font-headline': FONT_HEADLINE,
    '--font-mono': FONT_MONO,

    '--text-2xs': TEXT['2xs'],
    '--text-xs': TEXT.xs,
    '--text-sm': TEXT.sm,
    '--text-base': TEXT.base,
    '--text-md': TEXT.md,
    '--text-lg': TEXT.lg,
    '--text-xl': TEXT.xl,
    '--text-2xl': TEXT['2xl'],

    '--leading-tight': LEADING.tight,
    '--leading-base': LEADING.base,
    '--leading-relaxed': LEADING.relaxed,

    '--weight-regular': WEIGHT.regular,
    '--weight-medium': WEIGHT.medium,
    '--weight-semibold': WEIGHT.semibold,
    '--weight-bold': WEIGHT.bold,

    '--tracking-tight': TRACKING.tight,
    '--tracking-base': TRACKING.base,
    '--tracking-wide': TRACKING.wide,

    // ── Density ──────────────────────────────────────────────────────────────
    '--space-3xs': SPACE['3xs'],
    '--space-2xs': SPACE['2xs'],
    '--space-xs': SPACE.xs,
    '--space-sm': SPACE.sm,
    '--space-md': SPACE.md,
    '--space-lg': SPACE.lg,
    '--space-xl': SPACE.xl,
    '--space-2xl': SPACE['2xl'],

    '--control-height-sm': CONTROL_HEIGHT.sm,
    '--control-height': CONTROL_HEIGHT.base,
    '--control-height-lg': CONTROL_HEIGHT.lg,
    '--row-height': ROW_HEIGHT,
    '--header-height': `${HEADER_HEIGHT}px`,

    // ── Geometry ─────────────────────────────────────────────────────────────
    '--radius-sharp': `${RADIUS.sharp}px`,
    '--radius-base': `${RADIUS.base}px`,
    '--radius-large': `${RADIUS.large}px`,

    // ── Motion ───────────────────────────────────────────────────────────────
    '--duration-instant': DURATION.instant,
    '--duration-base': DURATION.base,
    '--easing': EASING,

    // ── Engine-painted surfaces ──────────────────────────────────────────────
    // Scrollbars, form controls and the caret are drawn by the browser. Without
    // this they stay light-on-light in the dark theme.
    '--color-scheme': c.mode,
  };
}

/**
 * Publishes a theme onto an element, `document.documentElement` by default.
 *
 * `color-scheme` is set as a real property rather than only as a custom
 * property, because the engine reads the former and nothing reads the latter.
 */
export function applyThemeVariables(
  theme: AppTheme,
  root: HTMLElement = document.documentElement
): void {
  const vars = themeCssVariables(theme);
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = theme.colors.mode;
}
