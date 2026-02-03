import { DashboardLayout } from './dashboard';

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

// Custom maps structure for validation
export interface CustomMaps {
  name?: string;
  registers?: RegisterMapItem[];
  parameters?: ParameterMapItem[];
}

// Board type mapping entry
export interface BoardTypeEntry {
  id: number;
  name: string;
}

// SYS_COMMAND entry
export interface SysCommand {
  code: number;
  name: string;
  description?: string;
}

// Map profile with separate register and parameter map files
export interface MapProfile {
  id: string;
  name: string;
  isDefault: boolean;
  registersMap: string; // File content as string
  parametersMap: string; // File content as string
  boardTypesMap?: string; // Optional board types map content
  sysCommands?: SysCommand[]; // Optional list of system commands
  createdAt: number;
  lastUsed?: number;
}

export interface LogSettings {
  enableConnectionLogs: boolean; // Connection, state, scanning, system events
  enableRegisterLogs: boolean; // Register read/write responses
  enableParameterLogs: boolean; // Parameter read/write responses
  enablePacketLogs: boolean; // Detailed packet hex dumps and analysis (very verbose)
  enableAutoRefreshLogs: boolean; // Auto-refresh operation logs
  enablePlottingLogs: boolean; // Plot start/stop logs
  maxLogCount: number; // Maximum number of log entries to retain (100-10000)
  requestRateLimit: number; // Maximum requests per second (default: 2000)
}

export interface UserSettings {
  theme: ThemeMode;
  lastDeviceIP: string;
  lastDeviceName?: string; // Board name of last connected device
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
  logSettings: LogSettings; // Activity log filtering and retention settings
  dashboardLayouts: Record<string, DashboardLayout>; // Dashboard layouts per profile ID
}

export const DEFAULT_PROFILE_ID = 'default';
export const CNC_PROFILE_ID = 'cnc_motor_controller';

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
  activeMapProfileId: DEFAULT_PROFILE_ID,
  logSettings: {
    enableConnectionLogs: true, // Recommended: Always show important system events
    enableRegisterLogs: false, // Default off: Medium impact
    enableParameterLogs: false, // Default off: Medium impact
    enablePacketLogs: false, // Default off: Very high impact (verbose hex dumps)
    enableAutoRefreshLogs: false, // Default off: Low impact but can be noisy
    enablePlottingLogs: false, // Default off: Low impact
    maxLogCount: 1000, // Default: 1000 entries (balanced performance)
    requestRateLimit: 2000 // Default: 2000 requests/second (prevents device overload)
  },
  dashboardLayouts: {} // Dashboard layouts per profile (empty by default)
};
