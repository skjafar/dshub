import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserSettings, DEFAULT_SETTINGS, MapProfile, DEFAULT_PROFILE_ID, CNC_PROFILE_ID, SysCommand, EntryMetadata } from '../types/settings';
import { createModernCNCDashboard, CNC_SYS_COMMANDS, CNC_DASHBOARD_VERSION, CNC_REGISTERS_METADATA, CNC_PARAMETERS_METADATA } from '../utils/cncDashboardTemplate';
import { serializeProfile, parseProfileFile, ProfileImportResult } from '../utils/profileFileFormat';
import { mapManager } from '../maps/mapManager';
import { logger } from '../utils/logger';

const STORAGE_KEY = 'dshub_settings';

// System registers are protocol-fixed (library-managed, read-only over the wire) and
// identical across every device. They are not part of user customization — every
// profile carries this same canonical map so the System tab is never empty.
const DEFAULT_SYSTEM_REGISTERS_MAP = `// System registers are library-managed and read-only from the protocol.
// Accessed via command byte 6 (READ_SYSTEM_REGISTER).
// Defined in ds_system_register_names.h from the datastream library.

uint32_t            DS_PACKET_COUNT;
uint32_t            DS_ERROR_COUNT;
uint32_t            CONTROL_INTERFACE;
uint32_t            COUNTER_1HZ;
`;

interface SettingsContextType {
  settings: UserSettings;
  storageError: boolean; // true when localStorage quota is exceeded and settings cannot be saved
  updateSettings: (updates: Partial<UserSettings>) => void;
  resetSettings: () => void;
  exportSettings: () => string;
  importSettings: (json: string) => boolean;
  // Map profile management
  getAllProfiles: () => MapProfile[]; // Returns all profiles including default
  getActiveProfile: () => MapProfile | null;
  createProfile: (name: string, registersContent: string, parametersContent: string, sysCommands?: SysCommand[], boardTypesContent?: string, registersMetadata?: Record<string, EntryMetadata>, parametersMetadata?: Record<string, EntryMetadata>) => string;
  updateProfile: (profileId: string, registersContent: string, parametersContent: string, sysCommands?: SysCommand[], boardTypesContent?: string, registersMetadata?: Record<string, EntryMetadata>, parametersMetadata?: Record<string, EntryMetadata>) => boolean;
  deleteProfile: (profileId: string) => boolean;
  activateProfile: (profileId: string) => boolean;
  downloadProfileMaps: (profileId: string) => { registers: string; parameters: string; boardTypes?: string; systemRegisters?: string } | null;
  loadDefaultProfile: () => Promise<MapProfile>;
  // Profile file import/export
  exportProfile: (profileId: string) => string | null;
  importProfile: (json: string) => ProfileImportResult & { profileId?: string };
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}

function loadSettingsFromStorage(): UserSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Deep merge nested objects so new fields added to defaults are not lost
      const merged: UserSettings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        logSettings: { ...DEFAULT_SETTINGS.logSettings, ...parsed.logSettings },
        plotDefaults: { ...DEFAULT_SETTINGS.plotDefaults, ...parsed.plotDefaults },
      };
      // Backfill canonical system registers on legacy user profiles created before
      // they were populated automatically.
      merged.mapProfiles = (merged.mapProfiles ?? []).map(p =>
        p.systemRegistersMap ? p : { ...p, systemRegistersMap: DEFAULT_SYSTEM_REGISTERS_MAP }
      );
      return merged;
    }
  } catch (error) {
    console.error('Failed to load settings from localStorage:', error);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Persists settings to localStorage.
 * Returns false if the write failed (e.g. QuotaExceededError).
 * Callers should surface the failure to the user when this returns false.
 */
function saveSettingsToStorage(settings: UserSettings): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded — settings could not be saved. Clear browser data or reduce stored data.', error);
    } else {
      console.error('Failed to save settings to localStorage:', error);
    }
    return false;
  }
}

interface SettingsProviderProps {
  children: React.ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<UserSettings>(loadSettingsFromStorage);
  const [defaultProfile, setDefaultProfile] = useState<MapProfile | null>(null);
  const [cncProfile, setCncProfile] = useState<MapProfile | null>(null);
  const [storageError, setStorageError] = useState(false);
  const storageWarningShownRef = React.useRef(false); // Only warn once per session

