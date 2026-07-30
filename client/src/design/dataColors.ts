/**
 * Colours for *data* rather than chrome.
 *
 * Unlike theme accents, these do not follow the theme's brand hue: a plot series
 * or a dashboard LED encodes something about the user's machine, and that meaning
 * must not shift when someone changes theme. Series *identity* — slot 0 is always
 * "the first series" — is therefore fixed; only the rendered lightness adapts to
 * the background, because no single value can clear contrast on both `#0b0d1a`
 * and `#ffffff` for most hues.
 *
 * `design/__tests__/palette.test.ts` asserts the contrast floors below.
 */

/** Plot series on dark surfaces. Bright enough to read against `#0b0d1a`. */
export const SERIES_DARK: readonly string[] = [
  '#38bdf8', // sky
  '#fb7185', // rose
  '#4ade80', // green
  '#fbbf24', // amber
  '#c084fc', // violet
  '#2dd4bf', // teal
  '#f472b6', // pink
  '#a3e635', // lime
  '#818cf8', // indigo
  '#fb923c', // orange
  '#22d3ee', // cyan
  '#e879f9', // fuchsia
  '#86efac', // mint
  '#fca5a5', // salmon
  '#93c5fd', // pale blue
];

/** Plot series on light surfaces. Same hue order, darkened to read on white. */
export const SERIES_LIGHT: readonly string[] = [
  '#0369a1', // sky
  '#be123c', // rose
  '#15803d', // green
  '#a16207', // amber
  '#7e22ce', // violet
  '#0f766e', // teal
  '#be185d', // pink
  '#4d7c0f', // lime
  '#4338ca', // indigo
  '#c2410c', // orange
  '#0e7490', // cyan
  '#a21caf', // fuchsia
  '#047857', // mint
  '#b91c1c', // salmon
  '#1d4ed8', // pale blue
];

export function seriesPalette(mode: 'dark' | 'light'): readonly string[] {
  return mode === 'dark' ? SERIES_DARK : SERIES_LIGHT;
}

/** Deterministic series colour for a slot, cycling past the end of the palette. */
export function seriesColorAt(index: number, mode: 'dark' | 'light'): string {
  const palette = seriesPalette(mode);
  return palette[index % palette.length];
}

/**
 * Defaults written into a widget's persisted config when it is created.
 *
 * These stay literal rather than theme-derived: once written they are the user's
 * value, and a saved dashboard must render identically whichever theme is active.
 * Because a single value has to survive both extremes, each one is chosen from
 * the mid-luminance band that clears 3:1 (WCAG 1.4.11, non-text) on both
 * `#0b0d1a` and `#ffffff` — the previous defaults (`#4ADE80`, `#00F2FF`,
 * `#FFAB00`) sat near 2:1 on white and were effectively invisible on light themes.
 */
export const WIDGET_COLORS = {
  /** Healthy / energised / on */
  on: '#16a34a',
  /** De-energised / off / unknown */
  off: '#64748b',
  /** Neutral accent for readouts, gauges, encoders */
  accent: '#0284c7',
  /** Attention */
  warn: '#d97706',
  /** Fault */
  fault: '#dc2626',
} as const;
