/**
 * Migrates a stored `dshub_settings` blob to the current shape.
 *
 * Before this module existed, the settings blob had no version marker at
 * all (ticket 21) — every prior shape change since the interface rebuild
 * began just accreted new optional fields onto the same evolving type and
 * relied on `{...DEFAULT_SETTINGS, ...parsed}` to backfill them silently.
 * That is fine for additive changes, but it has no way to tell "a blob from
 * before this shape existed" apart from "a blob from this shape with a field
 * missing", so it cannot announce anything and cannot ever *remove* a field
 * safely.
 *
 * `schemaVersion` fixes that going forward. A blob carrying the current
 * version is trusted and merged in place, same as before. A blob that
 * doesn't — including every blob written before this ticket — is treated as
 * the old, unversioned shape: Profiles (Maps, per-entry metadata, Command
 * catalogues) are irreplaceable and carry across untouched, but Dashboards,
 * Workspaces, layouts and preferences earn fresh defaults rather than being
 * interpreted against a shape they were never written for. `justMigrated`
 * reports when that happened so the shell can announce it once, rather than
 * a user reading an empty Dashboard list as data loss.
 *
 * A blob that is not merely old-shaped but genuinely unreadable — corrupt
 * JSON, or JSON that isn't even an object — has nothing left to carry
 * across: `profilesCarriedOver` is false there, distinct from the ordinary
 * old-shape case where it's Profiles specifically that survive.
 */

import {
  CNC_PROFILE_ID,
  DEFAULT_PROFILE_ID,
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION,
  type MapProfile,
  type UserSettings,
} from '../types/settings';
import { resolveThemeId } from '../appThemes';
import { backfillProfileBindingSnapshots, entriesBySpaceForProfile } from '../shell/bindingBackfill';

// System registers are protocol-fixed (library-managed, read-only over the wire) and
// identical across every device. They are not part of user customization — every
// profile carries this same canonical map so the System tab is never empty.
export const DEFAULT_SYSTEM_REGISTERS_MAP = `// System registers are library-managed and read-only from the protocol.
// Accessed via command byte 6 (READ_SYSTEM_REGISTER).
// Defined in ds_system_register_names.h from the datastream library.

uint32_t            DS_PACKET_COUNT;
uint32_t            DS_ERROR_COUNT;
uint32_t            CONTROL_INTERFACE;
uint32_t            COUNTER_1HZ;
`;

export interface LoadedSettings {
  readonly settings: UserSettings;
  /**
   * True when the stored blob predated schema versioning (or named a
   * version this build does not recognise) and Dashboards, Workspaces,
   * layouts and preferences were reset to defaults as a result. False for a
   * fresh install (nothing stored) — there is nothing to announce a loss
   * of there. Carried through `SettingsContext`'s `justMigrated` under the
   * same name, so the value has one identity from this module to its consumers.
   */
  readonly justMigrated: boolean;
  /**
   * True unless `justMigrated` is true *and* nothing could actually be read
   * back out of the stored blob — the corrupt or unparsable cases, where
   * `mapProfiles` is empty because there was nothing left to sanitize, not
   * because the Profile collection itself was empty. A consumer's one-time
   * notice needs this to avoid telling someone their Profiles "carried
   * across untouched" when the truth is closer to the opposite.
   */
  readonly profilesCarriedOver: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A plain object, or `fallback` if `value` isn't one — the guard `{...x}` itself skips. */
function asPlainObject(value: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  return isPlainObject(value) ? value : fallback;
}

function isPlausibleMapProfile(value: unknown): value is MapProfile {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    value.id !== '' &&
    typeof value.name === 'string' &&
    typeof value.registersMap === 'string' &&
    typeof value.parametersMap === 'string' &&
    typeof value.createdAt === 'number'
  );
}

/**
 * Keeps whatever Profiles in a stored collection still look like a Profile,
 * dropping the rest — mirroring `workspaceStore`/`dashboardStore`'s own
 * "one corrupt entry must not cost every other saved one" precedent. Never
 * throws: a caller handing this anything from `JSON.parse` on an untrusted
 * blob needs that guarantee more than it needs the rejected entries back.
 */
export function sanitizeStoredMapProfiles(value: unknown): MapProfile[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlausibleMapProfile);
}

/**
 * Backfills any binding, write target or Plot series snapshot missing
 * because it was saved before `.scratch/map-binding-drift` shipped — see
 * `shell/bindingBackfill.ts`'s own doc comment for why this must run here,
 * against the Map as it stands at load, rather than being recomputed live on
 * every read. Skips a Profile with no Dashboards or Workspaces at all
 * (nothing to backfill) without parsing its Maps for nothing. Only Profiles
 * listed in `mapProfiles` are covered here — the Default and CNC Profiles'
 * own Map text is fetched separately and backfilled once loaded, from
 * `SettingsContext.tsx`'s own effect.
 */
