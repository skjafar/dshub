import { describe, it, expect } from 'vitest';
import { DataAccessPermit, DataForm } from '../../maps/mapParser';
import type { MapEntry } from '../../maps/mapParser';
import { snapshotFromEntry } from '../bindingIdentity';
import { applyBindingFixes } from '../bindingReviewApplier';
import type { BindingFix } from '../bindingReviewApplier';
import { seedProfileDashboards } from '../widgets/dashboardStore';
import type { StoredDashboard, StoredWidget } from '../widgets/dashboardStore';
import type {
  BoundWidgetConfig,
  ButtonWidgetConfig,
  ContainerWidgetConfig,
  DataTableWidgetConfig,
  MiniPlotWidgetConfig,
} from '../widgets/widgetConfig';
import { seedProfileWorkspaces } from '../workspaceStore';
import type { StoredDaughterWindow, StoredWorkspace } from '../workspaceStore';
import type { PlotPaneState, PlotSeriesConfig } from '../panes/PlotPane';
import type { SerializedDockview } from 'dockview';

function entry(overrides: Partial<MapEntry> = {}): MapEntry {
  return {
    address: 9,
    name: 'NEW_NAME',
    type: DataForm.FLOAT,
    isArray: false,
    accessPermit: DataAccessPermit.READ_WRITE,
    showAsHex: false,
    ...overrides,
  };
}

function oldSnapshot() {
  return snapshotFromEntry({
    address: 3,
    name: 'OLD_NAME',
    type: DataForm.FLOAT,
    isArray: false,
    accessPermit: DataAccessPermit.READ_WRITE,
    showAsHex: false,
  });
}

function boundConfig(overrides: Partial<BoundWidgetConfig> = {}): BoundWidgetConfig {
  return { label: 'Value', binding: null, format: 'decimal', thresholds: [], ...overrides };
}

function widget(overrides: Partial<StoredWidget> = {}): StoredWidget {
  return { id: 'w1', kind: 'valueRead', layout: { x: 0, y: 0, w: 3, h: 2 }, config: boundConfig(), ...overrides };
}

function dashboard(overrides: Partial<StoredDashboard> = {}): StoredDashboard {
  return { id: 'd1', name: 'Dashboard 1', widgets: [], ...overrides };
}

function dockLayout(): SerializedDockview {
  return { grid: { root: { type: 'branch', data: [] }, height: 600, width: 800, orientation: 'HORIZONTAL' }, panels: {} } as unknown as SerializedDockview;
}

function plotSeries(overrides: Partial<PlotSeriesConfig> = {}): PlotSeriesConfig {
  return { name: 'OLD_NAME', source: 'register', address: 3, snapshot: oldSnapshot(), colorSlot: 0, visible: true, ...overrides };
}

function plotPaneState(series: readonly PlotSeriesConfig[]): PlotPaneState {
  return { series, pollInterval: 50, timeSpan: 60, pickerSource: 'register', pickerQuery: '' };
}

function workspace(overrides: Partial<StoredWorkspace> = {}): StoredWorkspace {
  return { id: 'w1', name: 'W', mainDockLayout: dockLayout(), paneStates: {}, selection: null, daughterWindows: [], ...overrides };
}

