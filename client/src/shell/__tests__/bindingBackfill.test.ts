import { describe, it, expect } from 'vitest';
import { DataAccessPermit, DataForm } from '../../maps/mapParser';
import type { MapEntry } from '../../maps/mapParser';
import { backfillProfileBindingSnapshots, entriesBySpaceForProfile } from '../bindingBackfill';
import { seedProfileDashboards } from '../widgets/dashboardStore';
import type { StoredDashboard, StoredWidget } from '../widgets/dashboardStore';
import type { BoundWidgetConfig } from '../widgets/widgetConfig';
import { seedProfileWorkspaces } from '../workspaceStore';
import type { StoredWorkspace } from '../workspaceStore';
import type { PlotPaneState, PlotSeriesConfig } from '../panes/PlotPane';
import type { MapProfile } from '../../types/settings';
import type { SerializedDockview } from 'dockview';

function mapEntry(overrides: Partial<MapEntry> = {}): MapEntry {
  return {
    address: 3,
    name: 'MOTOR_TEMP',
    type: DataForm.FLOAT,
    isArray: false,
    accessPermit: DataAccessPermit.READ_WRITE,
    showAsHex: false,
    ...overrides,
  };
}

function config(overrides: Partial<BoundWidgetConfig> = {}): BoundWidgetConfig {
  return { label: 'Value', binding: null, format: 'decimal', thresholds: [], ...overrides };
}

function widget(overrides: Partial<StoredWidget> = {}): StoredWidget {
  return { id: 'w1', kind: 'valueRead', layout: { x: 0, y: 0, w: 3, h: 2 }, config: config(), ...overrides };
}

function dashboard(overrides: Partial<StoredDashboard> = {}): StoredDashboard {
  return { id: 'd1', name: 'Dashboard 1', widgets: [], ...overrides };
}

function dockLayout(): SerializedDockview {
  return { grid: { root: { type: 'branch', data: [] }, height: 600, width: 800, orientation: 'HORIZONTAL' }, panels: {} } as unknown as SerializedDockview;
}

function plotSeries(overrides: Partial<PlotSeriesConfig> = {}): PlotSeriesConfig {
  return { name: 'MOTOR_TEMP', source: 'register', address: 3, snapshot: undefined as never, colorSlot: 0, visible: true, ...overrides };
}

function plotPaneState(series: readonly PlotSeriesConfig[]): PlotPaneState {
  return { series, pollInterval: 50, timeSpan: 60, pickerSource: 'register', pickerQuery: '' };
}

function workspace(overrides: Partial<StoredWorkspace> = {}): StoredWorkspace {
  return { id: 'w1', name: 'W', mainDockLayout: dockLayout(), paneStates: {}, selection: null, daughterWindows: [], ...overrides };
}

describe('entriesBySpaceForProfile', () => {
  it('parses each of a Profile’s three Maps into its own space', () => {
    const profile: MapProfile = {
      id: 'p1',
      name: 'P',
      isDefault: false,
      registersMap: 'float MOTOR_TEMP;',
      parametersMap: 'uint32_t GAIN;',
      systemRegistersMap: 'uint32_t UPTIME;',
      createdAt: 0,
    };
    const entries = entriesBySpaceForProfile(profile);
    expect(entries.register.map(e => e.name)).toEqual(['MOTOR_TEMP']);
    expect(entries.parameter.map(e => e.name)).toEqual(['GAIN']);
    expect(entries.sysRegister.map(e => e.name)).toEqual(['UPTIME']);
  });

  it('reports no System Registers when the Profile has no systemRegistersMap at all', () => {
    const profile: MapProfile = { id: 'p1', name: 'P', isDefault: false, registersMap: '', parametersMap: '', createdAt: 0 };
    expect(entriesBySpaceForProfile(profile).sysRegister).toEqual([]);
  });
});

