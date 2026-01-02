import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserSettings, DEFAULT_SETTINGS, MapProfile, DEFAULT_PROFILE_ID } from '../types/settings';

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
  createProfile: (name: string, registersContent: string, parametersContent: string) => string;
  updateProfile: (profileId: string, registersContent: string, parametersContent: string) => boolean;
  deleteProfile: (profileId: string) => boolean;
  activateProfile: (profileId: string) => boolean;
  downloadProfileMaps: (profileId: string) => { registers: string; parameters: string } | null;
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

  // Load default profile on mount
  useEffect(() => {
    loadDefaultProfile().then(profile => {
      setDefaultProfile(profile);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      return {
        id: DEFAULT_PROFILE_ID,
        name: 'Default Maps',
        isDefault: true,
        registersMap,
        parametersMap,
        createdAt: 0,
      };
    } catch (error) {
      console.error('Failed to load default maps:', error);
      throw error;
    }
  }, []);

  // Get all profiles including default
  const getAllProfiles = useCallback((): MapProfile[] => {
    const profiles: MapProfile[] = [];
    if (defaultProfile) {
      profiles.push(defaultProfile);
    }
    profiles.push(...settings.mapProfiles);
    return profiles;
  }, [defaultProfile, settings.mapProfiles]);

  // Get currently active profile
  const getActiveProfile = useCallback((): MapProfile | null => {
    if (settings.activeMapProfileId === DEFAULT_PROFILE_ID) {
      return defaultProfile;
    }
    return settings.mapProfiles.find(p => p.id === settings.activeMapProfileId) || null;
  }, [settings.activeMapProfileId, settings.mapProfiles, defaultProfile]);

  // Create a new profile
  const createProfile = useCallback((name: string, registersContent: string, parametersContent: string): string => {
    const profileId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newProfile: MapProfile = {
      id: profileId,
      name,
      isDefault: false,
      registersMap: registersContent,
      parametersMap: parametersContent,
      createdAt: Date.now(),
    };

    setSettings(prev => ({
      ...prev,
      mapProfiles: [...prev.mapProfiles, newProfile]
    }));

    return profileId;
  }, []);

  // Update an existing profile (cannot update default)
  const updateProfile = useCallback((profileId: string, registersContent: string, parametersContent: string): boolean => {
    if (profileId === DEFAULT_PROFILE_ID) {
      console.error('Cannot update default profile');
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
      };

      return {
        ...prev,
        mapProfiles: updatedProfiles
      };
    });

    return true;
  }, []);

  // Delete a profile (cannot delete default)
  const deleteProfile = useCallback((profileId: string): boolean => {
    if (profileId === DEFAULT_PROFILE_ID) {
      console.error('Cannot delete default profile');
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
    if (profileId !== DEFAULT_PROFILE_ID && !settings.mapProfiles.find(p => p.id === profileId)) {
      return false;
    }

    setSettings(prev => {
      // Update last used timestamp if not default
      let updatedProfiles = prev.mapProfiles;
      if (profileId !== DEFAULT_PROFILE_ID) {
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
  }, [defaultProfile, settings.mapProfiles]);

  // Download profile maps
  const downloadProfileMaps = useCallback((profileId: string): { registers: string; parameters: string } | null => {
    const profile = getAllProfiles().find(p => p.id === profileId);
    if (!profile) return null;

    return {
      registers: profile.registersMap,
      parameters: profile.parametersMap
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
