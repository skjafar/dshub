/**
 * WCAG 2.1 contrast utilities.
 *
 * Used both at runtime (to derive readable pairings) and by the theme test suite,
 * which asserts that every theme in the roster clears threshold for its text,
 * accent and status pairings. Several themes previously shipped combinations that
 * did not — Arctic's primary on its container sat around 3.9:1.
 */

/** Parses `#rgb` or `#rrggbb` into 0–255 channels. */
export function parseHex(hex: string): readonly [number, number, number] {
  const h = hex.replace('#', '').trim();
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ] as const;
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ] as const;
}

/** Hex → `"R,G,B"` for interpolation into `rgba()`. */
export function hexCh(hex: string): string {
  const [r, g, b] = parseHex(hex);
  return `${r},${g},${b}`;
}

/** `rgba()` string from a hex colour and an alpha in 0–1. */
export function alphaOf(hex: string, alpha: number): string {
  return `rgba(${hexCh(hex)},${alpha})`;
}

/** Relative luminance per WCAG 2.1. */
export function luminance(hex: string): number {
  const channels = parseHex(hex).map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Contrast ratio between two opaque colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA threshold. Large text is >=18.66px bold or >=24px regular. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
/** Minimum for non-text UI (borders, indicators) per WCAG 1.4.11. */
export const AA_NON_TEXT = 3;

export function meetsAA(fg: string, bg: string, large = false): boolean {
  return contrastRatio(fg, bg) >= (large ? AA_LARGE : AA_NORMAL);
}

/** Picks whichever of `dark`/`light` reads better on `bg`. */
export function readableOn(bg: string, dark = '#000000', light = '#ffffff'): string {
  return contrastRatio(dark, bg) >= contrastRatio(light, bg) ? dark : light;
}

// ─── Hue ──────────────────────────────────────────────────────────────────────
// Contrast ratio measures luminance only, so it cannot tell whether two colours
// are *tellable apart* — a bright green and a bright amber can sit at nearly the
// same luminance while being obviously different. Status colours are separated by
// hue, so that is what the palette tests assert.

/** Hue angle in degrees, 0–360 (0 = red, 120 = green, 240 = blue). */
export function hueOf(hex: string): number {
  const [r, g, b] = parseHex(hex).map(c => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;

  let sector: number;
  if (max === r) sector = ((g - b) / delta) % 6;
  else if (max === g) sector = (b - r) / delta + 2;
  else sector = (r - g) / delta + 4;

  const degrees = sector * 60;
  return degrees < 0 ? degrees + 360 : degrees;
}

/** Shortest angular distance between two hues, 0–180 degrees. */
export function hueDistance(a: string, b: string): number {
  const d = Math.abs(hueOf(a) - hueOf(b));
  return Math.min(d, 360 - d);
}
