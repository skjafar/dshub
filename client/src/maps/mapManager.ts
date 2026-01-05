import { MapEntry, ParsedMap, parseMapFile, loadMapFile, BoardTypeEntry, parseBoardTypesMap, getDefaultBoardTypes } from './mapParser';
import { MapProfile, DEFAULT_PROFILE_ID } from '../types/settings';

export class MapManager {
  private registersMap: ParsedMap | null = null;
  private parametersMap: ParsedMap | null = null;
  private boardTypesMap: BoardTypeEntry[] = [];
  private isLoaded = false;

  async initialize(profile?: MapProfile | null): Promise<void> {
    try {
      if (profile && profile.id !== DEFAULT_PROFILE_ID) {
        // Use custom profile maps (stored as raw file content)
        console.log(`Loading maps from profile: ${profile.name}`);

        // Parse the maps from profile content
        this.registersMap = parseMapFile(profile.registersMap, true);
        this.parametersMap = parseMapFile(profile.parametersMap, false);

        // Parse board types map if provided, otherwise use defaults
        this.boardTypesMap = profile.boardTypesMap
          ? parseBoardTypesMap(profile.boardTypesMap)
          : getDefaultBoardTypes();

        console.log('Profile maps loaded:', {
          registers: this.registersMap.entries.length,
          parameters: this.parametersMap.entries.length,
          boardTypes: this.boardTypesMap.length
        });
      } else if (profile && profile.id === DEFAULT_PROFILE_ID) {
        // Use default profile (already loaded from /maps folder)
        console.log('Loading default maps from profile');

        this.registersMap = parseMapFile(profile.registersMap, true);
        this.parametersMap = parseMapFile(profile.parametersMap, false);

        // Parse board types map if provided, otherwise use defaults
        this.boardTypesMap = profile.boardTypesMap
          ? parseBoardTypesMap(profile.boardTypesMap)
          : getDefaultBoardTypes();

        console.log('Default maps loaded:', {
          registers: this.registersMap.entries.length,
          parameters: this.parametersMap.entries.length,
          boardTypes: this.boardTypesMap.length
        });
      } else {
        // Fallback: Load default map files directly
        console.log('No profile provided, loading default maps');

        const [registersContent, parametersContent] = await Promise.all([
          loadMapFile('registers.map'),
          loadMapFile('parameters.map')
        ]);

        this.registersMap = parseMapFile(registersContent, true);
        this.parametersMap = parseMapFile(parametersContent, false);

        // Try to load board types map, fall back to defaults if not found
        try {
          const boardTypesContent = await loadMapFile('boardtypes.map');
          this.boardTypesMap = parseBoardTypesMap(boardTypesContent);
        } catch (error) {
          console.log('Board types map not found, using defaults');
          this.boardTypesMap = getDefaultBoardTypes();
        }

        console.log('Default maps loaded:', {
          registers: this.registersMap.entries.length,
          parameters: this.parametersMap.entries.length,
          boardTypes: this.boardTypesMap.length
        });
      }

      this.isLoaded = true;
    } catch (error) {
      console.error('Failed to initialize maps:', error);
      throw error;
    }
  }

  // Force reload maps (useful when profile changes)
  async reload(profile?: MapProfile | null): Promise<void> {
    this.isLoaded = false;
    await this.initialize(profile);
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