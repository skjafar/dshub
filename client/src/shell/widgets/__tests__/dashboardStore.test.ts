import { describe, it, expect } from 'vitest';
import {
  addDashboard,
  addWidget,
  applyWidgetLayouts,
  createDashboardId,
  createWidgetId,
  isValidStoredDashboard,
  nextAvailablePosition,
  removeDashboard,
  removeWidget,
  renameDashboard,
  sanitizeProfileDashboards,
  seedProfileDashboards,
  updateDashboard,
  updateWidgetConfig,
} from '../dashboardStore';
import type { StoredDashboard, StoredWidget } from '../dashboardStore';
import type { BoundWidgetConfig } from '../widgetConfig';

function config(overrides: Partial<BoundWidgetConfig> = {}): BoundWidgetConfig {
  return { label: 'Value', binding: null, format: 'decimal', thresholds: [], ...overrides };
}

function widget(overrides: Partial<StoredWidget> = {}): StoredWidget {
  return {
    id: 'w1',
    kind: 'valueRead',
    layout: { x: 0, y: 0, w: 3, h: 2 },
    config: config(),
    ...overrides,
  };
}

function dashboard(overrides: Partial<StoredDashboard> = {}): StoredDashboard {
  return { id: 'd1', name: 'Dashboard 1', widgets: [], ...overrides };
}

describe('validating a stored Dashboard', () => {
  it('accepts a well-formed Dashboard with a well-formed Widget', () => {
    expect(isValidStoredDashboard(dashboard({ widgets: [widget()] }))).toBe(true);
  });

  it('rejects a Widget naming a kind this build does not have', () => {
    const bad = dashboard({ widgets: [widget({ kind: 'kindFromTheFuture' as never })] });
    expect(isValidStoredDashboard(bad)).toBe(false);
  });

  it('rejects a Widget with a binding to an unknown Address Space', () => {
    const bad = dashboard({
      widgets: [widget({ config: config({ binding: { space: 'sysCommand' as never, address: 1 } }) })],
    });
    expect(isValidStoredDashboard(bad)).toBe(false);
  });

  it('rejects a threshold rule with an unknown comparator', () => {
    const bad = dashboard({
      widgets: [
        widget({
          config: config({
            thresholds: [{ id: 't1', comparator: '==' as never, value: 1, role: 'warn' }],
          }),
        }),
      ],
    });
    expect(isValidStoredDashboard(bad)).toBe(false);
  });

  it('accepts a null binding — an unconfigured Widget is valid, not corrupt', () => {
    expect(isValidStoredDashboard(dashboard({ widgets: [widget({ config: config({ binding: null }) })] }))).toBe(true);
  });

  it('rejects garbage of every shape without throwing', () => {
    for (const candidate of [null, undefined, 42, 'a string', [], {}, { id: 1 }]) {
      expect(() => isValidStoredDashboard(candidate)).not.toThrow();
      expect(isValidStoredDashboard(candidate)).toBe(false);
    }
  });
});

describe('repairing a stored Profile\'s Dashboard collection', () => {
  it('passes a well-formed collection through unchanged', () => {
    const collection = seedProfileDashboards(dashboard());
    expect(sanitizeProfileDashboards(collection)).toEqual(collection);
  });

  it('treats a deliberately empty collection as valid rather than corrupt — every Dashboard may be deleted', () => {
    expect(sanitizeProfileDashboards({ dashboards: [] })).toEqual({ dashboards: [] });
  });

  it('gives up on garbage that is not even shaped like a collection, without throwing', () => {
    for (const candidate of [null, undefined, 42, 'a string', [], { dashboards: 'not an array' }]) {
      expect(() => sanitizeProfileDashboards(candidate)).not.toThrow();
      expect(sanitizeProfileDashboards(candidate)).toBeUndefined();
    }
  });

  it('drops one corrupt Dashboard but keeps the rest', () => {
    const good = dashboard({ id: 'd1' });
    const corrupt = { id: 'd2', name: 'Bad', widgets: [{ id: 'w', kind: 'unknown', layout: {}, config: {} }] };
    const collection = { dashboards: [good, corrupt] };

    const repaired = sanitizeProfileDashboards(collection);
    expect(repaired?.dashboards.map(d => d.id)).toEqual(['d1']);
  });
});

describe('seeding the first Dashboard a Profile opens into', () => {
  it('wraps the seeded Dashboard alone', () => {
    const seed = dashboard({ id: 'd1' });
    expect(seedProfileDashboards(seed)).toEqual({ dashboards: [seed] });
  });
});

