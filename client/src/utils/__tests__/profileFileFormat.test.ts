import { describe, it, expect } from 'vitest';
import { serializeProfile, parseProfileFile } from '../profileFileFormat';
import type { MapProfile } from '../../types/settings';
import type { ProfileDashboards, StoredDashboard } from '../../shell/widgets/dashboardStore';

function profile(overrides: Partial<MapProfile> = {}): MapProfile {
  return {
    id: 'p1',
    name: 'Test Profile',
    isDefault: false,
    registersMap: 'float FOO;\n',
    parametersMap: 'float BAR;\n',
    createdAt: 0,
    ...overrides,
  };
}

function dashboard(overrides: Partial<StoredDashboard> = {}): StoredDashboard {
  return {
    id: 'd1',
    name: 'Dashboard 1',
    widgets: [
      {
        id: 'w1',
        kind: 'valueRead',
        layout: { x: 0, y: 0, w: 3, h: 2 },
        config: { label: 'Foo', binding: { space: 'register', address: 0 }, format: 'decimal', thresholds: [] },
      },
    ],
    ...overrides,
  };
}

describe('profile file Dashboards round trip', () => {
  it('carries Dashboards through serialize -> parse unchanged', () => {
    const dashboards: ProfileDashboards = { dashboards: [dashboard()] };
    const json = serializeProfile(profile(), dashboards);
    const result = parseProfileFile(json);

    expect(result.errors).toEqual([]);
    expect(result.file?.dashboards).toEqual(dashboards);
  });

  it('omits dashboards from the file when the Profile has none', () => {
    const json = serializeProfile(profile());
    const result = parseProfileFile(json);

    expect(result.file?.dashboards).toBeUndefined();
  });

  it('drops an invalid Dashboard and reports a non-fatal error rather than failing the import', () => {
    const raw = JSON.parse(serializeProfile(profile()));
    raw.dashboards = { dashboards: [{ id: 'bad', name: 'Bad', widgets: [{ id: 'w1', kind: 'notAKind', layout: { x: 0, y: 0, w: 1, h: 1 }, config: {} }] }] };
    const result = parseProfileFile(JSON.stringify(raw));

    expect(result.file?.dashboards).toEqual({ dashboards: [] });
    expect(result.errors).toEqual([
      expect.objectContaining({ section: 'dashboards', fatal: false }),
    ]);
  });

  it('is not fatal when dashboards is present but malformed', () => {
    const raw = JSON.parse(serializeProfile(profile()));
    raw.dashboards = 'not an object';
    const result = parseProfileFile(JSON.stringify(raw));

    expect(result.file).toBeDefined();
    expect(result.file?.dashboards).toBeUndefined();
    expect(result.errors.some(e => e.section === 'dashboards' && !e.fatal)).toBe(true);
  });
});