describe('applyBindingFixes', () => {
  it('rewrites exactly a bound Widget’s address and snapshot, leaving everything else untouched', () => {
    const target = entry();
    const original = dashboard({
      widgets: [
        widget({ id: 'w1', config: boundConfig({ label: 'Kept', binding: { space: 'register', address: 3, snapshot: oldSnapshot() } }) }),
        widget({ id: 'w2', config: boundConfig() }),
      ],
    });
    const dashboards = seedProfileDashboards(original);
    const fixes: readonly BindingFix[] = [{ coordinate: { kind: 'widgetBinding', dashboardId: 'd1', widgetId: 'w1' }, entry: target }];

    const result = applyBindingFixes(dashboards, undefined, fixes);

    const rewritten = (result.dashboards?.dashboards[0]?.widgets[0]?.config as BoundWidgetConfig).binding;
    expect(rewritten).toEqual({ space: 'register', address: 9, snapshot: snapshotFromEntry(target) });
    expect((result.dashboards?.dashboards[0]?.widgets[0]?.config as BoundWidgetConfig).label).toBe('Kept');
    expect(result.dashboards?.dashboards[0]?.widgets[1]).toEqual(original.widgets[1]);
  });

  it('rewrites a control Widget’s address-kind target', () => {
    const buttonConfig: ButtonWidgetConfig = {
      label: 'Enable',
      target: { kind: 'address', space: 'register', address: 3, snapshot: oldSnapshot() },
      value: 1,
    };
    const dashboards = seedProfileDashboards(dashboard({ widgets: [widget({ id: 'w1', kind: 'button', config: buttonConfig })] }));
    const fixes: readonly BindingFix[] = [{ coordinate: { kind: 'widgetTarget', dashboardId: 'd1', widgetId: 'w1' }, entry: entry() }];

    const result = applyBindingFixes(dashboards, undefined, fixes);

    const rewritten = result.dashboards?.dashboards[0]?.widgets[0]?.config as ButtonWidgetConfig;
    expect(rewritten.target).toEqual({ kind: 'address', space: 'register', address: 9, snapshot: snapshotFromEntry(entry()) });
  });

  it('rewrites a Mini-Plot Widget’s series', () => {
    const miniPlotConfig: MiniPlotWidgetConfig = { label: 'Trend', series: { space: 'register', address: 3, snapshot: oldSnapshot() }, pollInterval: 250, timeSpan: 60 };
    const dashboards = seedProfileDashboards(dashboard({ widgets: [widget({ id: 'w1', kind: 'miniPlot', config: miniPlotConfig })] }));
    const fixes: readonly BindingFix[] = [{ coordinate: { kind: 'widgetSeries', dashboardId: 'd1', widgetId: 'w1' }, entry: entry() }];

    const result = applyBindingFixes(dashboards, undefined, fixes);

    const rewritten = result.dashboards?.dashboards[0]?.widgets[0]?.config as MiniPlotWidgetConfig;
    expect(rewritten.series).toEqual({ space: 'register', address: 9, snapshot: snapshotFromEntry(entry()) });
  });

  it('rewrites a binding nested inside a Container Widget', () => {
    const child = widget({ id: 'child', config: boundConfig({ binding: { space: 'register', address: 3, snapshot: oldSnapshot() } }) });
    const containerConfig: ContainerWidgetConfig = { label: 'Group', padding: 8, spacing: 8, childWidgets: [child] };
    const dashboards = seedProfileDashboards(dashboard({ widgets: [widget({ id: 'container1', kind: 'container', config: containerConfig })] }));
    const fixes: readonly BindingFix[] = [{ coordinate: { kind: 'widgetBinding', dashboardId: 'd1', widgetId: 'child' }, entry: entry() }];

    const result = applyBindingFixes(dashboards, undefined, fixes);

    const rewrittenContainer = result.dashboards?.dashboards[0]?.widgets[0]?.config as ContainerWidgetConfig;
    expect((rewrittenContainer.childWidgets[0]?.config as BoundWidgetConfig).binding?.address).toBe(9);
  });

  it('rewrites exactly one Data Table row, identified by its row index, leaving other rows untouched', () => {
    const tableConfig: DataTableWidgetConfig = {
      label: 'Table',
      rows: [
        boundConfig({ label: 'Row0', binding: { space: 'register', address: 3, snapshot: oldSnapshot() } }),
        boundConfig({ label: 'Row1', binding: { space: 'register', address: 5, snapshot: snapshotFromEntry(entry({ address: 5, name: 'UNRELATED' })) } }),
      ],
    };
    const dashboards = seedProfileDashboards(dashboard({ widgets: [widget({ id: 'table1', kind: 'dataTable', config: tableConfig })] }));
    const fixes: readonly BindingFix[] = [
      { coordinate: { kind: 'widgetRow', dashboardId: 'd1', widgetId: 'table1', rowField: 'rows', rowIndex: 0 }, entry: entry() },
    ];

    const result = applyBindingFixes(dashboards, undefined, fixes);

    const rows = (result.dashboards?.dashboards[0]?.widgets[0]?.config as DataTableWidgetConfig).rows;
    expect(rows[0]?.binding?.address).toBe(9);
    expect(rows[1]?.binding?.address).toBe(5);
  });

  it('rewrites a Plot series’ address and snapshot in a Workspace’s saved Pane state', () => {
    const workspaces = seedProfileWorkspaces(workspace({ paneStates: { 'plot#1': plotPaneState([plotSeries()]) } }));
    const fixes: readonly BindingFix[] = [
      { coordinate: { kind: 'plotSeries', workspaceId: 'w1', windowLabel: null, paneId: 'plot#1', seriesName: 'OLD_NAME' }, entry: entry() },
    ];

    const result = applyBindingFixes(undefined, workspaces, fixes);

    const state = result.workspaces?.workspaces[0]?.paneStates['plot#1'] as PlotPaneState;
    expect(state.series[0]).toMatchObject({ address: 9, snapshot: snapshotFromEntry(entry()) });
  });

  it('rewrites a Plot series inside a Daughter Window’s own saved state', () => {
    const daughterWindow: StoredDaughterWindow = {
      label: 'daughter-1',
      dockLayout: dockLayout(),
      paneStates: { 'plot#1': plotPaneState([plotSeries()]) },
      bounds: { x: 0, y: 0, width: 1, height: 1 },
    };
    const workspaces = seedProfileWorkspaces(workspace({ daughterWindows: [daughterWindow] }));
    const fixes: readonly BindingFix[] = [
      { coordinate: { kind: 'plotSeries', workspaceId: 'w1', windowLabel: 'daughter-1', paneId: 'plot#1', seriesName: 'OLD_NAME' }, entry: entry() },
    ];

    const result = applyBindingFixes(undefined, workspaces, fixes);

    const state = result.workspaces?.workspaces[0]?.daughterWindows[0]?.paneStates['plot#1'] as PlotPaneState;
    expect(state.series[0].address).toBe(9);
  });

  it('leaves everything unchanged, returning the same references, when there are no fixes to apply', () => {
    const dashboards = seedProfileDashboards(dashboard({ widgets: [widget()] }));
    const workspaces = seedProfileWorkspaces(workspace());
    const result = applyBindingFixes(dashboards, workspaces, []);
    expect(result.dashboards).toBe(dashboards);
    expect(result.workspaces).toBe(workspaces);
  });

  /**
   * `AppShell.tsx`'s own apply handler reads `settings.workspacesByProfile`
   * directly, ahead of `sanitizeProfileWorkspaces` (which only runs later,
   * lazily, when a Workspace is actually restored) — a real crash from
   * exactly this gap: iterating a Workspace missing `daughterWindows`
   * entirely threw "is not iterable" against real, older-shaped stored data.
   */
  it('does not crash on a Workspace or Dashboard missing an array field entirely, even with a fix targeting it', () => {
    const malformedWorkspace = { id: 'w1', name: 'W' } as unknown as StoredWorkspace;
    const malformedDashboard = { id: 'd1', name: 'D' } as unknown as StoredDashboard;
    const fixes: readonly BindingFix[] = [
      { coordinate: { kind: 'widgetBinding', dashboardId: 'd1', widgetId: 'ghost' }, entry: entry() },
    ];

    expect(() =>
      applyBindingFixes(
        { dashboards: [malformedDashboard] },
        { workspaces: [malformedWorkspace], defaultWorkspaceId: 'w1', activeWorkspaceId: 'w1' },
        fixes
      )
    ).not.toThrow();
  });
});
