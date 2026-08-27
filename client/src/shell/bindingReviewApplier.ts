/**
 * Resolution applier (`.scratch/map-binding-drift/spec.md`'s "Resolution
 * applier (seam)").
 *
 * Takes one Profile's Dashboards/Workspaces and a list of fixes — one per
 * flagged item an Engineer accepted (the resolver's own suggestion) or
 * manually re-picked, in a Map-edit review (ticket 07) — and rewrites
 * exactly the targeted binding, write target, Plot series or row's own
 * address and snapshot, nothing else. An item left unresolved simply has no
 * fix in the list: that is the "no-op write" the spec calls for, since the
 * resolver keeps flagging it on every later check until it actually changes.
 */

import { snapshotFromEntry } from './bindingIdentity';
import type { BindingCoordinate } from './bindingScanner';
import { kindOfPaneId } from './paneRegistry';
import type { PlotPaneState } from './panes/PlotPane';
import type { MapEntry } from '../maps/mapParser';
import { isBoundWidgetKind } from './widgets/widgetRegistry';
import type {
  AlarmListWidgetConfig,
  BoundWidgetConfig,
  ButtonWidgetConfig,
  ContainerWidgetConfig,
  DataTableWidgetConfig,
  MiniPlotWidgetConfig,
  StoredWidget,
} from './widgets/widgetConfig';
import type { ProfileDashboards, StoredDashboard } from './widgets/dashboardStore';
import type { ProfileWorkspaces, StoredWorkspace } from './workspaceStore';

export interface BindingFix {
  readonly coordinate: BindingCoordinate;
  /** The entry to re-point to — the resolver's own "moved" suggestion, or a manually re-picked one. */
  readonly entry: MapEntry;
}

function findFix(
  fixes: readonly BindingFix[],
  matches: (coordinate: BindingCoordinate) => boolean
): MapEntry | undefined {
  return fixes.find(fix => matches(fix.coordinate))?.entry;
}

function rewriteStoredWidget(
  dashboardId: string,
  widget: StoredWidget,
  fixes: readonly BindingFix[]
): { readonly widget: StoredWidget; readonly changed: boolean } {
  if (widget.kind === 'container') {
    const container = widget.config as ContainerWidgetConfig;
    let anyChanged = false;
    const childWidgets = (container.childWidgets ?? []).map(child => {
      const result = rewriteStoredWidget(dashboardId, child, fixes);
      if (result.changed) anyChanged = true;
      return result.widget;
    });
    if (!anyChanged) return { widget, changed: false };
    return { widget: { ...widget, config: { ...container, childWidgets } }, changed: true };
  }

  if (isBoundWidgetKind(widget.kind)) {
    const entry = findFix(
      fixes,
      c => c.kind === 'widgetBinding' && c.dashboardId === dashboardId && c.widgetId === widget.id
    );
    const bound = widget.config as BoundWidgetConfig;
    if (entry && bound.binding) {
      return {
        widget: { ...widget, config: { ...bound, binding: { ...bound.binding, address: entry.address, snapshot: snapshotFromEntry(entry) } } },
        changed: true,
      };
    }
    return { widget, changed: false };
  }

  if (widget.kind === 'button') {
    const entry = findFix(
      fixes,
      c => c.kind === 'widgetTarget' && c.dashboardId === dashboardId && c.widgetId === widget.id
    );
    const button = widget.config as ButtonWidgetConfig;
    if (entry && button.target?.kind === 'address') {
      return {
        widget: { ...widget, config: { ...button, target: { ...button.target, address: entry.address, snapshot: snapshotFromEntry(entry) } } },
        changed: true,
      };
    }
    return { widget, changed: false };
  }

  if (widget.kind === 'miniPlot') {
    const entry = findFix(
      fixes,
      c => c.kind === 'widgetSeries' && c.dashboardId === dashboardId && c.widgetId === widget.id
    );
    const miniPlot = widget.config as MiniPlotWidgetConfig;
    if (entry && miniPlot.series) {
      return {
        widget: { ...widget, config: { ...miniPlot, series: { ...miniPlot.series, address: entry.address, snapshot: snapshotFromEntry(entry) } } },
        changed: true,
      };
    }
    return { widget, changed: false };
  }

  if (widget.kind === 'dataTable' || widget.kind === 'alarmList') {
    const rowField = widget.kind === 'dataTable' ? ('rows' as const) : ('alarms' as const);
    const rows =
      widget.kind === 'dataTable' ? (widget.config as DataTableWidgetConfig).rows : (widget.config as AlarmListWidgetConfig).alarms;
    let anyChanged = false;
    const nextRows = (rows ?? []).map((row, rowIndex) => {
      const entry = findFix(
        fixes,
        c => c.kind === 'widgetRow' && c.dashboardId === dashboardId && c.widgetId === widget.id && c.rowField === rowField && c.rowIndex === rowIndex
      );
      if (!entry || !row.binding) return row;
      anyChanged = true;
      return { ...row, binding: { ...row.binding, address: entry.address, snapshot: snapshotFromEntry(entry) } };
    });
    if (!anyChanged) return { widget, changed: false };
    const nextConfig =
      widget.kind === 'dataTable'
        ? { ...(widget.config as DataTableWidgetConfig), rows: nextRows }
        : { ...(widget.config as AlarmListWidgetConfig), alarms: nextRows };
    return { widget: { ...widget, config: nextConfig }, changed: true };
  }

  return { widget, changed: false };
}

