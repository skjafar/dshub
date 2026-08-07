import { describe, it, expect } from 'vitest';
import {
  APP_THEMES,
  DEFAULT_THEME_ID,
  LEGACY_THEME_IDS,
  getThemeById,
  resolveThemeId,
} from '../../appThemes';
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

describe('theme roster', () => {
  it('offers exactly one dark theme and one light theme', () => {
    // Four themes multiplied the cost of every visual change by four while
    // giving an operator a choice they did not need. The roster is now the two
    // faces of one language: a dim cabinet and a sunlit floor.
    expect(APP_THEMES.filter(t => t.mode === 'dark')).toHaveLength(1);
    expect(APP_THEMES.filter(t => t.mode === 'light')).toHaveLength(1);
  });

  it('defaults to the dark theme', () => {
    expect(getThemeById(DEFAULT_THEME_ID).mode).toBe('dark');
  });
});

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

  it('renders every accent legibly on every surface it is published on', () => {
    // All three accents are published as custom properties, so any of them can
    // end up as text on any surface. Checking only `primary` on only
    // `surfaceContainer` let a light-theme secondary and tertiary ship at 3.6:1
    // and 3.55:1 on the deeper surfaces.
    for (const theme of APP_THEMES) {
      const c = theme.colors;
      for (const accent of ['primary', 'primaryFixed', 'secondary', 'tertiary'] as const) {
        for (const bg of [c.surfaceLowest, c.surface, c.surfaceContainer, c.surfaceHigh, c.surfaceHighest]) {
          expect(contrastRatio(c[accent], bg), `${theme.id} ${accent} on ${bg}`)
            .toBeGreaterThanOrEqual(AA_NORMAL);
        }
      }
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

describe('dockview surfaces (third-party-drawn)', () => {
  // Mirrors the `--dv-*` mapping in `Workspace.module.css`. Dockview paints its
  // own tab strip and context menu from these custom properties rather than
  // shipping a palette of its own, so the specific pairs it actually renders
  // are pinned here explicitly rather than left to be covered incidentally by
  // the generic surface sweep above. Keep the two files in sync.
  it('reads the active tab and the context menu (onSurface on surfaceHigh)', () => {
    for (const theme of APP_THEMES) {
      const c = theme.colors;
      expect(contrastRatio(c.onSurface, c.surfaceHigh), `${theme.id} onSurface on surfaceHigh`)
        .toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('reads inactive and background tabs (onSurfaceVar on surfaceContainer)', () => {
    for (const theme of APP_THEMES) {
      const c = theme.colors;
      expect(contrastRatio(c.onSurfaceVar, c.surfaceContainer), `${theme.id} onSurfaceVar on surfaceContainer`)
        .toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

describe('focus ring', () => {
  it('clears non-text contrast against every surface it can outline', () => {
    // `--focus-ring` is `primary` (themeVariables.ts), drawn as a 2px outline —
    // a UI component boundary, not text, so WCAG 1.4.11's 3:1 is the bar, not
    // 4.5:1. Asserted directly rather than inferred from the stricter
    // text-contrast check above: the two exist for different reasons and
    // either could relax independently of the other.
    for (const theme of APP_THEMES) {
      const c = theme.colors;
      for (const bg of [c.surfaceLowest, c.surface, c.surfaceContainer, c.surfaceHigh, c.surfaceHighest]) {
        expect(contrastRatio(c.primary, bg), `${theme.id} focus ring on ${bg}`)
          .toBeGreaterThanOrEqual(AA_NON_TEXT);
      }
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

  it('lands a retired theme on a survivor of its own mode', () => {
    // An upgrade must not throw someone working on a sunlit floor into a dark
    // theme. The retired ids and the mode each was.
    const retiredMode: Readonly<Record<string, 'dark' | 'light'>> = {
      'crimson-core': 'dark',
      'phosphor': 'dark',
      'void-violet': 'dark',
      'forge': 'light',
      'sage': 'light',
      'arctic': 'light',
    };
    for (const [legacy, mode] of Object.entries(retiredMode)) {
      expect(getThemeById(legacy).mode, `${legacy} was ${mode}`).toBe(mode);
    }
  });

  it('resolves a retired id in one hop, not a chain', () => {
    // `crimson-core` used to point at `void-violet`, which has itself been
    // retired. The lookup does not follow chains, so every retired id has to
    // name a live theme directly.
    for (const target of Object.values(LEGACY_THEME_IDS)) {
      expect(APP_THEMES.some(t => t.id === target), `${target} must be live`).toBe(true);
    }
  });

  it('falls back to the default for unknown or missing ids', () => {
    expect(resolveThemeId('does-not-exist')).toBe(DEFAULT_THEME_ID);
    expect(resolveThemeId(undefined)).toBe(DEFAULT_THEME_ID);
  });
});
