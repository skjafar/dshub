import { describe, it, expect } from 'vitest';
import { APP_THEMES, getThemeById } from '../../appThemes';
import { themeCssVariables } from '../themeVariables';
import { STATUS_DARK, STATUS_LIGHT } from '../status';

const dark = getThemeById('kinetic-monolith');
const light = getThemeById('blueprint');

describe('theme custom properties', () => {
  it('names every property as a custom property', () => {
    for (const name of Object.keys(themeCssVariables(dark))) {
      expect(name, name).toMatch(/^--[a-z0-9-]+$/);
    }
  });

  it('publishes the same property set for every theme', () => {
    // Switching theme overwrites properties; it never removes them. A property
    // one theme publishes and another omits would keep the old theme's value
    // and quietly mix two palettes on screen.
    const expected = Object.keys(themeCssVariables(APP_THEMES[0])).sort();
    for (const theme of APP_THEMES) {
      expect(Object.keys(themeCssVariables(theme)).sort(), theme.id).toEqual(expected);
    }
  });

  it('never publishes an empty value', () => {
    for (const theme of APP_THEMES) {
      for (const [name, value] of Object.entries(themeCssVariables(theme))) {
        expect(value, `${theme.id} ${name}`).not.toBe('');
      }
    }
  });

  it('carries the theme\'s own colours', () => {
    expect(themeCssVariables(dark)['--surface']).toBe(dark.colors.surface);
    expect(themeCssVariables(light)['--surface']).toBe(light.colors.surface);
    expect(themeCssVariables(dark)['--primary']).toBe(dark.colors.primary);
  });

  it('carries the status ramp of the theme\'s mode, unchanged', () => {
    // The ramp is theme-invariant by mode. Publishing it per theme is what makes
    // a plain CSS rule able to read it without knowing which theme is active.
    expect(themeCssVariables(dark)['--status-ok']).toBe(STATUS_DARK.ok);
    expect(themeCssVariables(dark)['--status-error']).toBe(STATUS_DARK.error);
    expect(themeCssVariables(light)['--status-ok']).toBe(STATUS_LIGHT.ok);
    expect(themeCssVariables(light)['--status-error']).toBe(STATUS_LIGHT.error);
  });

  it('publishes the structural tokens, not only colour', () => {
    // This is the single mechanism third-party CSS-variable-themed libraries
    // follow, and they need spacing and type as much as they need colour.
    const vars = themeCssVariables(dark);
    for (const name of [
      '--text-base',
      '--text-2xl',
      '--leading-base',
      '--weight-semibold',
      '--tracking-wide',
      '--space-md',
      '--control-height',
      '--row-height',
      '--radius-base',
      '--header-height',
      '--duration-base',
      '--easing',
      '--focus-ring-width',
      '--font-body',
      '--font-mono',
    ]) {
      expect(vars[name], name).toBeTruthy();
    }
  });

  it('reports the colour scheme so native controls follow the theme', () => {
    // Scrollbars, form controls and the caret are painted by the engine, not by
    // us. Without this they stay light-on-light in the dark theme.
    expect(themeCssVariables(dark)['--color-scheme']).toBe('dark');
    expect(themeCssVariables(light)['--color-scheme']).toBe('light');
  });
});
