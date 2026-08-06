import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA_VERSION } from '../../types/settings';
import type { MapProfile } from '../../types/settings';
import { DEFAULT_SYSTEM_REGISTERS_MAP, migrateStoredSettings, sanitizeStoredMapProfiles } from '../settingsMigration';

/**
 * Ticket 21: the settings blob never had a version marker before this.
 * These tests pin the three shapes that boundary has to survive without
 * crashing or silently discarding Profiles — absent, corrupt, and the old,
 * unversioned shape every blob written before this ticket actually has.
 */

function profile(overrides: Partial<MapProfile> = {}): MapProfile {
  return {
    id: 'p1',
    name: 'My board',
    isDefault: false,
    registersMap: 'uint32_t FOO;',
    parametersMap: 'uint32_t BAR;',
    createdAt: 1000,
    ...overrides,
  };
}

describe('migrateStoredSettings — absent blob', () => {
  it('is a fresh install: current defaults, nothing to announce', () => {
    const result = migrateStoredSettings(null);
    expect(result.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.justMigrated).toBe(false);
    expect(result.profilesCarriedOver).toBe(true);
  });
});

describe('migrateStoredSettings — corrupt blob', () => {
  /**
   * A corrupt blob is not the same case as an old-shape one: there is
   * nothing left to read Profiles back out of, so `profilesCarriedOver`
   * must be false here even though `justMigrated` is true in both cases —
   * a consumer conflating the two would tell someone their Profiles
   * survived when they didn't (the Spec-review finding this pins).
   */
  it('never throws on unparsable JSON, resets to defaults, and reports Profiles as lost too', () => {
    expect(() => migrateStoredSettings('not { valid json')).not.toThrow();
    const result = migrateStoredSettings('not { valid json');
    expect(result.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.justMigrated).toBe(true);
    expect(result.profilesCarriedOver).toBe(false);
  });

  it('never throws on valid JSON that is not an object, of every shape, and reports Profiles as lost too', () => {
    for (const raw of ['42', '"a string"', 'null', 'true', '[1,2,3]']) {
      expect(() => migrateStoredSettings(raw)).not.toThrow();
      const result = migrateStoredSettings(raw);
      expect(result.settings).toEqual(DEFAULT_SETTINGS);
      expect(result.justMigrated).toBe(true);
      expect(result.profilesCarriedOver).toBe(false);
    }
  });
});

