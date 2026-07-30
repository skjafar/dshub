import { describe, it, expect } from 'vitest';
import { APP_THEMES, LEGACY_THEME_IDS, resolveThemeId, DEFAULT_THEME_ID } from '../../appThemes';
import { SERIES_DARK, SERIES_LIGHT, WIDGET_COLORS } from '../dataColors';
import { STATUS_DARK, STATUS_LIGHT } from '../status';
import { contrastRatio, hueDistance, AA_NORMAL, AA_NON_TEXT } from '../contrast';

/** Every surface a status colour can legibly land on, per mode. */
function surfacesFor(mode: 'dark' | 'light'): string[] {
  return APP_THEMES
    .filter(t => t.mode === mode)
    .flatMap(t => [
      t.colors.surface,
      t.colors.surfaceLowest,
      t.colors.surfaceContainer,
      t.colors.surfaceHigh,
      t.colors.surfaceHighest,
    ]);
}

describe('semantic status ramp', () => {
  it('reads as text on every dark surface in the roster', () => {
    for (const [role, color] of Object.entries(STATUS_DARK)) {
      for (const bg of surfacesFor('dark')) {
        expect(
          contrastRatio(color, bg),
          `status.${role} (${color}) on ${bg}`
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  });

  it('reads as text on every light surface in the roster', () => {
    for (const [role, color] of Object.entries(STATUS_LIGHT)) {
      for (const bg of surfacesFor('light')) {
        expect(
          contrastRatio(color, bg),
          `status.${role} (${color}) on ${bg}`
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  });

  it('separates ok / warn / error by hue', () => {
    // Distinguishability is a hue property, not a luminance one — two equally
    // bright colours can still be obviously different.
    //
    // 30° is the floor the light ramp can actually hold: pushing `warn` further
    // toward yellow raises hue separation but drops it below 4.5:1 on the darkest
    // light surface, and legibility wins. Warn and error are additionally
    // separated by lightness, and this UI never signals by colour alone —
    // every status carries a label or icon.
    const MIN_HUE_SEPARATION = 30;
    for (const ramp of [STATUS_DARK, STATUS_LIGHT]) {
      expect(hueDistance(ramp.ok, ramp.error)).toBeGreaterThanOrEqual(MIN_HUE_SEPARATION);
      expect(hueDistance(ramp.warn, ramp.error)).toBeGreaterThanOrEqual(MIN_HUE_SEPARATION);
      expect(hueDistance(ramp.ok, ramp.warn)).toBeGreaterThanOrEqual(MIN_HUE_SEPARATION);
      expect(hueDistance(ramp.info, ramp.ok)).toBeGreaterThanOrEqual(MIN_HUE_SEPARATION);
    }
  });

  it('is identical across every theme of the same mode', () => {
    // The whole point of the ramp: an operator's read of status must not change
    // meaning when the theme changes.
    for (const theme of APP_THEMES) {
      const expected = theme.mode === 'dark' ? STATUS_DARK : STATUS_LIGHT;
      expect(theme.colors.status).toEqual(expected);
    }
  });
});

describe('theme palettes', () => {
  it('renders body and secondary text legibly on their own surfaces', () => {
    for (const theme of APP_THEMES) {
      const c = theme.colors;
      for (const bg of [c.surface, c.surfaceContainer, c.surfaceHigh, c.surfaceHighest]) {
        expect(contrastRatio(c.onSurface, bg), `${theme.id} onSurface on ${bg}`)
          .toBeGreaterThanOrEqual(AA_NORMAL);
        expect(contrastRatio(c.onSurfaceVar, bg), `${theme.id} onSurfaceVar on ${bg}`)
          .toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  });

  it('renders the primary accent legibly on container surfaces', () => {
    for (const theme of APP_THEMES) {
      const c = theme.colors;
      expect(contrastRatio(c.primary, c.surfaceContainer), `${theme.id} primary`)
        .toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('does not let a theme accent collide with the error colour', () => {
    // Crimson Core was retired for exactly this: its primary CTA (#ff6b8a) and
    // its error state (#ffb4ab) sat ~10° apart in hue, so "confirm" read as
    // "danger". Any future theme must keep the two clearly separate.
    for (const theme of APP_THEMES) {
      expect(
        hueDistance(theme.colors.primary, theme.colors.status.error),
        `${theme.id} primary vs error`
      ).toBeGreaterThanOrEqual(60);
    }
  });
});

describe('data colours', () => {
  it('renders plot series legibly against their own mode', () => {
    for (const bg of surfacesFor('dark')) {
      for (const color of SERIES_DARK) {
        expect(contrastRatio(color, bg), `series ${color} on ${bg}`)
          .toBeGreaterThanOrEqual(AA_NON_TEXT);
      }
    }
    for (const bg of surfacesFor('light')) {
      for (const color of SERIES_LIGHT) {
        expect(contrastRatio(color, bg), `series ${color} on ${bg}`)
          .toBeGreaterThanOrEqual(AA_NON_TEXT);
      }
    }
  });

  it('keeps both series palettes the same length so slots stay aligned', () => {
    expect(SERIES_DARK.length).toBe(SERIES_LIGHT.length);
  });

  it('renders widget defaults legibly on both extremes', () => {
    // Widget colours are persisted user values, so a single literal must survive
    // the darkest and lightest surfaces in the roster.
    for (const [role, color] of Object.entries(WIDGET_COLORS)) {
      expect(contrastRatio(color, '#0b0d1a'), `widget.${role} on darkest`)
        .toBeGreaterThanOrEqual(AA_NON_TEXT);
      expect(contrastRatio(color, '#ffffff'), `widget.${role} on lightest`)
        .toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});

describe('theme id migration', () => {
  it('keeps known ids unchanged', () => {
    for (const theme of APP_THEMES) {
      expect(resolveThemeId(theme.id)).toBe(theme.id);
    }
  });

  it('maps every retired id to a surviving theme', () => {
    for (const [legacy, target] of Object.entries(LEGACY_THEME_IDS)) {
      expect(APP_THEMES.some(t => t.id === target), `${legacy} -> ${target}`).toBe(true);
      expect(resolveThemeId(legacy)).toBe(target);
    }
  });

  it('falls back to the default for unknown or missing ids', () => {
    expect(resolveThemeId('does-not-exist')).toBe(DEFAULT_THEME_ID);
    expect(resolveThemeId(undefined)).toBe(DEFAULT_THEME_ID);
  });
});