  // Load default and CNC profiles on mount
  useEffect(() => {
    // Load default profile (required for basic functionality)
    loadDefaultProfile()
      .then(profile => setDefaultProfile(profile))
      .catch(error => {
        console.error('CRITICAL: Failed to load default profile:', error);
      });

    // Load CNC profile (optional demo)
    loadCNCProfile()
      .then(profile => setCncProfile(profile))
      .catch(error => {
        logger.log('CNC profile not available:', error);
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-create (or reset) CNC dashboard when CNC profile is loaded or template version changes
  useEffect(() => {
    if (!cncProfile) return;
    if (settings.dashboardLayouts[CNC_PROFILE_ID] && settings.cncDashboardVersion === CNC_DASHBOARD_VERSION) return;

    updateSettings({
      dashboardLayouts: {
        ...settings.dashboardLayouts,
        [CNC_PROFILE_ID]: createModernCNCDashboard()
      },
      cncDashboardVersion: CNC_DASHBOARD_VERSION,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cncProfile]);

  // Initialize mapManager at app level so maps are available on all panels (including dashboard)
  useEffect(() => {
    const activeProfile =
      settings.activeMapProfileId === DEFAULT_PROFILE_ID ? defaultProfile :
      settings.activeMapProfileId === CNC_PROFILE_ID ? cncProfile :
      settings.mapProfiles.find(p => p.id === settings.activeMapProfileId) ?? null;

    if (!activeProfile) return;

    const currentProfileId = mapManager.getCurrentProfileId();
    if (currentProfileId === activeProfile.id && mapManager.isInitialized()) return;

    mapManager.initialize(activeProfile).catch(error => {
      console.error('Failed to initialize mapManager:', error);
    });
  }, [settings.activeMapProfileId, settings.mapProfiles, defaultProfile, cncProfile]);

  // Save to localStorage whenever settings change
  useEffect(() => {
    const success = saveSettingsToStorage(settings);
    if (!success && !storageWarningShownRef.current) {
      // Only set error state once to avoid re-render loops
      storageWarningShownRef.current = true;
      setStorageError(true);
    }
  }, [settings]);

  const updateSettings = useCallback((updates: Partial<UserSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const exportSettings = useCallback((): string => {
    return JSON.stringify(settings, null, 2);
  }, [settings]);

  const importSettings = useCallback((json: string): boolean => {
    try {
      const imported = JSON.parse(json);
      // Validate that it's a valid settings object
      if (typeof imported === 'object' && imported !== null) {
        setSettings({ ...DEFAULT_SETTINGS, ...imported });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to import settings:', error);
      return false;
    }
  }, []);

  // Load default profile from public maps folder
  const loadDefaultProfile = useCallback(async (): Promise<MapProfile> => {
    try {
      const [registersResponse, parametersResponse] = await Promise.all([
        fetch('/maps/registers.map'),
        fetch('/maps/parameters.map')
      ]);

      const registersMap = await registersResponse.text();
      const parametersMap = await parametersResponse.text();

      // Try to load board types map (optional)
      let boardTypesMap: string | undefined = undefined;
      try {
        const boardTypesResponse = await fetch('/maps/boardtypes.map');
        if (boardTypesResponse.ok) {
          boardTypesMap = await boardTypesResponse.text();
        }
      } catch (error) {
        logger.log('Board types map not found, will use defaults');
      }

      // System registers are protocol-fixed; the bundled file is preferred but the
      // canonical constant is the fallback so the System tab is never empty.
      let systemRegistersMap: string = DEFAULT_SYSTEM_REGISTERS_MAP;
      try {
        const systemRegistersResponse = await fetch('/maps/system_registers.map');
        if (systemRegistersResponse.ok) {
          systemRegistersMap = await systemRegistersResponse.text();
        }
      } catch {
        logger.log('system_registers.map not found, using canonical defaults');
      }

      return {
        id: DEFAULT_PROFILE_ID,
        name: 'Default Maps',
        isDefault: true,
        registersMap,
        parametersMap,
        boardTypesMap,
        systemRegistersMap,
        createdAt: 0,
      };
    } catch (error) {
      console.error('Failed to load default maps:', error);
      throw error;
    }
  }, []);

  // Load CNC demo profile from public maps folder
  const loadCNCProfile = useCallback(async (): Promise<MapProfile> => {
    const [registersResponse, parametersResponse] = await Promise.all([
      fetch('/maps/cnc_registers.map'),
      fetch('/maps/cnc_parameters.map')
    ]);

    if (!registersResponse.ok || !parametersResponse.ok) {
      throw new Error('CNC map files not found');
    }

    const registersMap = await registersResponse.text();
    const parametersMap = await parametersResponse.text();

    // System registers are protocol-fixed; the bundled file is preferred but the
    // canonical constant is the fallback so the System tab is never empty.
    let systemRegistersMap: string = DEFAULT_SYSTEM_REGISTERS_MAP;
    try {
      const sysRegResponse = await fetch('/maps/cnc_system_registers.map');
      if (sysRegResponse.ok) {
        systemRegistersMap = await sysRegResponse.text();
      }
    } catch {
      logger.log('cnc_system_registers.map not found, using canonical defaults');
    }

    return {
      id: CNC_PROFILE_ID,
      name: 'CNC Motor Controller',
      isDefault: true,
      registersMap,
      parametersMap,
      systemRegistersMap,
      sysCommands: CNC_SYS_COMMANDS,
      registersMetadata: CNC_REGISTERS_METADATA,
      parametersMetadata: CNC_PARAMETERS_METADATA,
      createdAt: 0,
    };
  }, []);

  // Get all profiles including default and CNC
  const getAllProfiles = useCallback((): MapProfile[] => {
    const profiles: MapProfile[] = [];
    if (defaultProfile) {
      profiles.push(defaultProfile);
    }
    if (cncProfile) {
      profiles.push(cncProfile);
    }
    profiles.push(...settings.mapProfiles);
    return profiles;
  }, [defaultProfile, cncProfile, settings.mapProfiles]);

  // Get currently active profile
  const getActiveProfile = useCallback((): MapProfile | null => {
    if (settings.activeMapProfileId === DEFAULT_PROFILE_ID) {
      return defaultProfile;
    }
    if (settings.activeMapProfileId === CNC_PROFILE_ID) {
      return cncProfile;
    }
    return settings.mapProfiles.find(p => p.id === settings.activeMapProfileId) || null;
  }, [settings.activeMapProfileId, settings.mapProfiles, defaultProfile, cncProfile]);

  // Create a new profile. System registers are protocol-fixed and seeded automatically.
  const createProfile = useCallback((name: string, registersContent: string, parametersContent: string, sysCommands?: SysCommand[], boardTypesContent?: string, registersMetadata?: Record<string, EntryMetadata>, parametersMetadata?: Record<string, EntryMetadata>): string => {
    const profileId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newProfile: MapProfile = {
      id: profileId,
      name,
      isDefault: false,
      registersMap: registersContent,
      parametersMap: parametersContent,
      boardTypesMap: boardTypesContent,
      systemRegistersMap: DEFAULT_SYSTEM_REGISTERS_MAP,
      sysCommands,
      registersMetadata,
      parametersMetadata,
      createdAt: Date.now(),
    };

    setSettings(prev => ({
      ...prev,
      mapProfiles: [...prev.mapProfiles, newProfile]
    }));

    return profileId;
  }, []);

  // Update an existing profile (cannot update default or CNC).
  // System registers are protocol-fixed and always reset to canonical content.
  const updateProfile = useCallback((profileId: string, registersContent: string, parametersContent: string, sysCommands?: SysCommand[], boardTypesContent?: string, registersMetadata?: Record<string, EntryMetadata>, parametersMetadata?: Record<string, EntryMetadata>): boolean => {
    if (profileId === DEFAULT_PROFILE_ID || profileId === CNC_PROFILE_ID) {
      console.error('Cannot update built-in profile');
      return false;
    }

    setSettings(prev => {
      const profileIndex = prev.mapProfiles.findIndex(p => p.id === profileId);
      if (profileIndex === -1) return prev;

      const updatedProfiles = [...prev.mapProfiles];
      updatedProfiles[profileIndex] = {
        ...updatedProfiles[profileIndex],
        registersMap: registersContent,
        parametersMap: parametersContent,
        boardTypesMap: boardTypesContent,
        systemRegistersMap: DEFAULT_SYSTEM_REGISTERS_MAP,
        sysCommands,
        registersMetadata,
        parametersMetadata,
      };

      return {
        ...prev,
        mapProfiles: updatedProfiles
      };
    });

    return true;
  }, []);

  // Delete a profile (cannot delete default or CNC)
  const deleteProfile = useCallback((profileId: string): boolean => {
    if (profileId === DEFAULT_PROFILE_ID || profileId === CNC_PROFILE_ID) {
      console.error('Cannot delete built-in profile');
      return false;
    }

    setSettings(prev => ({
      ...prev,
      mapProfiles: prev.mapProfiles.filter(p => p.id !== profileId),
      activeMapProfileId: prev.activeMapProfileId === profileId ? DEFAULT_PROFILE_ID : prev.activeMapProfileId
    }));

    return true;
  }, []);

  // Activate a profile
  const activateProfile = useCallback((profileId: string): boolean => {
    // Verify profile exists
    if (profileId === DEFAULT_PROFILE_ID && !defaultProfile) {
      return false;
    }
    if (profileId === CNC_PROFILE_ID && !cncProfile) {
      return false;
    }
    if (profileId !== DEFAULT_PROFILE_ID && profileId !== CNC_PROFILE_ID && !settings.mapProfiles.find(p => p.id === profileId)) {
      return false;
    }

    setSettings(prev => {
      // Update last used timestamp if not built-in
      let updatedProfiles = prev.mapProfiles;
      if (profileId !== DEFAULT_PROFILE_ID && profileId !== CNC_PROFILE_ID) {
        updatedProfiles = prev.mapProfiles.map(p =>
          p.id === profileId ? { ...p, lastUsed: Date.now() } : p
        );
      }

      return {
        ...prev,
        mapProfiles: updatedProfiles,
        activeMapProfileId: profileId
      };
    });

    return true;
  }, [defaultProfile, cncProfile, settings.mapProfiles]);

  // Download profile maps
  const downloadProfileMaps = useCallback((profileId: string): { registers: string; parameters: string; boardTypes?: string; systemRegisters?: string } | null => {
    const profile = getAllProfiles().find(p => p.id === profileId);
    if (!profile) return null;

    return {
      registers: profile.registersMap,
      parameters: profile.parametersMap,
      boardTypes: profile.boardTypesMap,
      systemRegisters: profile.systemRegistersMap
    };
  }, [getAllProfiles]);

  // Serialize a complete profile (maps + metadata + dashboard) to a .dshub JSON string
  const exportProfile = useCallback((profileId: string): string | null => {
    const profile = getAllProfiles().find(p => p.id === profileId);
    if (!profile) return null;
    const dashboard = settings.dashboardLayouts[profileId];
    return serializeProfile(profile, dashboard);
  }, [getAllProfiles, settings.dashboardLayouts]);

  // Parse a .dshub JSON string and, if valid, create a new profile
  const importProfile = useCallback((json: string): ProfileImportResult & { profileId?: string } => {
    const result = parseProfileFile(json);

    if (!result.file || result.errors.some(e => e.fatal)) {
      return result;
    }

    const { file } = result;
    const profileId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newProfile: MapProfile = {
      id: profileId,
      name: file.name,
      isDefault: false,
      registersMap: file.maps.registers,
      parametersMap: file.maps.parameters,
      systemRegistersMap: DEFAULT_SYSTEM_REGISTERS_MAP,
      boardTypesMap: file.maps.boardTypes,
      sysCommands: file.maps.sysCommands,
      registersMetadata: file.metadata.registers,
      parametersMetadata: file.metadata.parameters,
      createdAt: Date.now(),
    };

    setSettings(prev => {
      const nextLayouts = file.dashboard
        ? { ...prev.dashboardLayouts, [profileId]: file.dashboard! }
        : prev.dashboardLayouts;
      return {
        ...prev,
        mapProfiles: [...prev.mapProfiles, newProfile],
        activeMapProfileId: profileId,
        dashboardLayouts: nextLayouts,
      };
    });

    return { ...result, profileId };
  }, []);

  const value: SettingsContextType = {
    settings,
    storageError,
    updateSettings,
    resetSettings,
    exportSettings,
    importSettings,
    getAllProfiles,
    getActiveProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    activateProfile,
    downloadProfileMaps,
    loadDefaultProfile,
    exportProfile,
    importProfile,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
