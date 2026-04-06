import { MapProfile, SysCommand, EntryMetadata } from '../types/settings';
import { DashboardLayout } from '../types/dashboard';
import { parseMapFile } from '../maps/mapParser';

export const DSHUB_PROFILE_VERSION = 1 as const;

export interface DshubProfileFile {
  dshub_profile: typeof DSHUB_PROFILE_VERSION;
  name: string;
  exportedAt: string; // ISO 8601
  maps: {
    registers: string;
    parameters: string;
    sysCommands: SysCommand[];
    systemRegisters?: string;
    boardTypes?: string;
  };
  metadata: {
    registers: Record<string, EntryMetadata>;
    parameters: Record<string, EntryMetadata>;
  };
  dashboard?: DashboardLayout;
}

export type ProfileImportErrorSection = 'json' | 'registers' | 'parameters' | 'dashboard';

export interface ProfileImportError {
  section: ProfileImportErrorSection;
  line?: number;
  message: string;
  fatal: boolean;
}

export interface ProfileImportResult {
  file?: DshubProfileFile;
  errors: ProfileImportError[];
}

export function serializeProfile(
  profile: MapProfile,
  dashboard?: DashboardLayout
): string {
  const file: DshubProfileFile = {
    dshub_profile: DSHUB_PROFILE_VERSION,
    name: profile.name,
    exportedAt: new Date().toISOString(),
    maps: {
      registers: profile.registersMap,
      parameters: profile.parametersMap,
      sysCommands: profile.sysCommands ?? [],
      systemRegisters: profile.systemRegistersMap,
      boardTypes: profile.boardTypesMap,
    },
    metadata: {
      registers: profile.registersMetadata ?? {},
      parameters: profile.parametersMetadata ?? {},
    },
    dashboard,
  };
  return JSON.stringify(file, null, 2);
}

export function parseProfileFile(json: string): ProfileImportResult {
  const errors: ProfileImportError[] = [];

  // --- JSON parse ---
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return {
      errors: [{
        section: 'json',
        message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
        fatal: true,
      }],
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { errors: [{ section: 'json', message: 'File must be a JSON object', fatal: true }] };
  }

  const obj = parsed as Record<string, unknown>;

  // --- Version check ---
  if (!('dshub_profile' in obj)) {
    return { errors: [{ section: 'json', message: 'Missing dshub_profile version field — this does not appear to be a DSHub profile file', fatal: true }] };
  }
  if (obj.dshub_profile !== DSHUB_PROFILE_VERSION) {
    return { errors: [{ section: 'json', message: `Unsupported profile version ${String(obj.dshub_profile)} — expected ${DSHUB_PROFILE_VERSION}`, fatal: true }] };
  }

  // --- Required fields ---
  if (typeof obj.name !== 'string' || !obj.name.trim()) {
    errors.push({ section: 'json', message: 'Missing or empty profile name', fatal: true });
  }

  if (typeof obj.maps !== 'object' || obj.maps === null) {
    errors.push({ section: 'json', message: 'Missing maps section', fatal: true });
  }

  if (errors.some(e => e.fatal)) return { errors };

  const maps = obj.maps as Record<string, unknown>;

  if (typeof maps.registers !== 'string') {
    errors.push({ section: 'registers', message: 'registers map must be a string', fatal: true });
  }
  if (typeof maps.parameters !== 'string') {
    errors.push({ section: 'parameters', message: 'parameters map must be a string', fatal: true });
  }

  if (errors.some(e => e.fatal)) return { errors };

  // --- Parse map content for errors ---
  const regResult = parseMapFile(maps.registers as string, true);
  for (const err of regResult.errors) {
    errors.push({ section: 'registers', line: err.line, message: err.message, fatal: false });
  }

  const paramResult = parseMapFile(maps.parameters as string, false);
  for (const err of paramResult.errors) {
    errors.push({ section: 'parameters', line: err.line, message: err.message, fatal: false });
  }

  // --- Metadata (lenient) ---
  const rawMeta = (typeof obj.metadata === 'object' && obj.metadata !== null)
    ? obj.metadata as Record<string, unknown>
    : {};
  const registersMetadata = (typeof rawMeta.registers === 'object' && rawMeta.registers !== null)
    ? rawMeta.registers as Record<string, EntryMetadata>
    : {};
  const parametersMetadata = (typeof rawMeta.parameters === 'object' && rawMeta.parameters !== null)
    ? rawMeta.parameters as Record<string, EntryMetadata>
    : {};

  // --- SysCommands (lenient) ---
  const rawCmds = maps.sysCommands;
  const sysCommands: SysCommand[] = Array.isArray(rawCmds)
    ? rawCmds.filter((c): c is SysCommand =>
        typeof c === 'object' && c !== null &&
        typeof (c as Record<string, unknown>).code === 'number' &&
        typeof (c as Record<string, unknown>).name === 'string'
      )
    : [];

  // --- Dashboard (lenient, skip bad widgets) ---
  let dashboard: DashboardLayout | undefined;
  if (typeof obj.dashboard === 'object' && obj.dashboard !== null) {
    try {
      dashboard = obj.dashboard as DashboardLayout;
    } catch {
      errors.push({ section: 'dashboard', message: 'Dashboard data could not be read — it will be skipped', fatal: false });
      dashboard = undefined;
    }
  }

  const file: DshubProfileFile = {
    dshub_profile: DSHUB_PROFILE_VERSION,
    name: (obj.name as string).trim(),
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    maps: {
      registers: maps.registers as string,
      parameters: maps.parameters as string,
      sysCommands,
      systemRegisters: typeof maps.systemRegisters === 'string' ? maps.systemRegisters : undefined,
      boardTypes: typeof maps.boardTypes === 'string' ? maps.boardTypes : undefined,
    },
    metadata: { registers: registersMetadata, parameters: parametersMetadata },
    dashboard,
  };

  return { file, errors };
}
