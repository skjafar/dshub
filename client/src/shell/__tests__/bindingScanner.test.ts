import { describe, it, expect } from 'vitest';
import { DataForm } from '../../maps/mapParser';
import { snapshotFromEntry } from '../bindingIdentity';
import { bindingsNeedingReview, scanProfileBindings } from '../bindingScanner';
import { seedProfileDashboards, addDashboard } from '../widgets/dashboardStore';
import type { ProfileDashboards, StoredDashboard, StoredWidget } from '../widgets/dashboardStore';
import type {
  BoundWidgetConfig,
  ButtonWidgetConfig,
  ContainerWidgetConfig,
  DataTableWidgetConfig,
} from '../widgets/widgetConfig';
import { seedProfileWorkspaces } from '../workspaceStore';
import type { ProfileWorkspaces, StoredDaughterWindow, StoredWorkspace } from '../workspaceStore';
import type { PlotPaneState, PlotSeriesConfig } from '../panes/PlotPane';
import type { SerializedDockview } from 'dockview';

function entrySnapshot(name = 'MOTOR_TEMP') {
  return snapshotFromEntry({
    address: 0,
    name,
    type: DataForm.FLOAT,
    isArray: false,
    accessPermit: 'READ_WRITE' as never,
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

function dockLayout(panelIds: readonly string[] = []): SerializedDockview {
  const panels: Record<string, unknown> = {};
  for (const id of panelIds) panels[id] = { id, contentComponent: id.split('#')[0] };
  return { grid: { root: { type: 'branch', data: [] }, height: 600, width: 800, orientation: 'HORIZONTAL' }, panels } as unknown as SerializedDockview;
}

function plotSeries(overrides: Partial<PlotSeriesConfig> = {}): PlotSeriesConfig {
  return { name: 'MOTOR_TEMP', source: 'register', address: 0, snapshot: entrySnapshot(), colorSlot: 0, visible: true, ...overrides };
}

function plotPaneState(series: readonly PlotSeriesConfig[]): PlotPaneState {
  return { series, pollInterval: 50, timeSpan: 60, pickerSource: 'register', pickerQuery: '' };
}

function daughterWindow(overrides: Partial<StoredDaughterWindow> = {}): StoredDaughterWindow {
  return { label: 'daughter-1', dockLayout: dockLayout(), paneStates: {}, bounds: { x: 0, y: 0, width: 100, height: 100 }, ...overrides };
}

function workspace(overrides: Partial<StoredWorkspace> = {}): StoredWorkspace {
  return {
    id: 'w1',
    name: 'My Workspace',
    mainDockLayout: dockLayout(),
    paneStates: {},
    selection: null,
    daughterWindows: [],
    ...overrides,
  };
}

describe('scanProfileBindings', () => {
  it('finds a bound Widget’s own binding', () => {
    const dashboards = seedProfileDashboards(
      dashboard({ widgets: [widget({ id: 'w1', config: boundConfig({ binding: { space: 'register', address: 0, snapshot: entrySnapshot() } }) })] })
    );
    const results = scanProfileBindings(dashboards, undefined);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ coordinate: { kind: 'widgetBinding', dashboardId: 'd1', widgetId: 'w1' }, address: 0 });
  });

  it('finds a control Widget’s address-bound write target', () => {
    const buttonConfig: ButtonWidgetConfig = {
      label: 'Enable',
      target: { kind: 'address', space: 'register', address: 3, snapshot: entrySnapshot('MOTOR_ENABLE') },
      value: 1,
    };
    const dashboards = seedProfileDashboards(dashboard({ widgets: [widget({ id: 'w1', kind: 'button', config: buttonConfig })] }));
    const results = scanProfileBindings(dashboards, undefined);
    expect(results).toHaveLength(1);
    expect(results[0].coordinate).toEqual({ kind: 'widgetTarget', dashboardId: 'd1', widgetId: 'w1' });
  });

  it('never includes a command-code write target', () => {
    const buttonConfig: ButtonWidgetConfig = { label: 'Send', target: { kind: 'command', code: 5 }, value: 0 };
    const dashboards = seedProfileDashboards(dashboard({ widgets: [widget({ kind: 'button', config: buttonConfig })] }));
    expect(scanProfileBindings(dashboards, undefined)).toHaveLength(0);
  });

  it('finds a binding nested inside a Container Widget', () => {
    const child = widget({ id: 'child', config: boundConfig({ binding: { space: 'register', address: 4, snapshot: entrySnapshot() } }) });
    const containerConfig: ContainerWidgetConfig = { label: 'Group', padding: 8, spacing: 8, childWidgets: [child] };
    const dashboards = seedProfileDashboards(dashboard({ widgets: [widget({ id: 'container1', kind: 'container', config: containerConfig })] }));
    const results = scanProfileBindings(dashboards, undefined);
    expect(results).toHaveLength(1);
    expect(results[0].coordinate).toEqual({ kind: 'widgetBinding', dashboardId: 'd1', widgetId: 'child' });
  });

  it('finds a Data Table row binding, identified by its row index', () => {
    const tableConfig: DataTableWidgetConfig = {
      label: 'Table',
      rows: [boundConfig({ binding: { space: 'register', address: 2, snapshot: entrySnapshot() } })],
    };
    const dashboards = seedProfileDashboards(dashboard({ widgets: [widget({ id: 'table1', kind: 'dataTable', config: tableConfig })] }));
    const results = scanProfileBindings(dashboards, undefined);
    expect(results).toHaveLength(1);
    expect(results[0].coordinate).toEqual({ kind: 'widgetRow', dashboardId: 'd1', widgetId: 'table1', rowField: 'rows', rowIndex: 0 });
  });

  it('skips a Widget with no binding at all', () => {
    const dashboards = seedProfileDashboards(dashboard({ widgets: [widget({ config: boundConfig({ binding: null }) })] }));
    expect(scanProfileBindings(dashboards, undefined)).toHaveLength(0);
  });

  it('skips a binding with no captured snapshot — nothing to check drift against', () => {
    const legacyBinding = { space: 'register', address: 0 } as unknown as { space: 'register'; address: number; snapshot: null };
    const dashboards = seedProfileDashboards(dashboard({ widgets: [widget({ config: boundConfig({ binding: legacyBinding }) })] }));
    expect(scanProfileBindings(dashboards, undefined)).toHaveLength(0);
  });

  it('finds a Plot series in an open Pane’s saved Workspace state', () => {
    const workspaces = seedProfileWorkspaces(workspace({ paneStates: { 'plot#1': plotPaneState([plotSeries()]) } }));
    const results = scanProfileBindings(undefined, workspaces);
    expect(results).toHaveLength(1);
    expect(results[0].coordinate).toEqual({ kind: 'plotSeries', workspaceId: 'w1', windowLabel: null, paneId: 'plot#1', seriesName: 'MOTOR_TEMP' });
  });

  it('also finds a Plot series in a Pane not currently open in any Window', () => {
    const workspaces = seedProfileWorkspaces(
      workspace({
        paneStates: {
          'plot#1': plotPaneState([plotSeries({ name: 'OPEN_ONE' })]),
          'plot#2': plotPaneState([plotSeries({ name: 'BACKGROUNDED_ONE' })]),
        },
      })
    );
    const results = scanProfileBindings(undefined, workspaces);
    expect(results.map(r => (r.coordinate.kind === 'plotSeries' ? r.coordinate.seriesName : null)).sort()).toEqual([
      'BACKGROUNDED_ONE',
      'OPEN_ONE',
    ]);
  });

  it('finds a Plot series inside a Daughter Window’s own saved state', () => {
    const workspaces = seedProfileWorkspaces(
      workspace({ daughterWindows: [daughterWindow({ paneStates: { 'plot#1': plotPaneState([plotSeries()]) } })] })
    );
    const results = scanProfileBindings(undefined, workspaces);
    expect(results).toHaveLength(1);
    expect(results[0].coordinate).toMatchObject({ kind: 'plotSeries', windowLabel: 'daughter-1' });
  });

  it('leaks nothing from a second Profile’s Dashboards or Workspaces — only what is passed in is scanned', () => {
    const ownDashboards = seedProfileDashboards(
      dashboard({ id: 'own', widgets: [widget({ config: boundConfig({ binding: { space: 'register', address: 0, snapshot: entrySnapshot() } }) })] })
    );
    // A second Profile's collection exists but is never passed to the scanner.
    const otherProfileDashboards = addDashboard(ownDashboards, dashboard({ id: 'other-profiles-dashboard' }));
    void otherProfileDashboards;

    const results = scanProfileBindings(ownDashboards, undefined);
    expect(results.every(r => r.coordinate.kind !== 'widgetBinding' || r.coordinate.dashboardId === 'own')).toBe(true);
  });
});

describe('scanProfileBindings — resilience against raw, not-yet-sanitized data', () => {
  /**
   * `AppShell.tsx`'s own live review scan reads `settings.workspacesByProfile`
   * directly, ahead of `sanitizeProfileWorkspaces` (which only runs later,
   * lazily, when a Workspace is actually restored into dockview) — a real
   * crash from exactly this gap: iterating a Workspace missing
   * `daughterWindows` entirely threw "is not iterable" against real,
   * older-shaped stored data.
   */
  it('does not crash on a Workspace, Dashboard, or Container missing an array field entirely', () => {
    const malformedWorkspace = { id: 'w1', name: 'W' } as unknown as StoredWorkspace;
    const malformedDashboard = { id: 'd1', name: 'D' } as unknown as StoredDashboard;

    expect(() =>
      scanProfileBindings(
        { dashboards: [malformedDashboard] },
        { workspaces: [malformedWorkspace], defaultWorkspaceId: 'w1', activeWorkspaceId: 'w1' }
      )
    ).not.toThrow();
  });
});

describe('bindingsNeedingReview', () => {
  it('excludes an item whose resolution is unchanged', () => {
    const snapshot = entrySnapshot('MOTOR_TEMP');
    const dashboards = seedProfileDashboards(
      dashboard({ widgets: [widget({ config: boundConfig({ binding: { space: 'register', address: 0, snapshot } }) })] })
    );
    const entries = { register: [{ address: 0, name: 'MOTOR_TEMP', type: DataForm.FLOAT, isArray: false, accessPermit: 'READ_WRITE' as never, showAsHex: false }], parameter: [], sysRegister: [] };

    expect(bindingsNeedingReview(dashboards, undefined, entries)).toHaveLength(0);
  });

  it('includes an item that moved, with its resolution attached', () => {
    const snapshot = entrySnapshot('MOTOR_TEMP');
    const dashboards = seedProfileDashboards(
      dashboard({ widgets: [widget({ config: boundConfig({ binding: { space: 'register', address: 0, snapshot } }) })] })
    );
    const movedEntry = { address: 5, name: 'MOTOR_TEMP', type: DataForm.FLOAT, isArray: false, accessPermit: 'READ_WRITE' as never, showAsHex: false };
    const entries = { register: [movedEntry], parameter: [], sysRegister: [] };

    const results = bindingsNeedingReview(dashboards, undefined, entries);
    expect(results).toHaveLength(1);
    expect(results[0].resolution).toEqual({ kind: 'moved', to: movedEntry });
  });
});
