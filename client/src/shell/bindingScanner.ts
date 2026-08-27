/**
 * Profile-wide binding scanner (`.scratch/map-binding-drift/spec.md`'s
 * "Profile-wide binding scanner (seam)").
 *
 * Enumerates every read binding, address-kind write target, and Plot series
 * belonging to a Profile — across every Dashboard and every Workspace's
 * saved Pane state, independent of what is currently open in any Window —
 * so a Map-edit review (ticket 07) is exhaustive rather than limited to
 * whatever happens to be on screen when the edit is saved. Isolation from a
 * different Profile's data is structural rather than checked here: a caller
 * passes only the target Profile's own `ProfileDashboards`/`ProfileWorkspaces`
 * (`settings.dashboardsByProfile[profileId]`/`workspacesByProfile[profileId]`),
 * so nothing else can leak in.
 *
 * An item with no captured snapshot — unbound, or a pre-feature binding that
 * has not been backfilled and whose stored address matched nothing at
 * backfill time — has nothing to diff a Map edit against and is skipped, the
 * same way `useWidgetReading`'s own live check skips it.
 */

import type { AddressSpace } from './addressSpace';
import type { BindingSnapshot, EntriesBySpace } from './bindingIdentity';
import { resolveBinding } from './bindingResolver';
import type { BindingResolution } from './bindingResolver';
import { kindOfPaneId } from './paneRegistry';
import type { PlotPaneState } from './panes/PlotPane';
import type { ProfileDashboards, StoredDashboard } from './widgets/dashboardStore';
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
import type { ProfileWorkspaces, StoredWorkspace } from './workspaceStore';

/**
 * Where one flagged binding actually lives — enough to both label it in a
 * review (ticket 07) and, later, to rewrite exactly it and nothing else
 * (the resolution applier). A Data Table/Alarm List row carries no id of its
 * own (`widgetConfig.ts`'s own precedent), so it is addressed by position.
 */
export type BindingCoordinate =
  | { readonly kind: 'widgetBinding'; readonly dashboardId: string; readonly widgetId: string }
  | { readonly kind: 'widgetTarget'; readonly dashboardId: string; readonly widgetId: string }
  | { readonly kind: 'widgetSeries'; readonly dashboardId: string; readonly widgetId: string }
  | {
      readonly kind: 'widgetRow';
      readonly dashboardId: string;
      readonly widgetId: string;
      readonly rowField: 'rows' | 'alarms';
      readonly rowIndex: number;
    }
  | {
      readonly kind: 'plotSeries';
      readonly workspaceId: string;
      /** `null` for the Main Window's own paneStates, a Daughter Window's display label otherwise. */
      readonly windowLabel: string | null;
      readonly paneId: string;
      readonly seriesName: string;
    };

export interface ScannedBinding {
  readonly coordinate: BindingCoordinate;
  readonly space: AddressSpace;
  readonly address: number;
  readonly snapshot: BindingSnapshot;
  /** e.g. "Dashboard: Motor Control" or "Workspace: Default · daughter-1" — where to go look in context. */
  readonly locationLabel: string;
}

/** A stable string key for one coordinate — for a `Map`/React list key over `ScannedBinding[]`. */
export function coordinateKey(coordinate: BindingCoordinate): string {
  switch (coordinate.kind) {
    case 'widgetBinding':
    case 'widgetTarget':
    case 'widgetSeries':
      return `${coordinate.kind}:${coordinate.dashboardId}:${coordinate.widgetId}`;
    case 'widgetRow':
      return `${coordinate.kind}:${coordinate.dashboardId}:${coordinate.widgetId}:${coordinate.rowField}:${coordinate.rowIndex}`;
    case 'plotSeries':
      return `${coordinate.kind}:${coordinate.workspaceId}:${coordinate.windowLabel ?? ''}:${coordinate.paneId}:${coordinate.seriesName}`;
  }
}

function scanBoundConfig(
  dashboardId: string,
  widgetId: string,
  config: BoundWidgetConfig,
  locationLabel: string,
  out: ScannedBinding[]
): void {
  const binding = config.binding;
  if (!binding || !binding.snapshot) return;
  out.push({
    coordinate: { kind: 'widgetBinding', dashboardId, widgetId },
    space: binding.space,
    address: binding.address,
    snapshot: binding.snapshot,
    locationLabel,
  });
}

function scanBoundRows(
  dashboardId: string,
  widgetId: string,
  rowField: 'rows' | 'alarms',
  rows: readonly BoundWidgetConfig[],
  locationLabel: string,
  out: ScannedBinding[]
): void {
  (rows ?? []).forEach((row, rowIndex) => {
    const binding = row.binding;
    if (!binding || !binding.snapshot) return;
    out.push({
      coordinate: { kind: 'widgetRow', dashboardId, widgetId, rowField, rowIndex },
      space: binding.space,
      address: binding.address,
      snapshot: binding.snapshot,
      locationLabel,
    });
  });
}

function scanButtonConfig(
  dashboardId: string,
  widgetId: string,
  config: ButtonWidgetConfig,
  locationLabel: string,
  out: ScannedBinding[]
): void {
  const target = config.target;
  if (!target || target.kind !== 'address' || !target.snapshot) return;
  out.push({
    coordinate: { kind: 'widgetTarget', dashboardId, widgetId },
    space: target.space,
    address: target.address,
    snapshot: target.snapshot,
    locationLabel,
  });
}

function scanMiniPlotConfig(
  dashboardId: string,
  widgetId: string,
  config: MiniPlotWidgetConfig,
  locationLabel: string,
  out: ScannedBinding[]
): void {
  const series = config.series;
  if (!series || !series.snapshot) return;
  out.push({
    coordinate: { kind: 'widgetSeries', dashboardId, widgetId },
    space: series.space,
    address: series.address,
    snapshot: series.snapshot,
    locationLabel,
  });
}

