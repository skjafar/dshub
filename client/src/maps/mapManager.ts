import { MapEntry, ParsedMap, parseMapFile, loadMapFile, BoardTypeEntry, parseBoardTypesMap, getDefaultBoardTypes } from './mapParser';
import { MapProfile, DEFAULT_PROFILE_ID, EntryMetadata } from '../types/settings';

/** Apply profile metadata (description, unit, valueList) to parsed entries in-place.
 *  Metadata is keyed by base name, so array entries like NAME[3] match key "NAME". */
function applyMetadata(entries: MapEntry[], metadata: Record<string, EntryMetadata>): void {
  for (const entry of entries) {
    const baseName = entry.isArray ? entry.name.replace(/\[\d+\]$/, '') : entry.name;
    const meta = metadata[baseName];
    if (!meta) continue;
    if (meta.description !== undefined) entry.description = meta.description;
    if (meta.unit       !== undefined) entry.unit        = meta.unit;
    if (meta.valueList  !== undefined) entry.valueList   = meta.valueList;
  }
}

export class MapManager {
  private registersMap: ParsedMap | null = null;
  private parametersMap: ParsedMap | null = null;
  private systemRegistersMap: ParsedMap | null = null;
  private boardTypesMap: BoardTypeEntry[] = [];
  private isLoaded = false;
  private isLoading = false;
  private currentProfileId: string | null = null;

  async initialize(profile?: MapProfile | null): Promise<void> {
    try {
      if (profile) {
        console.log(`Loading maps from profile: ${profile.name}`);

        this.registersMap = parseMapFile(profile.registersMap, true);
        if (profile.registersMetadata) applyMetadata(this.registersMap.entries, profile.registersMetadata);

        this.parametersMap = parseMapFile(profile.parametersMap, false);
        if (profile.parametersMetadata) applyMetadata(this.parametersMap.entries, profile.parametersMetadata);

        // System registers map: use profile content if present, else empty
        this.systemRegistersMap = profile.systemRegistersMap
          ? parseMapFile(profile.systemRegistersMap, false)
          : null;

        this.boardTypesMap = profile.boardTypesMap
          ? parseBoardTypesMap(profile.boardTypesMap)
          : getDefaultBoardTypes();

        console.log('Profile maps loaded:', {
          registers: this.registersMap.entries.length,
          parameters: this.parametersMap.entries.length,
          systemRegisters: this.systemRegistersMap?.entries.length ?? 0,
          boardTypes: this.boardTypesMap.length
        });

        this.currentProfileId = profile.id;
      } else {
        // Fallback: Load default map files directly
        console.log('No profile provided, loading default maps');

        const [registersContent, parametersContent] = await Promise.all([
          loadMapFile('registers.map'),
          loadMapFile('parameters.map')
        ]);

        this.registersMap = parseMapFile(registersContent, true);
        this.parametersMap = parseMapFile(parametersContent, false);

        try {
          const sysContent = await loadMapFile('system_registers.map');
          this.systemRegistersMap = parseMapFile(sysContent, false);
        } catch {
          console.log('system_registers.map not found, system tab will be empty');
          this.systemRegistersMap = null;
        }

        try {
          const boardTypesContent = await loadMapFile('boardtypes.map');
          this.boardTypesMap = parseBoardTypesMap(boardTypesContent);
        } catch {
          this.boardTypesMap = getDefaultBoardTypes();
        }

        console.log('Default maps loaded:', {
          registers: this.registersMap.entries.length,
          parameters: this.parametersMap.entries.length,
          systemRegisters: this.systemRegistersMap?.entries.length ?? 0,
          boardTypes: this.boardTypesMap.length
        });

        this.currentProfileId = DEFAULT_PROFILE_ID;
      }

      this.isLoaded = true;
    } catch (error) {
      console.error('Failed to initialize maps:', error);
      throw error;
    }
  }

  /**
   * Force reload maps (useful when profile changes).
   * Prevents race conditions by rejecting concurrent reload attempts.
   * IMPORTANT: Only one reload can be in progress at a time.
   *
   * @param profile The map profile to load, or null for defaults
   * @throws Error if reload is already in progress
   */
  async reload(profile?: MapProfile | null): Promise<void> {
    if (this.isLoading) {
      throw new Error('Map reload already in progress');
    }

    this.isLoading = true;
    try {
      this.isLoaded = false;
      await this.initialize(profile);
    } finally {
      this.isLoading = false;
    }
  }
  
  getRegisterByName(name: string): MapEntry | undefined {
    if (!this.registersMap) return undefined;
    return this.registersMap.entries.find(entry => entry.name === name);
  }
  
  getRegisterByAddress(address: number): MapEntry | undefined {
    if (!this.registersMap) return undefined;
    return this.registersMap.entries.find(entry => entry.address === address);
  }
  
  getParameterByName(name: string): MapEntry | undefined {
    if (!this.parametersMap) return undefined;
    return this.parametersMap.entries.find(entry => entry.name === name);
  }
  
  getParameterByAddress(address: number): MapEntry | undefined {
    if (!this.parametersMap) return undefined;
    return this.parametersMap.entries.find(entry => entry.address === address);
  }
  
  getAllRegisters(): MapEntry[] {
    return this.registersMap?.entries || [];
  }
  
  getAllParameters(): MapEntry[] {
    return this.parametersMap?.entries || [];
  }
  
  getReadOnlyRegisters(): MapEntry[] {
    if (!this.registersMap) return [];
    const maxIndex = this.registersMap.readOnlyMaxIndex;
    if (maxIndex === -1) return this.registersMap.entries;
    return this.registersMap.entries.filter(entry => entry.address <= maxIndex);
  }
  
  getReadWriteRegisters(): MapEntry[] {
    if (!this.registersMap) return [];
    const maxIndex = this.registersMap.readOnlyMaxIndex;
    if (maxIndex === -1) return [];
    return this.registersMap.entries.filter(entry => entry.address > maxIndex);
  }
  
  isInitialized(): boolean {
    return this.isLoaded;
  }

  getCurrentProfileId(): string | null {
    return this.currentProfileId;
  }

  // System register methods (cmd 6 — library-managed, read-only from protocol)
  getAllSystemRegisters(): MapEntry[] {
    return this.systemRegistersMap?.entries ?? [];
  }

  getSystemRegisterByAddress(address: number): MapEntry | undefined {
    return this.systemRegistersMap?.entries.find(e => e.address === address);
  }

  getSystemRegisterByName(name: string): MapEntry | undefined {
    return this.systemRegistersMap?.entries.find(e => e.name === name);
  }

  // Board types methods
  getBoardTypeName(typeId: number): string {
    const entry = this.boardTypesMap.find(bt => bt.id === typeId);
    return entry ? entry.name : `Unknown (${typeId})`;
  }

  getAllBoardTypes(): BoardTypeEntry[] {
    return this.boardTypesMap;
  }
}

// Singleton instance
export const mapManager = new MapManager();