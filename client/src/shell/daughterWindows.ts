/**
 * Pure decisions Daughter Windows need that touch no live dockview instance —
 * data in, data out, the same shape as `focusMode.ts`'s and `linkState.ts`'s
 * own functions and tested the same way.
 */

import { MAIN_WINDOW_ID, windowIdForPane } from './focusMode';
import type { WindowId, WindowLocatable } from './focusMode';
import type { PaneDefinition, PaneKind } from './paneRegistry';

// ── The window-count warning ─────────────────────────────────────────────

/**
 * Above this many open Daughter Windows, creating one more warns first
 * (spec.md, story 28) — a soft limit an Engineer can still cross (story 29),
 * never one a saved Workspace can be silently trimmed against (story 30).
 */
export const DAUGHTER_WINDOW_WARNING_THRESHOLD = 4;

/** Whether creating one more Daughter Window should warn first, given how many are already open. */
export function shouldWarnBeforeNewDaughterWindow(openDaughterWindowCount: number): boolean {
  return openDaughterWindowCount >= DAUGHTER_WINDOW_WARNING_THRESHOLD;
}

// ── Drag-out geometry ─────────────────────────────────────────────────────

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface WindowBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The size a freshly dragged-out Daughter Window opens at. */
export const DAUGHTER_WINDOW_DEFAULT_WIDTH = 640;
export const DAUGHTER_WINDOW_DEFAULT_HEIGHT = 480;

function containsPoint(bounds: WindowBounds, point: ScreenPoint): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.left + bounds.width &&
    point.y >= bounds.top &&
    point.y <= bounds.top + bounds.height
  );
}

/**
 * Where to open a Daughter Window for a Pane's tab dragged to `point`, or
 * null if the drag ended inside an already-open Window and is dockview's own
 * drop to handle instead.
 *
 * dockview has no "dragged outside every Window" gesture of its own —
 * `onWillDragPanel` and `onDidDrop` exist, but nothing in the library
 * compares a drag's end point against Window bounds. This is that
 * comparison, built from `dragend`'s screen coordinates the way ADR 0004
 * describes, kept free of any drag or dockview machinery so it can be pinned
 * with plain points and rectangles.
 */
export function dragOutTarget(
  point: ScreenPoint,
  openWindowBounds: readonly WindowBounds[]
): { readonly left: number; readonly top: number } | null {
  if (openWindowBounds.some(bounds => containsPoint(bounds, point))) return null;

  // Centers the new Window on the release point rather than anchoring a
  // corner there, so it appears where the Pane was actually let go instead of
  // growing away from underneath the pointer.
  return {
    left: Math.round(point.x - DAUGHTER_WINDOW_DEFAULT_WIDTH / 2),
    top: Math.round(point.y - DAUGHTER_WINDOW_DEFAULT_HEIGHT / 2),
  };
}

// ── Singleton location labelling ─────────────────────────────────────────

/**
 * The label the two Panes menus (Main Window's and every Daughter Window's)
 * use for a Window — the same words in both, since spec.md requires the two
 * menus to "tell me the same thing in the same words".
 *
 * Not a durable identity: Daughter Windows are not individually nameable
 * (spec.md, Out of Scope), so this numbers them by their position in
 * `openPopoutIds` — stable within one render, not across one closing and
 * another opening, which is the same instability the numbering itself is
 * openly built on rather than hiding.
 */
export function windowLabel(windowId: WindowId, openPopoutIds: readonly string[]): string {
  if (windowId === MAIN_WINDOW_ID) return 'Main Window';
  const index = openPopoutIds.indexOf(windowId);
  return index === -1 ? 'a Daughter Window' : `Daughter Window ${index + 1}`;
}

// ── The "open a Pane" menu, shared by the Main Window and every Daughter ──

export interface PaneMenuEntry {
  readonly kind: PaneKind;
  readonly title: string;
  /**
   * Set when this singleton is already open in a *different* Window than the
   * one this menu belongs to — the entry shows this as its location instead
   * of offering to open it. Picking a singleton already open in the *same*
   * Window still just focuses it, unchanged from before this existed: that
   * click visibly does something in the Window the user is looking at, which
   * is exactly what "elsewhere" (spec.md) is drawing the line against.
   */
  readonly disabledLocation: string | null;
}

/**
 * What the Panes menu should show, resolved once per open so both menus —
 * the Main Window's and any Daughter Window's — read the same open/closed
 * state through the same rule and describe it in the same words.
 */
export function paneMenuEntries(
  panes: readonly PaneDefinition[],
  openKinds: readonly PaneKind[],
  api: WindowLocatable,
  menuWindowId: WindowId,
  openPopoutIds: readonly string[]
): readonly PaneMenuEntry[] {
  return panes.map((pane): PaneMenuEntry => {
    if (!pane.singleton || !openKinds.includes(pane.kind)) {
      return { kind: pane.kind, title: pane.title, disabledLocation: null };
    }
    // A singleton's panel id is its bare kind (`paneRegistry.ts`'s `paneId`).
    const paneWindowId = windowIdForPane(api, pane.kind);
    const disabledLocation = paneWindowId === menuWindowId ? null : windowLabel(paneWindowId, openPopoutIds);
    return { kind: pane.kind, title: pane.title, disabledLocation };
  });
}