describe('backfillProfileBindingSnapshots', () => {
  it('backfills a legacy Dashboard Widget binding from the Profile’s current Map', () => {
    const legacyBinding = { space: 'register', address: 3 } as unknown as { space: 'register'; address: number; snapshot: undefined };
    const dashboards = seedProfileDashboards(dashboard({ widgets: [widget({ config: config({ binding: legacyBinding }) })] }));
    const entries = { register: [mapEntry()], parameter: [], sysRegister: [] };

    const result = backfillProfileBindingSnapshots(dashboards, undefined, entries);

    expect(result.changed).toBe(true);
    const backfilled = (result.dashboards?.dashboards[0]?.widgets[0]?.config as BoundWidgetConfig).binding;
    expect(backfilled?.snapshot).toEqual({ name: 'MOTOR_TEMP', type: DataForm.FLOAT, isArray: false, arraySize: undefined });
  });

  it('backfills a legacy Plot series in a Workspace’s saved Pane state', () => {
    const workspaces = seedProfileWorkspaces(workspace({ paneStates: { 'plot#1': plotPaneState([plotSeries()]) } }));
    const entries = { register: [mapEntry()], parameter: [], sysRegister: [] };

    const result = backfillProfileBindingSnapshots(undefined, workspaces, entries);

    expect(result.changed).toBe(true);
    const state = result.workspaces?.workspaces[0]?.paneStates['plot#1'] as PlotPaneState;
    expect(state.series[0].snapshot).toEqual({ name: 'MOTOR_TEMP', type: DataForm.FLOAT, isArray: false, arraySize: undefined });
  });

  it('backfills a legacy Plot series inside a Daughter Window’s own saved state', () => {
    const workspaces = seedProfileWorkspaces(
      workspace({
        daughterWindows: [
          { label: 'daughter-1', dockLayout: dockLayout(), paneStates: { 'plot#1': plotPaneState([plotSeries()]) }, bounds: { x: 0, y: 0, width: 1, height: 1 } },
        ],
      })
    );
    const entries = { register: [mapEntry()], parameter: [], sysRegister: [] };

    const result = backfillProfileBindingSnapshots(undefined, workspaces, entries);

    expect(result.changed).toBe(true);
    const state = result.workspaces?.workspaces[0]?.daughterWindows[0]?.paneStates['plot#1'] as PlotPaneState;
    expect(state.series[0].snapshot).toEqual({ name: 'MOTOR_TEMP', type: DataForm.FLOAT, isArray: false, arraySize: undefined });
  });

  it('reports no change and returns the same references when nothing needs backfilling', () => {
    const dashboards = seedProfileDashboards(dashboard({ widgets: [widget({ config: config({ binding: null }) })] }));
    const workspaces = seedProfileWorkspaces(workspace());
    const entries = { register: [], parameter: [], sysRegister: [] };

    const result = backfillProfileBindingSnapshots(dashboards, workspaces, entries);

    expect(result.changed).toBe(false);
    expect(result.dashboards).toBe(dashboards);
    expect(result.workspaces).toBe(workspaces);
  });

  it('passes undefined Dashboards/Workspaces through untouched', () => {
    const result = backfillProfileBindingSnapshots(undefined, undefined, { register: [], parameter: [], sysRegister: [] });
    expect(result).toEqual({ dashboards: undefined, workspaces: undefined, changed: false });
  });

  /**
   * This module runs at settings-load time, directly over `localStorage`'s
   * raw JSON — before `sanitizeProfileWorkspaces`/`sanitizeProfileDashboards`
   * ever run (those only run later, lazily, when a Workspace or Dashboard is
   * actually restored). A real crash from exactly this gap: `for (const
   * daughterWindow of workspace.daughterWindows)` over a workspace missing
   * that field entirely threw "is not iterable" the first time a user hit
   * this code path against their own real (older-shaped) stored data.
   */
  it('does not crash on a Workspace, Dashboard, or Container missing an array field entirely — raw, not-yet-sanitized data', () => {
    const malformedWorkspace = { id: 'w1', name: 'W' } as unknown as StoredWorkspace;
    const malformedDashboard = { id: 'd1', name: 'D' } as unknown as StoredDashboard;
    const entries = { register: [mapEntry()], parameter: [], sysRegister: [] };

    expect(() =>
      backfillProfileBindingSnapshots(
        { dashboards: [malformedDashboard] },
        { workspaces: [malformedWorkspace], defaultWorkspaceId: 'w1', activeWorkspaceId: 'w1' },
        entries
      )
    ).not.toThrow();
  });
});
