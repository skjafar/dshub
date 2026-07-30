/**
 * Design tokens shared by every theme.
 *
 * Anything here is theme-independent: type stacks, geometry, and the structural
 * component overrides that should look the same whichever palette is active.
 * Colour lives in `appThemes.ts`; semantic status colour lives in `status.ts`.
 */

// ─── Type stacks ──────────────────────────────────────────────────────────────
// Fonts are self-hosted (see `client/src/index.tsx`). They were previously
// fetched from Google Fonts, which meant the whole typographic system silently
// collapsed to a system sans-serif on an isolated network — a real risk for a
// tool that runs next to industrial equipment.

export const FONT_BODY = '"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, sans-serif';
export const FONT_HEADLINE = '"Space Grotesk Variable", "Space Grotesk", "Inter Variable", sans-serif';

/**
 * True monospace, for data whose columns must align character-by-character:
 * hex dumps, packet analysis, binary values, addresses.
 *
 * Decimal readouts should use {@link FONT_BODY} with `tabular-nums` instead —
 * Inter's tabular figures align without giving up the body voice.
 */
export const FONT_MONO = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace';

// ─── Geometry ─────────────────────────────────────────────────────────────────

export const RADIUS = {
  /** Machined default — chips, badges, small indicators */
  sharp: 2,
  /** Controls, inputs, cards */
  base: 4,
  /** Dialogs, elevated panels */
  large: 8,
} as const;

/** Single header rhythm shared by the AppBar, drawer header and panel headers. */
export const HEADER_HEIGHT = 48;

// ─── Structural component bases (no colour) ──────────────────────────────────

export const buttonBase = {
  root: {
    borderRadius: RADIUS.base,
    padding: '6px 14px',
    boxShadow: 'none',
    fontWeight: 600,
    fontSize: '0.8125rem',
    letterSpacing: '0.03em',
    '&:hover': { boxShadow: 'none' },
  },
  sizeSmall: { padding: '4px 10px', fontSize: '0.75rem' },
} as const;

export const chipBase = {
  root: {
    borderRadius: RADIUS.sharp,
    fontWeight: 500,
    height: 22,
    fontSize: '0.6875rem',
  },
  sizeSmall: { height: 20, fontSize: '0.625rem' },
} as const;

export const tableCellBase = {
  root: { padding: '6px 12px', fontSize: '0.8125rem' },
  head: {
    fontWeight: 600,
    fontSize: '0.6875rem',
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  },
} as const;
