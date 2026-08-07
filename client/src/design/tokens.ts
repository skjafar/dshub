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

// ─── Type scale ───────────────────────────────────────────────────────────────
/**
 * Eight sizes, centred on 13px rather than the usual 16px.
 *
 * This is a tool read at a workstation for hours, where the useful comparison is
 * an oscilloscope or a logic analyser rather than a web page: a screen holding
 * two hundred register rows earns its density. 13px is where the body sits, and
 * the steps below it are for the labels that name data rather than carry it.
 *
 * Sizes are in rem so a user's browser or OS text scaling still works — the
 * density is a default, not a cage.
 */
export const TEXT = {
  /** 10px — chip text, dense badges. */
  '2xs': '0.625rem',
  /** 11px — column heads, uppercase eyebrow labels. */
  xs: '0.6875rem',
  /** 12px — secondary text, help lines. */
  sm: '0.75rem',
  /** 13px — body, table cells, controls. The default. */
  base: '0.8125rem',
  /** 14px — emphasised body. */
  md: '0.875rem',
  /** 16px — pane titles. */
  lg: '1rem',
  /** 20px — section headings. */
  xl: '1.25rem',
  /** 24px — display readouts, Focus Mode values. */
  '2xl': '1.5rem',
} as const;

export const LEADING = {
  /** Data rows and headings — no wasted vertical space. */
  tight: '1.25',
  /** Default for UI text. */
  base: '1.45',
  /** Running prose: help text, descriptions. */
  relaxed: '1.6',
} as const;

export const WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const TRACKING = {
  /** Large headings, which look loose at their natural spacing. */
  tight: '-0.01em',
  base: '0',
  /** Uppercase labels, which are illegible without it. */
  wide: '0.05em',
} as const;

// ─── Density ──────────────────────────────────────────────────────────────────
/**
 * A 4px grid with half-steps at the small end, where dense UI does its work.
 *
 * Named by size rather than by number, so a value can be re-tuned without every
 * call site meaning something different afterwards.
 */
export const SPACE = {
  '3xs': '2px',
  '2xs': '4px',
  xs: '6px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
} as const;

/**
 * Control heights. 28px is the default: a comfortable pointer target that still
 * lets a filter row, a header and a table fit in the same pane without scrolling.
 */
export const CONTROL_HEIGHT = {
  sm: '24px',
  base: '28px',
  lg: '32px',
} as const;

/** Table and list row height, matched to the default control so they align. */
export const ROW_HEIGHT = '28px';

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

// ─── Elevation ────────────────────────────────────────────────────────────────
/**
 * The only two layers this app needs, and every stacking bug so far has come
 * from a third value appearing that neither of these accounts for. `sticky`
 * is for in-pane elements pinned during scroll — a table's header row. Nothing
 * else may sit above ordinary flow content without going through `overlay`.
 *
 * `overlay` covers everything Radix portals to the document root: menu,
 * select, popover, tooltip and dialog. A CSS Module component that portals
 * content must consume this rather than leaving z-index unset — an unset
 * z-index does not mean "on top" the way DOM order alone might suggest, it
 * means the element competes on DOM order *within its own stacking context*,
 * which a positioned descendant elsewhere in the tree with any explicit
 * z-index — `sticky`, here — wins against regardless of paint order. That is
 * exactly the failure this pair exists to rule out: a menu opened over a
 * Pane's table rendered behind the table's own sticky header.
 */
export const Z_INDEX = {
  sticky: 1,
  overlay: 1000,
} as const;

// ─── Motion ───────────────────────────────────────────────────────────────────
/**
 * Short and few. Anything longer reads as the interface hesitating, and an
 * operator watching machine state should never wonder whether the UI or the
 * machine is the slow one. Every consumer must honour `prefers-reduced-motion`.
 */
export const DURATION = {
  instant: '80ms',
  base: '140ms',
} as const;

export const EASING = 'cubic-bezier(0.2, 0, 0.2, 1)';

/** Focus ring width. One value everywhere, so focus is never ambiguous. */
export const FOCUS_RING_WIDTH = '2px';