describe('migrateStoredSettings — old, unversioned shape', () => {
  /** A blob shaped like one written before ticket 08 added Workspaces: no schemaVersion, no workspacesByProfile/dashboardsByProfile at all. */
  function oldShapeBlob(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      colorThemeId: 'kinetic-monolith',
      lastDeviceIP: '192.168.1.50',
      lastInterfaceType: 'TCP',
      autoScan: false, // differs from DEFAULT_SETTINGS.autoScan (true) — a preference that must NOT carry over
      autoConnect: true,
      autoConnectRetries: 9,
      autoConnectRetryDelay: 500,
      plotDefaults: { pollInterval: 10, timeSpan: 30, maxTimeSpan: 120, maxDataPoints: 500 },
      mapProfiles: [profile()],
      activeMapProfileId: 'p1',
      logSettings: DEFAULT_SETTINGS.logSettings,
      dashboardLayouts: { p1: { widgets: [] } }, // the legacy, pre-rebuild Dashboard shape
      showGettingStarted: false,
      dashboardView: { cellSize: 40, spacing: 4, roundedCorners: false },
      ...overrides,
      // no schemaVersion — that is the entire point of this fixture
    });
  }

  it('reports a reset, with Profiles carried over', () => {
    const result = migrateStoredSettings(oldShapeBlob());
    expect(result.justMigrated).toBe(true);
    expect(result.profilesCarriedOver).toBe(true);
  });

  it('carries Profiles across untouched — Maps and metadata intact', () => {
    const result = migrateStoredSettings(oldShapeBlob());
    expect(result.settings.mapProfiles).toHaveLength(1);
    expect(result.settings.mapProfiles[0]).toMatchObject({
      id: 'p1',
      name: 'My board',
      registersMap: 'uint32_t FOO;',
      parametersMap: 'uint32_t BAR;',
    });
  });

  it('carries Commands and per-entry metadata across untouched, not only the Maps themselves', () => {
    const withMetadata = profile({
      sysCommands: [{ code: 1, name: 'RESET' }],
      registersMetadata: { FOO: { description: 'A register', unit: 'V' } },
      parametersMetadata: { BAR: { description: 'A parameter' } },
    });
    const result = migrateStoredSettings(oldShapeBlob({ mapProfiles: [withMetadata] }));
    expect(result.settings.mapProfiles[0]).toMatchObject({
      sysCommands: [{ code: 1, name: 'RESET' }],
      registersMetadata: { FOO: { description: 'A register', unit: 'V' } },
      parametersMetadata: { BAR: { description: 'A parameter' } },
    });
  });

  it('backfills system registers on a carried-over Profile that predates them', () => {
    const result = migrateStoredSettings(oldShapeBlob());
    expect(result.settings.mapProfiles[0].systemRegistersMap).toBe(DEFAULT_SYSTEM_REGISTERS_MAP);
  });

  it('resets Dashboards, Workspaces and preferences to defaults rather than reading the old shape', () => {
    const result = migrateStoredSettings(oldShapeBlob());
    expect(result.settings.workspacesByProfile).toEqual({});
    expect(result.settings.dashboardsByProfile).toEqual({});
    expect(result.settings.dashboardLayouts).toEqual({});
    expect(result.settings.autoScan).toBe(DEFAULT_SETTINGS.autoScan);
    expect(result.settings.plotDefaults).toEqual(DEFAULT_SETTINGS.plotDefaults);
    expect(result.settings.dashboardView).toEqual(DEFAULT_SETTINGS.dashboardView);
  });

  it('writes the current schema version so the next load is not treated as old-shape again', () => {
    const result = migrateStoredSettings(oldShapeBlob());
    expect(result.settings.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
  });

  it('carries the active Profile selection across when it still names a surviving Profile', () => {
    const result = migrateStoredSettings(oldShapeBlob());
    expect(result.settings.activeMapProfileId).toBe('p1');
  });

  it('falls the active Profile back to the default when the stored one did not survive', () => {
    const result = migrateStoredSettings(oldShapeBlob({ activeMapProfileId: 'a-profile-that-got-dropped' }));
    expect(result.settings.activeMapProfileId).toBe(DEFAULT_SETTINGS.activeMapProfileId);
  });

  it('drops one corrupt Profile but keeps the rest — a downgrade must not cost every saved Map', () => {
    const good = profile({ id: 'good' });
    const corrupt = { id: 'bad', name: 'Missing maps' }; // no registersMap/parametersMap/createdAt
    const result = migrateStoredSettings(oldShapeBlob({ mapProfiles: [good, corrupt] }));
    expect(result.settings.mapProfiles.map(p => p.id)).toEqual(['good']);
  });

  it('never throws when mapProfiles is not even an array', () => {
    expect(() => migrateStoredSettings(oldShapeBlob({ mapProfiles: 'not an array' }))).not.toThrow();
    const result = migrateStoredSettings(oldShapeBlob({ mapProfiles: 'not an array' }));
    expect(result.settings.mapProfiles).toEqual([]);
  });

  it('remaps a schema version this build does not recognise the same way as no version at all', () => {
    // A downgrade, or a blob from a future build: neither has a meaning this
    // build can read, so both get the same safe treatment as pre-versioning.
    const result = migrateStoredSettings(oldShapeBlob({ schemaVersion: 999 }));
    expect(result.justMigrated).toBe(true);
    expect(result.settings.mapProfiles).toHaveLength(1);
  });
});

describe('migrateStoredSettings — current schema', () => {
  function currentShapeBlob(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({ ...DEFAULT_SETTINGS, ...overrides });
  }

  it('merges without resetting anything', () => {
    const result = migrateStoredSettings(currentShapeBlob({ mapProfiles: [profile()], autoScan: false }));
    expect(result.justMigrated).toBe(false);
    expect(result.profilesCarriedOver).toBe(true);
    expect(result.settings.mapProfiles).toHaveLength(1);
    expect(result.settings.autoScan).toBe(false);
  });

  it('deep-merges nested preference objects so a partial one does not drop new fields', () => {
    const result = migrateStoredSettings(currentShapeBlob({ plotDefaults: { pollInterval: 25 } }));
    expect(result.settings.plotDefaults).toEqual({ ...DEFAULT_SETTINGS.plotDefaults, pollInterval: 25 });
  });

  it('remaps a theme retired since the blob was saved to a surviving theme', () => {
    const result = migrateStoredSettings(currentShapeBlob({ colorThemeId: 'arctic' }));
    expect(result.settings.colorThemeId).toBe('blueprint');
  });
});

describe('sanitizeStoredMapProfiles', () => {
  it('rejects garbage of every shape without throwing', () => {
    for (const candidate of [null, undefined, 42, 'a string', {}, { id: 1 }, [null, 42, {}]]) {
      expect(() => sanitizeStoredMapProfiles(candidate)).not.toThrow();
    }
    expect(sanitizeStoredMapProfiles(null)).toEqual([]);
    expect(sanitizeStoredMapProfiles([null, 42, {}])).toEqual([]);
  });

  it('keeps a well-formed Profile', () => {
    expect(sanitizeStoredMapProfiles([profile()])).toEqual([profile()]);
  });
});
