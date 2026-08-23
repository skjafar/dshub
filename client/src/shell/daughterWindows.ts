/**
 * Pure decisions Daughter Windows need that touch no live dockview instance —
 * data in, data out, the same shape as `focusMode.ts`'s and `linkState.ts`'s
 * own functions and tested the same way.
 */

import { MAIN_WINDOW_ID } from './focusMode';
import type { WindowId } from './focusMode';
import { kindOfPaneId, paneDefinition } from './paneRegistry';
import type { PaneDefinition, PaneKind } from './paneRegistry';
import type { StoredDaughterWindow } from './workspaceStore';

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

// ── Naming and labelling a Daughter Window ──────────────────────────────

/**
 * A label built from what a Window currently has open — "Registers, Plot"
 * for a Window holding a Registers Pane and a Plot Pane — or null if it has
 * nothing open yet (a Window this freshly-created has nothing to derive
 * from). Deduplicates by *kind*, not by panel id: three open Register Panes
 * still read as one "Registers" in the label, matching how the reopen menu
 * already names a kind once regardless of how many instances are open.
 * Order follows `paneIds` itself (a Window's own dockview panel order), not
 * `paneRegistry.ts`'s declaration order, so the label reflects what that
 * Window's own tab strip actually shows left to right.
 */
export function deriveDaughterWindowLabel(paneIds: readonly string[]): string | null {
  const titles: string[] = [];
  const seenKinds = new Set<PaneKind>();
  for (const id of paneIds) {
    const kind = kindOfPaneId(id);
    if (!kind || seenKinds.has(kind)) continue;
    seenKinds.add(kind);
    const title = paneDefinition(kind)?.title;
    if (title) titles.push(title);
  }
  return titles.length > 0 ? titles.join(', ') : null;
}

/**
 * Every Daughter Window's own custom name, keyed by label — a Workspace's
 * `daughterWindows` entries carry `name` themselves (`workspaceStore.ts`),
 * so this is a plain reshape into the lookup `windowLabel` below needs, not
 * a derivation of its own. Omits an entry with no name set (or one blanked
 * back to `null`/absent) rather than carrying an empty string forward, so
 * `windowLabel`'s own `customNames.get(windowId)` check needs only test for
 * presence.
 */
export function customWindowNames(daughterWindows: readonly StoredDaughterWindow[]): ReadonlyMap<WindowId, string> {
  const names = new Map<WindowId, string>();
  for (const d of daughterWindows) {
    if (d.name) names.set(d.label, d.name);
  }
  return names;
}

/**
 * The label the two Panes menus (Main Window's and every Daughter Window's)
 * use for a Window — the same words in both, since spec.md requires the two
 * menus to "tell me the same thing in the same words". Precedence: a
 * user-set custom name first (`customNames`, from the Main Window's own
 * "Daughter Windows" list); failing that, a label derived from what the
 * Window currently has open (`deriveDaughterWindowLabel`, reading
 * `paneLocations` — issue 04's own cross-window view, already threaded
 * through every call site this needs); failing *that* — a freshly-created
 * Window with nothing open yet — its position among the open ones
 * (`.scratch/daughter-windows-native` issue 07's own naming follow-up).
 * That positional fallback is not a durable identity: it is stable within
 * one render, not across one Window closing and another opening, which is
 * the same instability it was always openly built on.
 */
export function windowLabel(
  windowId: WindowId,
  openPopoutIds: readonly string[],
  customNames: ReadonlyMap<WindowId, string>,
  paneLocations: ReadonlyMap<WindowId, readonly string[]>
): string {
  if (windowId === MAIN_WINDOW_ID) return 'Main Window';

  const custom = customNames.get(windowId);
  if (custom) return custom;

  const derived = deriveDaughterWindowLabel(paneLocations.get(windowId) ?? []);
  if (derived) return derived;

  const index = openPopoutIds.indexOf(windowId);
  return index === -1 ? 'a Daughter Window' : `Daughter Window ${index + 1}`;
}