describe('Dashboard collection operations', () => {
  it('adds a Dashboard', () => {
    const collection = seedProfileDashboards(dashboard({ id: 'd1' }));
    const next = addDashboard(collection, dashboard({ id: 'd2', name: 'Second' }));
    expect(next.dashboards.map(d => d.id)).toEqual(['d1', 'd2']);
  });

  it('renames the named Dashboard and leaves the others untouched', () => {
    const collection = seedProfileDashboards(dashboard({ id: 'd1', name: 'Original' }));
    const next = renameDashboard(collection, 'd1', 'Renamed');
    expect(next.dashboards[0]?.name).toBe('Renamed');
  });

  it('removes a Dashboard, allowing the collection to become empty', () => {
    const collection = seedProfileDashboards(dashboard({ id: 'd1' }));
    const next = removeDashboard(collection, 'd1');
    expect(next.dashboards).toEqual([]);
  });

  it('ignores removing an id that does not exist', () => {
    const collection = seedProfileDashboards(dashboard({ id: 'd1' }));
    const next = removeDashboard(collection, 'ghost');
    expect(next).toEqual(collection);
  });

  it('updates one Dashboard in place, identified by id, and leaves the rest untouched when the id does not exist', () => {
    const collection = seedProfileDashboards(dashboard({ id: 'd1', widgets: [] }));
    const next = updateDashboard(collection, 'd1', d => ({ ...d, widgets: [widget()] }));
    expect(next.dashboards[0]?.widgets).toHaveLength(1);

    const unchanged = updateDashboard(collection, 'ghost', d => ({ ...d, name: 'should not apply' }));
    expect(unchanged).toEqual(collection);
  });

  it('creates Dashboard and Widget ids that do not collide', () => {
    const dashboardIds = new Set(Array.from({ length: 50 }, () => createDashboardId()));
    const widgetIds = new Set(Array.from({ length: 50 }, () => createWidgetId()));
    expect(dashboardIds.size).toBe(50);
    expect(widgetIds.size).toBe(50);
  });
});

describe('Widget operations within one Dashboard', () => {
  it('adds a Widget', () => {
    const next = addWidget(dashboard(), widget({ id: 'w1' }));
    expect(next.widgets.map(w => w.id)).toEqual(['w1']);
  });

  it('removes a Widget', () => {
    const next = removeWidget(dashboard({ widgets: [widget({ id: 'w1' })] }), 'w1');
    expect(next.widgets).toEqual([]);
  });

  it('replaces a Widget\'s configuration without touching its layout', () => {
    const original = widget({ id: 'w1', layout: { x: 1, y: 2, w: 3, h: 4 } });
    const next = updateWidgetConfig(dashboard({ widgets: [original] }), 'w1', config({ label: 'Renamed' }));
    expect(next.widgets[0]?.config.label).toBe('Renamed');
    expect(next.widgets[0]?.layout).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });

  it('applies a batch of layouts by Widget id, leaving Widgets absent from the batch untouched', () => {
    const a = widget({ id: 'a', layout: { x: 0, y: 0, w: 1, h: 1 } });
    const b = widget({ id: 'b', layout: { x: 0, y: 0, w: 1, h: 1 } });
    const next = applyWidgetLayouts(
      dashboard({ widgets: [a, b] }),
      new Map([['a', { x: 5, y: 6, w: 2, h: 2 }]])
    );
    expect(next.widgets.find(w => w.id === 'a')?.layout).toEqual({ x: 5, y: 6, w: 2, h: 2 });
    expect(next.widgets.find(w => w.id === 'b')?.layout).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe('nextAvailablePosition', () => {
  it('places the first Widget at the origin', () => {
    expect(nextAvailablePosition([], { w: 3, h: 2 }, 12)).toEqual({ x: 0, y: 0 });
  });

  it('places a second Widget beside the first when it fits the row', () => {
    const existing = [{ x: 0, y: 0, w: 3, h: 2 }];
    expect(nextAvailablePosition(existing, { w: 3, h: 2 }, 12)).toEqual({ x: 3, y: 0 });
  });

  it('wraps to the next row once the row is full', () => {
    const existing = [{ x: 0, y: 0, w: 12, h: 2 }];
    expect(nextAvailablePosition(existing, { w: 3, h: 2 }, 12)).toEqual({ x: 0, y: 2 });
  });
});
