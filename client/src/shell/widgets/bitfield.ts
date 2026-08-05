/**
 * Decomposing one 32-bit Device word into its individual bits.
 *
 * Status Matrix reads one bound address rather than the sixteen-item grid the
 * legacy widget carried — each item there was its own address, format and
 * threshold, which is exactly the per-item duplication the shared
 * configuration surface exists to remove. A fault-flags register already
 * packs one condition per bit, so decomposing the single bound reading is
 * the shared-surface-native way to show the same at-a-glance grid.
 */

/** Bit 0 (least significant) first, thirty-two entries — one per bit of a Device word. */
export function bitsOf(raw: number): readonly boolean[] {
  const unsigned = raw >>> 0;
  return Array.from({ length: 32 }, (_, bit) => ((unsigned >>> bit) & 1) === 1);
}
