/**
 * Backfills pre-feature binding snapshots across a whole Profile
 * (`.scratch/map-binding-drift/issues/01-capture-and-backfill-binding-snapshots.md`).
 *
 * Run once, at settings-load time (`contexts/settingsMigration.ts` for a
 * Profile whose Map text lives in the same blob; `SettingsContext.tsx`'s own
 * effect for the Default/CNC Profiles, whose Map text is fetched separately),
 * against the Map as it stands at that moment — treated as a trusted
 * baseline, per `bindingIdentity.ts`'s own `backfillSnapshot` doc comment.
 * The result becomes this session's live settings and is persisted by the
 * ordinary debounced autosave the moment it differs from what was loaded, so
 * a later Map edit has a real, durable snapshot to diff against rather than
 * recomputing one fresh (and thus never detecting drift) on every load.
 */

import { parseMapFile } from '../maps/mapParser';
import type { EntriesBySpace } from './bindingIdentity';
import { backfillSnapshot } from './bindingIdentity';
import { kindOfPaneId } from './paneRegistry';
import type { PlotPaneState } from './panes/PlotPane';
import type { MapProfile } from '../types/settings';
import { backfillDashboardWidgets } from './widgets/dashboardStore';
import type { ProfileDashboards } from './widgets/dashboardStore';
import type { ProfileWorkspaces, StoredDaughterWindow, StoredWorkspace } from './workspaceStore';

/** A Profile's own three Maps, parsed into entries by space — the baseline a backfill pass diffs missing snapshots against. */
export function entriesBySpaceForProfile(profile: MapProfile): EntriesBySpace {
  return {
    register: parseMapFile(profile.registersMap, true).entries,
    parameter: parseMapFile(profile.parametersMap, false).entries,
    sysRegister: profile.systemRegistersMap ? parseMapFile(profile.systemRegistersMap, false).entries : [],
  };
}

/** One Pane's saved state, backfilling every Plot series it holds — a no-op, returning the same reference, for any other Pane kind. */
function backfillPaneState(paneId: string, value: unknown, entriesBySpace: EntriesBySpace): { readonly value: unknown; readonly changed: boolean } {
  if (kindOfPaneId(paneId) !== 'plot') return { value, changed: false };
  const state = value as Partial<PlotPaneState> | null | undefined;
  if (!state || !Array.isArray(state.series)) return { value, changed: false };

  let anyChanged = false;
  const series = state.series.map(entry => {
    const snapshot = backfillSnapshot(entry.snapshot, entry.address, entriesBySpace[entry.source]);
    if (snapshot === entry.snapshot) return entry;
    anyChanged = true;
    return { ...entry, snapshot };
  });
  if (!anyChanged) return { value, changed: false };
  return { value: { ...state, series }, changed: true };
}

function backfillPaneStates(
  paneStates: Readonly<Record<string, unknown>>,
  entriesBySpace: EntriesBySpace
): { readonly paneStates: Readonly<Record<string, unknown>>; readonly changed: boolean } {
  let anyChanged = false;
  const next: Record<string, unknown> = {};
  for (const [paneId, value] of Object.entries(paneStates)) {
    const result = backfillPaneState(paneId, value, entriesBySpace);
    next[paneId] = result.value;
    if (result.changed) anyChanged = true;
  }
  return anyChanged ? { paneStates: next, changed: true } : { paneStates, changed: false };
}

function backfillWorkspace(
  workspace: StoredWorkspace,
  entriesBySpace: EntriesBySpace
): { readonly workspace: StoredWorkspace; readonly changed: boolean } {
  const main = backfillPaneStates(workspace.paneStates, entriesBySpace);
  let anyChanged = main.changed;

  const daughterWindows: StoredDaughterWindow[] = [];
  for (const daughterWindow of workspace.daughterWindows) {
    const result = backfillPaneStates(daughterWindow.paneStates, entriesBySpace);
    if (result.changed) anyChanged = true;
    daughterWindows.push(result.changed ? { ...daughterWindow, paneStates: result.paneStates } : daughterWindow);
  }

  if (!anyChanged) return { workspace, changed: false };
  return { workspace: { ...workspace, paneStates: main.paneStates, daughterWindows }, changed: true };
}

/** Backfills every Plot series across every Workspace (and every Daughter Window within it) belonging to one Profile. */
function backfillProfileWorkspaces(
  workspaces: ProfileWorkspaces | undefined,
  entriesBySpace: EntriesBySpace
): { readonly workspaces: ProfileWorkspaces | undefined; readonly changed: boolean } {
  if (!workspaces) return { workspaces, changed: false };
  let anyChanged = false;
  const list = workspaces.workspaces.map(workspace => {
    const result = backfillWorkspace(workspace, entriesBySpace);
    if (result.changed) anyChanged = true;
    return result.workspace;
  });
  if (!anyChanged) return { workspaces, changed: false };
  return { workspaces: { ...workspaces, workspaces: list }, changed: true };
}

/** Backfills every Widget's binding, write target and Mini-Plot series across every Dashboard belonging to one Profile. */
function backfillProfileDashboards(
  dashboards: ProfileDashboards | undefined,
  entriesBySpace: EntriesBySpace
): { readonly dashboards: ProfileDashboards | undefined; readonly changed: boolean } {
  if (!dashboards) return { dashboards, changed: false };
  let anyChanged = false;
  const list = dashboards.dashboards.map(dashboard => {
    const result = backfillDashboardWidgets(dashboard, entriesBySpace);
    if (result.changed) anyChanged = true;
    return result.dashboard;
  });
  if (!anyChanged) return { dashboards, changed: false };
  return { dashboards: { ...dashboards, dashboards: list }, changed: true };
}

/**
 * Backfills every binding-like field across one Profile's Dashboards and
 * Workspaces in one pass — the single entry point a settings loader calls.
 * Returns the same `dashboards`/`workspaces` references, unchanged, once a
 * Profile's data has already been backfilled — the common case after the
 * first load under this feature.
 */
export function backfillProfileBindingSnapshots(
  dashboards: ProfileDashboards | undefined,
  workspaces: ProfileWorkspaces | undefined,
  entriesBySpace: EntriesBySpace
): {
  readonly dashboards: ProfileDashboards | undefined;
  readonly workspaces: ProfileWorkspaces | undefined;
  readonly changed: boolean;
} {
  const d = backfillProfileDashboards(dashboards, entriesBySpace);
  const w = backfillProfileWorkspaces(workspaces, entriesBySpace);
  return { dashboards: d.dashboards, workspaces: w.workspaces, changed: d.changed || w.changed };
}
