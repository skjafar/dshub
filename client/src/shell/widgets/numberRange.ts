/**
 * Where a value sits inside a min/max range — the one piece of arithmetic
 * Gauge and Progress Bar both need and neither should own separately, since a
 * fill that overshoots its track or goes negative is the same bug read twice.
 */

/** The value's position between `min` and `max`, clamped to `[0, 1]`. */
export function rangeFraction(value: number, min: number, max: number): number {
  if (max === min) return 0;
  const fraction = (value - min) / (max - min);
  return Math.max(0, Math.min(1, fraction));
}
