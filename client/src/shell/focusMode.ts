/**
 * Which Dashboard Focus Mode shows.
 *
 * A remembered Dashboard id can go stale — deleted since it was last focused,
 * or naming a Profile whose Dashboards were never loaded — the same hazard
 * `DashboardPane`'s own `activeDashboard` fallback (ticket 14) already
 * handles for a Pane instance's own choice of Dashboard. This is that same
 * fallback, applied to the one remembered id a Profile carries for Focus
 * Mode rather than to a Pane instance's local state.
 */

import type { StoredDashboard } from './widgets/dashboardStore';

/**
 * Identifies one operating-system Window: the Main Window, or one Daughter
 * Window (dockview's popout group id).
 *
 * Focus Mode is per-Window presentation state (issue 02) rather than the
 * single application-wide mode it used to be, so anything that used to be
 * a bare constant because there was only ever one Focus Mode active now needs
 * to be told which Window it belongs to.
 */
export type WindowId = string;

/** The sentinel identifying the Main Window, as opposed to any Daughter Window. */
export const MAIN_WINDOW_ID: WindowId = 'main';

/**
 * The narrow slice of a live dock api {@link windowIdForPane} needs — enough
 * to resolve a panel to the `Window` it renders in without depending on the
 * rest of `WorkspaceDockApi` or a real dockview instance, so this stays
 * testable against a hand-built fake.
 */
export interface WindowLocatable {
  getPanel(id: string): { readonly group: { readonly api: { getWindow(): Window } } } | undefined;
  getPopouts(): ReadonlyArray<{ readonly id: string; readonly window: Window }>;
}

/**
 * Which Window a Pane instance is currently rendered in.
 *
 * A Pane's own `paneId` says nothing about this: dockview adopts a group's
 * DOM into whichever native window it was dragged or popped into, and the one
 * React tree rendering every Pane runs entirely in the Main Window's realm
 * regardless (ADR 0004) — so the only way to find out is to ask the live dock
 * api what window the panel's *group* currently reports. Falls back to the
 * Main Window for an id the api does not recognise, which is what keeps a
 * Pane mid-close or not yet mounted from resolving to nothing.
 */
export function windowIdForPane(api: WindowLocatable, paneId: string): WindowId {
  const panel = api.getPanel(paneId);
  if (panel === undefined) return MAIN_WINDOW_ID;

  const panelWindow = panel.group.api.getWindow();
  const popout = api.getPopouts().find(p => p.window === panelWindow);
  return popout?.id ?? MAIN_WINDOW_ID;
}

/**
 * The `paneId` a Window's own Focus Mode Widget tree claims plot series
 * under.
 *
 * Focus Mode renders outside the Workspace — it replaces a Window's dock
 * rather than docking within it (`AppShell.tsx`) — so it has no dockview
 * panel id to thread through `WidgetProps.paneId` the way a Dashboard Pane's
 * Mini-Plot Widgets do. Keyed by {@link WindowId} rather than a single fixed
 * id: more than one Window can have Focus Mode active at once, and two
 * concurrent Focus Modes claiming the same `plotStream.ts` owner key would
 * have the second silently steal every series the first was streaming.
 */
export function focusWidgetPaneId(windowId: WindowId): string {
  return `focus:${windowId}`;
}

/**
 * The Dashboard to show, given what was last remembered and what the
 * Profile's collection actually holds right now.
 *
 * Falls back to the collection's first Dashboard — matching
 * `DashboardPane`'s own fallback — when nothing is remembered yet, or when
 * the remembered id no longer names a Dashboard that exists. Null only when
 * the Profile has no Dashboards at all, which callers use to keep Focus Mode
 * unreachable rather than entering it onto nothing.
 */
export function resolveFocusDashboard(
  dashboards: readonly StoredDashboard[],
  rememberedId: string | null
): StoredDashboard | null {
  const remembered = rememberedId === null ? undefined : dashboards.find(d => d.id === rememberedId);
  return remembered ?? dashboards[0] ?? null;
}