function backfillAllProfileBindings(settings: UserSettings): UserSettings {
  let dashboardsByProfile = settings.dashboardsByProfile;
  let workspacesByProfile = settings.workspacesByProfile;
  let anyChanged = false;

  for (const profile of settings.mapProfiles) {
    const dashboards = dashboardsByProfile[profile.id];
    const workspaces = workspacesByProfile[profile.id];
    if (dashboards === undefined && workspaces === undefined) continue;

    const result = backfillProfileBindingSnapshots(dashboards, workspaces, entriesBySpaceForProfile(profile));
    if (!result.changed) continue;

    anyChanged = true;
    if (result.dashboards !== undefined) dashboardsByProfile = { ...dashboardsByProfile, [profile.id]: result.dashboards };
    if (result.workspaces !== undefined) workspacesByProfile = { ...workspacesByProfile, [profile.id]: result.workspaces };
  }

  return anyChanged ? { ...settings, dashboardsByProfile, workspacesByProfile } : settings;
}

/** Backfills system registers, remaps a retired theme id, stamps the current schema version, and backfills binding snapshots. */
function finalizeSettings(settings: UserSettings): UserSettings {
  return backfillAllProfileBindings({
    ...settings,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    colorThemeId: resolveThemeId(settings.colorThemeId),
    mapProfiles: settings.mapProfiles.map(p =>
      p.systemRegistersMap ? p : { ...p, systemRegistersMap: DEFAULT_SYSTEM_REGISTERS_MAP }
    ),
  });
}

function mergeCurrentShape(parsed: Record<string, unknown>): UserSettings {
  // Deep merge nested objects so new fields added to defaults are not lost.
  const merged: UserSettings = {
    ...DEFAULT_SETTINGS,
    ...(parsed as Partial<UserSettings>),
    logSettings: { ...DEFAULT_SETTINGS.logSettings, ...asPlainObject(parsed.logSettings, {}) },
    plotDefaults: { ...DEFAULT_SETTINGS.plotDefaults, ...asPlainObject(parsed.plotDefaults, {}) },
    dashboardView: { ...DEFAULT_SETTINGS.dashboardView, ...asPlainObject(parsed.dashboardView, {}) },
  };
  merged.mapProfiles = sanitizeStoredMapProfiles(merged.mapProfiles);
  return finalizeSettings(merged);
}

/** The stored active Profile id, if it still names a Profile that survived migration. */
function resolveActiveProfileId(value: unknown, profiles: readonly MapProfile[]): string {
  if (typeof value !== 'string') return DEFAULT_SETTINGS.activeMapProfileId;
  if (value === DEFAULT_PROFILE_ID || value === CNC_PROFILE_ID) return value;
  return profiles.some(p => p.id === value) ? value : DEFAULT_SETTINGS.activeMapProfileId;
}

/**
 * The old-shape (or unrecognised-version) path: only `mapProfiles` and which
 * one was active cross over. Everything else — Dashboards, Workspaces,
 * layouts and preferences — comes from `DEFAULT_SETTINGS`, since there is no
 * version marker on the input to say what any other field actually means.
 */
function resetPreservingProfiles(parsed: Record<string, unknown>): UserSettings {
  const mapProfiles = sanitizeStoredMapProfiles(parsed.mapProfiles);
  const activeMapProfileId = resolveActiveProfileId(parsed.activeMapProfileId, mapProfiles);
  return finalizeSettings({
    ...DEFAULT_SETTINGS,
    mapProfiles,
    activeMapProfileId,
  });
}

/**
 * Parses and migrates a `dshub_settings` blob straight from `localStorage`.
 *
 * No filesystem or storage access here — this is the pure half of loading,
 * so a test can exercise every input shape (absent, corrupt, old-shape,
 * current) without touching `localStorage` at all.
 */
export function migrateStoredSettings(raw: string | null): LoadedSettings {
  if (raw === null) {
    return { settings: DEFAULT_SETTINGS, justMigrated: false, profilesCarriedOver: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error('Stored settings could not be parsed; resetting to defaults.', error);
    return { settings: DEFAULT_SETTINGS, justMigrated: true, profilesCarriedOver: false };
  }

  if (!isPlainObject(parsed)) {
    console.error('Stored settings were not an object; resetting to defaults.');
    return { settings: DEFAULT_SETTINGS, justMigrated: true, profilesCarriedOver: false };
  }

  if (parsed.schemaVersion === SETTINGS_SCHEMA_VERSION) {
    return { settings: mergeCurrentShape(parsed), justMigrated: false, profilesCarriedOver: true };
  }

  return { settings: resetPreservingProfiles(parsed), justMigrated: true, profilesCarriedOver: true };
}