/** One Widget's own binding-like fields, recursing into a Container's `childWidgets` — the only kind that nests. */
function scanStoredWidget(dashboardId: string, widget: StoredWidget, locationLabel: string, out: ScannedBinding[]): void {
  if (widget.kind === 'container') {
    const container = widget.config as ContainerWidgetConfig;
    for (const child of container.childWidgets ?? []) scanStoredWidget(dashboardId, child, locationLabel, out);
    return;
  }
  if (isBoundWidgetKind(widget.kind)) {
    scanBoundConfig(dashboardId, widget.id, widget.config as BoundWidgetConfig, locationLabel, out);
    return;
  }
  switch (widget.kind) {
    case 'button':
      scanButtonConfig(dashboardId, widget.id, widget.config as ButtonWidgetConfig, locationLabel, out);
      return;
    case 'dataTable':
      scanBoundRows(dashboardId, widget.id, 'rows', (widget.config as DataTableWidgetConfig).rows, locationLabel, out);
      return;
    case 'alarmList':
      scanBoundRows(dashboardId, widget.id, 'alarms', (widget.config as AlarmListWidgetConfig).alarms, locationLabel, out);
      return;
    case 'miniPlot':
      scanMiniPlotConfig(dashboardId, widget.id, widget.config as MiniPlotWidgetConfig, locationLabel, out);
      return;
    case 'directionalControl':
    case 'deviceInfo':
      return;
  }
}

function scanDashboard(dashboard: StoredDashboard, out: ScannedBinding[]): void {
  const locationLabel = `Dashboard: ${dashboard.name}`;
  for (const widget of dashboard.widgets ?? []) scanStoredWidget(dashboard.id, widget, locationLabel, out);
}

/** A Plot Pane's saved state is `unknown` at rest (`workspaceStore.ts`'s own `paneStates` shape) — treated as a `PlotPaneState` only once `kindOfPaneId` says the panel actually is one. */
function scanPaneStates(
  workspaceId: string,
  workspaceName: string,
  windowLabel: string | null,
  paneStates: Readonly<Record<string, unknown>>,
  out: ScannedBinding[]
): void {
  const locationLabel = windowLabel === null ? `Workspace: ${workspaceName}` : `Workspace: ${workspaceName} · ${windowLabel}`;
  for (const [paneId, value] of Object.entries(paneStates)) {
    if (kindOfPaneId(paneId) !== 'plot') continue;
    const state = value as Partial<PlotPaneState> | null | undefined;
    if (!state || !Array.isArray(state.series)) continue;
    for (const series of state.series) {
      if (!series.snapshot) continue;
      out.push({
        coordinate: { kind: 'plotSeries', workspaceId, windowLabel, paneId, seriesName: series.name },
        space: series.source,
        address: series.address,
        snapshot: series.snapshot,
        locationLabel,
      });
    }
  }
}

/**
 * A caller may hand this raw, not-yet-sanitized settings data (`AppShell.tsx`'s
 * own live `liveReviewItems` scan reads `settings.workspacesByProfile`
 * directly, ahead of `sanitizeProfileWorkspaces`, which only runs later when
 * a Workspace is actually restored into dockview) — a `StoredWorkspace`
 * missing `daughterWindows`/`paneStates` entirely must not crash the scan.
 */
function scanWorkspace(workspace: StoredWorkspace, out: ScannedBinding[]): void {
  scanPaneStates(workspace.id, workspace.name, null, workspace.paneStates ?? {}, out);
  for (const daughterWindow of workspace.daughterWindows ?? []) {
    scanPaneStates(workspace.id, workspace.name, daughterWindow.name ?? daughterWindow.label, daughterWindow.paneStates ?? {}, out);
  }
}

/**
 * Enumerates every scannable binding belonging to one Profile's Dashboards
 * and Workspaces. `dashboards`/`workspaces` are already scoped to the target
 * Profile by the caller — nothing here reads a Profile id.
 */
export function scanProfileBindings(
  dashboards: ProfileDashboards | undefined,
  workspaces: ProfileWorkspaces | undefined
): readonly ScannedBinding[] {
  const out: ScannedBinding[] = [];
  for (const dashboard of dashboards?.dashboards ?? []) scanDashboard(dashboard, out);
  for (const workspace of workspaces?.workspaces ?? []) scanWorkspace(workspace, out);
  return out;
}

export interface BindingReviewItem {
  readonly scanned: ScannedBinding;
  /** Never `'unchanged'` — this is exactly the set a review or a persistent indicator needs to show. */
  readonly resolution: Exclude<BindingResolution, { kind: 'unchanged' }>;
}

/**
 * Scans a Profile's Dashboards/Workspaces and resolves each item against
 * `entriesBySpace`, keeping only what actually needs review — the one
 * function both the post-save review (ticket 07) and the persistent
 * indicator (ticket 08) build their list from, so "what needs review" is
 * decided in exactly one place regardless of which surface is asking.
 */
export function bindingsNeedingReview(
  dashboards: ProfileDashboards | undefined,
  workspaces: ProfileWorkspaces | undefined,
  entriesBySpace: EntriesBySpace
): readonly BindingReviewItem[] {
  const items: BindingReviewItem[] = [];
  for (const scanned of scanProfileBindings(dashboards, workspaces)) {
    const resolution = resolveBinding(scanned.snapshot, scanned.address, entriesBySpace[scanned.space]);
    if (resolution.kind === 'unchanged') continue;
    items.push({ scanned, resolution });
  }
  return items;
}