/**
 * Every Window currently known to be open — the Main Window (always open,
 * and never itself part of the Rust-owned Daughter Window list) plus every
 * currently-open Daughter Window (`daughterWindowNative.ts`'s
 * `useDaughterWindows`). Both `usePaneLocations` (pruning a stale broadcast
 * from a Window that has since closed) and `windowLabel` (numbering) read
 * this same list, so a closed Window's last-known location never lingers and
 * the numbering the Main Window's and every Daughter Window's own menu shows
 * always agrees.
 */
export function knownWindowIds(openDaughterWindowLabels: readonly string[]): readonly WindowId[] {
  return [MAIN_WINDOW_ID, ...openDaughterWindowLabels];
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
 *
 * `paneLocations` is `usePaneLocations`'s own aggregated, cross-window view
 * (issue 04) — a singleton's panel id is its bare kind (`paneRegistry.ts`'s
 * `paneId`), so `pane.kind` doubles as the panel id to look for in it.
 */
export function paneMenuEntries(
  panes: readonly PaneDefinition[],
  paneLocations: ReadonlyMap<WindowId, readonly string[]>,
  menuWindowId: WindowId,
  openPopoutIds: readonly string[],
  customNames: ReadonlyMap<WindowId, string>
): readonly PaneMenuEntry[] {
  return panes.map((pane): PaneMenuEntry => {
    if (!pane.singleton) return { kind: pane.kind, title: pane.title, disabledLocation: null };

    const paneWindowId = locateOpenPane(paneLocations, pane.kind);
    const disabledLocation =
      paneWindowId === null || paneWindowId === menuWindowId
        ? null
        : windowLabel(paneWindowId, openPopoutIds, customNames, paneLocations);
    return { kind: pane.kind, title: pane.title, disabledLocation };
  });
}

/** Which Window's aggregated panel-id list contains `paneId`, or null if no Window currently reports it open. */
function locateOpenPane(paneLocations: ReadonlyMap<WindowId, readonly string[]>, paneId: string): WindowId | null {
  for (const [windowId, paneIds] of paneLocations) {
    if (paneIds.includes(paneId)) return windowId;
  }
  return null;
}

// ── "Move to Window", relocating a Pane into an already-open Window ───────

/** One choice in a Pane's "Move to Window" list. */
export interface MoveTarget {
  readonly windowId: WindowId;
  readonly label: string;
}

/**
 * Every open Window `pane` could move into right now (issue 05) — every
 * Window `knownWindowIds` reports, minus the one the Pane is already in
 * (moving to yourself is not a move), minus, for a singleton, any Window
 * that already has one open (`paneLocations`, the same cross-window view
 * `paneMenuEntries` reads — landing a second Inspector in a Window that
 * already has one would collide). Non-singleton kinds never exclude a
 * target this way: several Panes of the same kind coexisting in one Window
 * is the ordinary case, not a collision. Takes the whole `PaneDefinition`
 * rather than its `kind`/`singleton` fields split apart, matching
 * `paneMenuEntries`'s own convention just above.
 */
export function moveTargets(
  pane: Pick<PaneDefinition, 'kind' | 'singleton'>,
  sourceWindowId: WindowId,
  paneLocations: ReadonlyMap<WindowId, readonly string[]>,
  openDaughterWindowLabels: readonly string[],
  customNames: ReadonlyMap<WindowId, string>
): readonly MoveTarget[] {
  return knownWindowIds(openDaughterWindowLabels)
    .filter(windowId => windowId !== sourceWindowId)
    .filter(windowId => !pane.singleton || !(paneLocations.get(windowId) ?? []).includes(pane.kind))
    .map(windowId => ({ windowId, label: windowLabel(windowId, openDaughterWindowLabels, customNames, paneLocations) }));
}
