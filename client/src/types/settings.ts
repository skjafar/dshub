export type ThemeMode = 'light' | 'dark' | 'auto';

export interface RegisterMapItem {
  address: number;
  name: string;
  type: string;
  access: string;
}

export interface ParameterMapItem {
  address: number;
  name: string;
  type: string;
  access: string;
}

// Map profile with separate register and parameter map files
export interface MapProfile {
  id: string;
  name: string;
  isDefault: boolean;
  registersMap: string; // File content as string
  parametersMap: string; // File content as string
  createdAt: number;
  lastUsed?: number;
}

export interface UserSettings {
  theme: ThemeMode;
  lastDeviceIP: string;
  lastInterfaceType: 'TCP' | 'UDP';
  autoScan: boolean; // Auto-scan for devices on startup
  autoConnect: boolean; // Auto-connect to last device on startup
  autoConnectRetries: number; // Number of retry attempts for auto-connect
  autoConnectRetryDelay: number; // Delay between retries in ms
  plotDefaults: {
    pollInterval: number; // Default poll interval for plots in ms
    timeSpan: number; // Default time span in seconds
    maxTimeSpan: number; // Maximum allowed time span in seconds
    maxDataPoints: number; // Maximum number of data points to retain per series
  };
  themeTransitionDuration: number; // Duration of theme transitions in ms
  mapProfiles: MapProfile[]; // Saved map profiles (not including default)
  activeMapProfileId: string; // Currently active profile ID (default or custom)
}

export const DEFAULT_PROFILE_ID = 'default';

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'auto',
  lastDeviceIP: '',
  lastInterfaceType: 'TCP',
  autoScan: true, // Enabled by default for better UX
  autoConnect: false,
  autoConnectRetries: 3,
  autoConnectRetryDelay: 2000,
  plotDefaults: {
    pollInterval: 250,
    timeSpan: 60,
    maxTimeSpan: 3600, // 1 hour max
    maxDataPoints: 20000 // 20k points per series (balance between functionality and memory)
  },
  themeTransitionDuration: 300,
  mapProfiles: [],
  activeMapProfileId: DEFAULT_PROFILE_ID
};