function rewriteDashboard(dashboard: StoredDashboard, fixes: readonly BindingFix[]): { readonly dashboard: StoredDashboard; readonly changed: boolean } {
  let anyChanged = false;
  const widgets = (dashboard.widgets ?? []).map(widget => {
    const result = rewriteStoredWidget(dashboard.id, widget, fixes);
    if (result.changed) anyChanged = true;
    return result.widget;
  });
  return anyChanged ? { dashboard: { ...dashboard, widgets }, changed: true } : { dashboard, changed: false };
}

function rewritePaneStates(
  workspaceId: string,
  windowLabel: string | null,
  paneStates: Readonly<Record<string, unknown>>,
  fixes: readonly BindingFix[]
): { readonly paneStates: Readonly<Record<string, unknown>>; readonly changed: boolean } {
  let anyChanged = false;
  const next: Record<string, unknown> = {};
  for (const [paneId, value] of Object.entries(paneStates)) {
    if (kindOfPaneId(paneId) !== 'plot') {
      next[paneId] = value;
      continue;
    }
    const state = value as Partial<PlotPaneState> | null | undefined;
    if (!state || !Array.isArray(state.series)) {
      next[paneId] = value;
      continue;
    }
    let seriesChanged = false;
    const series = state.series.map(seriesConfig => {
      const entry = findFix(
        fixes,
        c =>
          c.kind === 'plotSeries' &&
          c.workspaceId === workspaceId &&
          c.windowLabel === windowLabel &&
          c.paneId === paneId &&
          c.seriesName === seriesConfig.name
      );
      if (!entry) return seriesConfig;
      seriesChanged = true;
      return { ...seriesConfig, address: entry.address, snapshot: snapshotFromEntry(entry) };
    });
    if (!seriesChanged) {
      next[paneId] = value;
      continue;
    }
    anyChanged = true;
    next[paneId] = { ...state, series };
  }
  return anyChanged ? { paneStates: next, changed: true } : { paneStates, changed: false };
}

/**
 * `AppShell.tsx`'s own apply handler reads `settings.workspacesByProfile`
 * directly, ahead of `sanitizeProfileWorkspaces` (which only runs later, when
 * a Workspace is actually restored into dockview) — a `StoredWorkspace`
 * missing `daughterWindows`/`paneStates` entirely must not crash the rewrite.
 */
function rewriteWorkspace(workspace: StoredWorkspace, fixes: readonly BindingFix[]): { readonly workspace: StoredWorkspace; readonly changed: boolean } {
  const main = rewritePaneStates(workspace.id, null, workspace.paneStates ?? {}, fixes);
  let anyChanged = main.changed;
  const daughterWindows = (workspace.daughterWindows ?? []).map(daughterWindow => {
    const result = rewritePaneStates(workspace.id, daughterWindow.name ?? daughterWindow.label, daughterWindow.paneStates ?? {}, fixes);
    if (result.changed) anyChanged = true;
    return result.changed ? { ...daughterWindow, paneStates: result.paneStates } : daughterWindow;
  });
  if (!anyChanged) return { workspace, changed: false };
  return { workspace: { ...workspace, paneStates: main.paneStates, daughterWindows }, changed: true };
}

/**
 * Applies every fix in `fixes` to the targeted binding, write target, Plot
 * series or Data Table/Alarm List row, and nothing else. Returns the same
 * `dashboards`/`workspaces` references, unchanged, when `fixes` is empty or
 * names nothing that still exists.
 */
export function applyBindingFixes(
  dashboards: ProfileDashboards | undefined,
  workspaces: ProfileWorkspaces | undefined,
  fixes: readonly BindingFix[]
): { readonly dashboards: ProfileDashboards | undefined; readonly workspaces: ProfileWorkspaces | undefined } {
  if (fixes.length === 0) return { dashboards, workspaces };

  let nextDashboards = dashboards;
  if (dashboards) {
    let anyChanged = false;
    const list = (dashboards.dashboards ?? []).map(dashboard => {
      const result = rewriteDashboard(dashboard, fixes);
      if (result.changed) anyChanged = true;
      return result.dashboard;
    });
    nextDashboards = anyChanged ? { ...dashboards, dashboards: list } : dashboards;
  }

  let nextWorkspaces = workspaces;
  if (workspaces) {
    let anyChanged = false;
    const list = (workspaces.workspaces ?? []).map(workspace => {
      const result = rewriteWorkspace(workspace, fixes);
      if (result.changed) anyChanged = true;
      return result.workspace;
    });
    nextWorkspaces = anyChanged ? { ...workspaces, workspaces: list } : workspaces;
  }

  return { dashboards: nextDashboards, workspaces: nextWorkspaces };
}
