import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserSettings, DEFAULT_SETTINGS, MapProfile, DEFAULT_PROFILE_ID, CNC_PROFILE_ID, SysCommand } from '../types/settings';
import { createModernCNCDashboard, CNC_SYS_COMMANDS } from '../utils/cncDashboardTemplate';

const STORAGE_KEY = 'dshub_settings';

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
  createProfile: (name: string, registersContent: string, parametersContent: string, sysCommands?: SysCommand[], boardTypesContent?: string) => string;
  updateProfile: (profileId: string, registersContent: string, parametersContent: string, sysCommands?: SysCommand[], boardTypesContent?: string) => boolean;
  deleteProfile: (profileId: string) => boolean;
  activateProfile: (profileId: string) => boolean;
  downloadProfileMaps: (profileId: string) => { registers: string; parameters: string; boardTypes?: string } | null;
  loadDefaultProfile: () => Promise<MapProfile>;
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
      // Merge with defaults to ensure new settings are added
      return { ...DEFAULT_SETTINGS, ...parsed };
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
        console.log('CNC profile not available:', error);
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-create CNC dashboard when CNC profile is loaded and no dashboard exists yet
  useEffect(() => {
    if (!cncProfile) return;
    if (settings.dashboardLayouts[CNC_PROFILE_ID]) return;

    updateSettings({
      dashboardLayouts: {
        ...settings.dashboardLayouts,
        [CNC_PROFILE_ID]: createModernCNCDashboard()
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cncProfile]);

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
        console.log('Board types map not found, will use defaults');
      }

      return {
        id: DEFAULT_PROFILE_ID,
        name: 'Default Maps',
        isDefault: true,
        registersMap,
        parametersMap,
        boardTypesMap,
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

    return {
      id: CNC_PROFILE_ID,
      name: 'CNC Motor Controller',
      isDefault: true,
      registersMap,
      parametersMap,
      sysCommands: CNC_SYS_COMMANDS,
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

  // Create a new profile
  const createProfile = useCallback((name: string, registersContent: string, parametersContent: string, sysCommands?: SysCommand[], boardTypesContent?: string): string => {
    const profileId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newProfile: MapProfile = {
      id: profileId,
      name,
      isDefault: false,
      registersMap: registersContent,
      parametersMap: parametersContent,
      boardTypesMap: boardTypesContent,
      sysCommands,
      createdAt: Date.now(),
    };

    setSettings(prev => ({
      ...prev,
      mapProfiles: [...prev.mapProfiles, newProfile]
    }));

    return profileId;
  }, []);

  // Update an existing profile (cannot update default or CNC)
  const updateProfile = useCallback((profileId: string, registersContent: string, parametersContent: string, sysCommands?: SysCommand[], boardTypesContent?: string): boolean => {
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
        sysCommands,
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
  const downloadProfileMaps = useCallback((profileId: string): { registers: string; parameters: string; boardTypes?: string } | null => {
    const profile = getAllProfiles().find(p => p.id === profileId);
    if (!profile) return null;

    return {
      registers: profile.registersMap,
      parameters: profile.parametersMap,
      boardTypes: profile.boardTypesMap
    };
  }, [getAllProfiles]);

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
    loadDefaultProfile
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
