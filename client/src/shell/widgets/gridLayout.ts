/**
 * The grid constants a Dashboard's own top-level grid and a Container
 * Widget's nested one both use.
 *
 * `GRID_COLS` fixed rather than derived from the measured container width is
 * what ticket 14 settled on for the outer Dashboard: `react-grid-layout`'s
 * own `correctBounds` clamps against the column count at mount, so a variable
 * column count risks permanently rewriting a saved layout if the grid mounts
 * before its container is measured. A Container nests the identical
 * react-grid-layout mechanism one level down and faces the exact same hazard,
 * so it shares these constants rather than re-deriving its own — kept in one
 * module so the two can never drift into two different fixed values by
 * accident.
 */

export const GRID_COLS = 12;
export const ROW_HEIGHT = 48;
export const GRID_MARGIN = 8;

/** Used only until `ResizeObserver` reports the real width; affects visual sizing, not layout correctness. */
export const FALLBACK_WIDTH = 960;
