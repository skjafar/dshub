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
 * The `paneId` Focus Mode's own Widget tree claims plot series under.
 *
 * Focus Mode renders outside the Workspace — it replaces it rather than
 * docking within it (`AppShell.tsx`) — so it has no dockview panel id to
 * thread through `WidgetProps.paneId` the way a Dashboard Pane's Mini-Plot
 * Widgets do. A fixed id plays the same role: `plotStream.ts` only needs a
 * stable, unique owner key, and this can never collide with a real panel id
 * (`paneRegistry.ts`'s ids are always a `PaneKind`, optionally suffixed with
 * `#<instance>`, and `'focus'` is not a `PaneKind`).
 */
export const FOCUS_WIDGET_PANE_ID = 'focus';

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
