import { MapEntry, ParsedMap, parseMapFile, loadMapFile } from './mapParser';
import { MapProfile, DEFAULT_PROFILE_ID } from '../types/settings';

export class MapManager {
  private registersMap: ParsedMap | null = null;
  private parametersMap: ParsedMap | null = null;
  private isLoaded = false;

  async initialize(profile?: MapProfile | null): Promise<void> {
    try {
      if (profile && profile.id !== DEFAULT_PROFILE_ID) {
        // Use custom profile maps (stored as raw file content)
        console.log(`Loading maps from profile: ${profile.name}`);

        // Parse the maps from profile content
        this.registersMap = parseMapFile(profile.registersMap, true);
        this.parametersMap = parseMapFile(profile.parametersMap, false);

        console.log('Profile maps loaded:', {
          registers: this.registersMap.entries.length,
          parameters: this.parametersMap.entries.length
        });
      } else if (profile && profile.id === DEFAULT_PROFILE_ID) {
        // Use default profile (already loaded from /maps folder)
        console.log('Loading default maps from profile');

        this.registersMap = parseMapFile(profile.registersMap, true);
        this.parametersMap = parseMapFile(profile.parametersMap, false);

        console.log('Default maps loaded:', {
          registers: this.registersMap.entries.length,
          parameters: this.parametersMap.entries.length
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

        console.log('Default maps loaded:', {
          registers: this.registersMap.entries.length,
          parameters: this.parametersMap.entries.length
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
}

// Singleton instance
export const mapManager = new MapManager();