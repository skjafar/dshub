import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserSettings, DEFAULT_SETTINGS, MapProfile, DEFAULT_PROFILE_ID, CNC_PROFILE_ID, SysCommand } from '../types/settings';
import { createCNCDashboard } from '../utils/cncDashboardTemplate';

const STORAGE_KEY = 'devicemon_settings';

interface SettingsContextType {
  settings: UserSettings;
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

function saveSettingsToStorage(settings: UserSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings to localStorage:', error);
  }
}

interface SettingsProviderProps {
  children: React.ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<UserSettings>(loadSettingsFromStorage);
  const [defaultProfile, setDefaultProfile] = useState<MapProfile | null>(null);
  const [cncProfile, setCncProfile] = useState<MapProfile | null>(null);

  // Load default and CNC profiles on mount
  useEffect(() => {
    Promise.all([
      loadDefaultProfile().then(profile => setDefaultProfile(profile)),
      loadCNCProfile().then(profile => setCncProfile(profile))
    ]).catch(error => {
      console.error('Failed to load profiles:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize CNC dashboard when CNC profile is loaded
  useEffect(() => {
    if (cncProfile) {
      const sessionKey = `cnc_dashboard_loaded_${CNC_PROFILE_ID}`;
      const loadedInSession = sessionStorage.getItem(sessionKey);

      setSettings(prev => {
        const existingDashboard = prev.dashboardLayouts[CNC_PROFILE_ID];

        // Always reload the template on first load in this session
        // OR if dashboard doesn't exist/is empty
        const needsCreation = !loadedInSession ||
          !existingDashboard ||
          !existingDashboard.tabs ||
          existingDashboard.tabs.length === 0 ||
          existingDashboard.tabs.every(tab => !tab.widgets || tab.widgets.length === 0);

        if (needsCreation) {
          console.log('Creating CNC dashboard for profile:', CNC_PROFILE_ID);
          // Mark as loaded in this session
          sessionStorage.setItem(sessionKey, 'true');

          return {
            ...prev,
            dashboardLayouts: {
              ...prev.dashboardLayouts,
              [CNC_PROFILE_ID]: createCNCDashboard()
            }
          };
        }
        return prev;
      });
    }
  }, [cncProfile]);

  // Save to localStorage whenever settings change
  useEffect(() => {
    saveSettingsToStorage(settings);
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

  // Load CNC profile from public maps folder
  const loadCNCProfile = useCallback(async (): Promise<MapProfile> => {
    try {
      const [registersResponse, parametersResponse] = await Promise.all([
        fetch('/maps/cnc_registers.map'),
        fetch('/maps/cnc_parameters.map')
      ]);

      const registersMap = await registersResponse.text();
      const parametersMap = await parametersResponse.text();

      // CNC Motor Controller system commands
      const sysCommands: SysCommand[] = [
        { code: 200, name: 'ENABLE_ALL_MOTORS', description: 'Enable all motors' },
        { code: 201, name: 'DISABLE_ALL_MOTORS', description: 'Disable all motors' },
        { code: 202, name: 'ENABLE_MOTOR_X', description: 'Enable X-axis motor' },
        { code: 203, name: 'ENABLE_MOTOR_Y', description: 'Enable Y-axis motor' },
        { code: 204, name: 'ENABLE_MOTOR_Z', description: 'Enable Z-axis motor' },
        { code: 205, name: 'DISABLE_MOTOR_X', description: 'Disable X-axis motor' },
        { code: 206, name: 'DISABLE_MOTOR_Y', description: 'Disable Y-axis motor' },
        { code: 207, name: 'DISABLE_MOTOR_Z', description: 'Disable Z-axis motor' },
        { code: 208, name: 'ENABLE_SPINDLE', description: 'Enable spindle' },
        { code: 209, name: 'DISABLE_SPINDLE', description: 'Disable spindle' },
        { code: 210, name: 'HOME_ALL', description: 'Home all axes' },
        { code: 211, name: 'HOME_X', description: 'Home X-axis only' },
        { code: 212, name: 'HOME_Y', description: 'Home Y-axis only' },
        { code: 213, name: 'HOME_Z', description: 'Home Z-axis only' },
        { code: 214, name: 'E_STOP', description: 'Emergency stop' },
        { code: 215, name: 'RESET_E_STOP', description: 'Reset emergency stop' },
        { code: 216, name: 'CLEAR_ERRORS', description: 'Clear error state' },
        { code: 220, name: 'JOG_X_POSITIVE', description: 'Jog X-axis positive' },
        { code: 221, name: 'JOG_X_NEGATIVE', description: 'Jog X-axis negative' },
        { code: 222, name: 'JOG_Y_POSITIVE', description: 'Jog Y-axis positive' },
        { code: 223, name: 'JOG_Y_NEGATIVE', description: 'Jog Y-axis negative' },
        { code: 224, name: 'JOG_Z_POSITIVE', description: 'Jog Z-axis positive' },
        { code: 225, name: 'JOG_Z_NEGATIVE', description: 'Jog Z-axis negative' }
      ];

      return {
        id: CNC_PROFILE_ID,
        name: 'CNC Motor Controller',
        isDefault: false,
        registersMap,
        parametersMap,
        sysCommands,
        createdAt: 0,
      };
    } catch (error) {
      console.error('Failed to load CNC profile maps:', error);
      throw error;
    }
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
    if (profileId === DEFAULT_PROFILE_ID) {
      console.error('Cannot update default profile');
      return false;
    }
    if (profileId === CNC_PROFILE_ID) {
      console.error('Cannot update CNC profile');
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
    if (profileId === DEFAULT_PROFILE_ID) {
      console.error('Cannot delete default profile');
      return false;
    }
    if (profileId === CNC_PROFILE_ID) {
      console.error('Cannot delete CNC profile');
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
      // Update last used timestamp if not default or CNC
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
