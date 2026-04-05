import React, { createContext, useContext, useReducer, useEffect, ReactNode, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  DiscoveredDevice,
  DeviceConnection,
  RegisterData,
  ParameterData,
  LogEntry,
  LogCategory,
  PlotDataPoint,
  InterfaceType
} from '../types/shared';
import { LogSettings } from '../types/settings';
import { useSettings } from './SettingsContext';

// Helper function to check if a log category should be logged based on settings
function shouldLogCategory(category: LogCategory, logSettings: LogSettings): boolean {
  switch (category) {
    case 'connection':
      return logSettings.enableConnectionLogs;
    case 'register':
      return logSettings.enableRegisterLogs;
    case 'parameter':
      return logSettings.enableParameterLogs;
    case 'packet':
      return logSettings.enablePacketLogs;
    case 'autoRefresh':
      return logSettings.enableAutoRefreshLogs;
    case 'plotting':
      return logSettings.enablePlottingLogs;
    default:
      return true;
  }
}

interface DSHubState {
  serverConnected: boolean;
  serverError: string | null;
  discoveredDevices: DiscoveredDevice[];
  connection: DeviceConnection | null;
  registers: Map<number, RegisterData>;
  parameters: Map<number, ParameterData>;
  /** System registers (cmd 6) — library-managed, read-only from protocol */
  systemRegisters: Map<number, RegisterData>;
  logs: LogEntry[];
  unreadLogCount: number;
  plotData: Map<string, PlotDataPoint[]>;
  activePlots: Map<string, { address: number; pollInterval: number; source: 'register' | 'sysRegister' }>;
  isScanning: boolean;
  maxDataPoints: number;
  plotTimeSpans: Map<string, number>;
  plotPaused: boolean;
  connecting: boolean;
  autoRefresh: {
    enabled: boolean;
    interval: number;
    activeAddresses: Set<number>;
    activeParameterAddresses: Set<number>;
    activeSystemAddresses: Set<number>;
  };
}

type DSHubAction =
  | { type: 'SET_SERVER_CONNECTED'; payload: boolean }
  | { type: 'ADD_DISCOVERED_DEVICE'; payload: DiscoveredDevice }
  | { type: 'CLEAR_DISCOVERED_DEVICES' }
  | { type: 'SET_CONNECTION'; payload: DeviceConnection }
  | { type: 'UPDATE_REGISTER'; payload: RegisterData }
  | { type: 'UPDATE_PARAMETER'; payload: ParameterData }
  | { type: 'UPDATE_SYSTEM_REGISTER'; payload: RegisterData }
  | { type: 'ADD_LOG_ENTRY'; payload: LogEntry }
  | { type: 'ADD_PLOT_DATA'; payload: { series: string; point: PlotDataPoint } }
  | { type: 'CLEAR_PLOT_DATA'; payload: string }
  | { type: 'ADD_ACTIVE_PLOT'; payload: { registerName: string; address: number; pollInterval: number; source?: 'register' | 'sysRegister' } }
  | { type: 'REMOVE_ACTIVE_PLOT'; payload: string }
  | { type: 'SET_SCANNING'; payload: boolean }
  | { type: 'SET_MAX_DATA_POINTS'; payload: number }
  | { type: 'SET_PLOT_TIME_SPAN'; payload: { series: string; timeSpan: number } }
  | { type: 'SET_PLOT_PAUSED'; payload: boolean }
  | { type: 'CLEAR_LOGS' }
  | { type: 'MARK_LOGS_READ' }
  | { type: 'CLEAR_REGISTERS' }
  | { type: 'CLEAR_PARAMETERS' }
  | { type: 'CLEAR_SYSTEM_REGISTERS' }
  | { type: 'SET_AUTO_REFRESH'; payload: { enabled: boolean; interval?: number } }
  | { type: 'ADD_AUTO_REFRESH_REGISTER'; payload: number }
  | { type: 'REMOVE_AUTO_REFRESH_REGISTER'; payload: number }
  | { type: 'ADD_AUTO_REFRESH_PARAMETER'; payload: number }
  | { type: 'REMOVE_AUTO_REFRESH_PARAMETER'; payload: number }
  | { type: 'ADD_AUTO_REFRESH_SYSTEM_REGISTER'; payload: number }
  | { type: 'REMOVE_AUTO_REFRESH_SYSTEM_REGISTER'; payload: number }
  | { type: 'CLEAR_AUTO_REFRESH_ADDRESSES' }
  | { type: 'SET_CONNECTING'; payload: boolean };

const initialState: DSHubState = {
  serverConnected: true, // Tauri backend is always present
  serverError: null,
  discoveredDevices: [],
  connection: null,
  registers: new Map(),
  parameters: new Map(),
  systemRegisters: new Map(),
  logs: [],
  unreadLogCount: 0,
  plotData: new Map(),
  activePlots: new Map(),
  isScanning: false,
  maxDataPoints: 20000,
  plotTimeSpans: new Map(),
  plotPaused: false,
  connecting: false,
  autoRefresh: {
    enabled: false,
    interval: 1000,
    activeAddresses: new Set<number>(),
    activeParameterAddresses: new Set<number>(),
    activeSystemAddresses: new Set<number>(),
  },
};

function createDSHubReducer(getLogSettings: () => LogSettings) {
  return function dsHubReducer(state: DSHubState, action: DSHubAction): DSHubState {
    const logSettings = getLogSettings();
    switch (action.type) {
      case 'SET_SERVER_CONNECTED':
        return { ...state, serverConnected: action.payload };

      case 'ADD_DISCOVERED_DEVICE': {
        const exists = state.discoveredDevices.some(d => d.ip_address === action.payload.ip_address);
        if (exists) return state;
        return { ...state, discoveredDevices: [...state.discoveredDevices, action.payload] };
      }

      case 'CLEAR_DISCOVERED_DEVICES':
        return { ...state, discoveredDevices: [] };

      case 'SET_CONNECTING':
        return { ...state, connecting: action.payload };

      case 'SET_CONNECTION':
        return { ...state, connection: action.payload };

      case 'UPDATE_REGISTER': {
        const newRegisters = new Map(state.registers);
        newRegisters.set(action.payload.address, action.payload);
        return { ...state, registers: newRegisters };
      }

      case 'UPDATE_PARAMETER': {
        const newParameters = new Map(state.parameters);
        newParameters.set(action.payload.address, action.payload);
        return { ...state, parameters: newParameters };
      }

      case 'ADD_LOG_ENTRY': {
        if (!shouldLogCategory(action.payload.category, logSettings)) {
          return state;
        }
        let newLogs = [...state.logs, action.payload];
        if (newLogs.length > logSettings.maxLogCount) {
          newLogs = newLogs.slice(newLogs.length - logSettings.maxLogCount);
        }
        const isAlertLevel = action.payload.level === 'error' || action.payload.level === 'warning';
        return {
          ...state,
          logs: newLogs,
          unreadLogCount: isAlertLevel ? state.unreadLogCount + 1 : state.unreadLogCount,
        };
      }

      case 'ADD_PLOT_DATA': {
        const newPlotData = new Map(state.plotData);
        const currentData = newPlotData.get(action.payload.series) || [];
        const timeSpan = state.plotTimeSpans.get(action.payload.series) || 60;
        const currentTime = Date.now() / 1000;
        const cutoffTime = currentTime - timeSpan;
        let filteredData: typeof currentData;
        if (state.plotPaused) {
          filteredData = currentData.concat(action.payload.point);
        } else {
          let lo = 0;
          let hi = currentData.length;
          while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (currentData[mid].x < cutoffTime) lo = mid + 1;
            else hi = mid;
          }
          filteredData = lo > 0 ? currentData.slice(lo).concat(action.payload.point) : currentData.concat(action.payload.point);
        }
        if (filteredData.length > state.maxDataPoints) {
          filteredData = filteredData.slice(filteredData.length - state.maxDataPoints);
        }
        newPlotData.set(action.payload.series, filteredData);
        return { ...state, plotData: newPlotData };
      }

      case 'CLEAR_PLOT_DATA': {
        const clearedPlotData = new Map(state.plotData);
        clearedPlotData.delete(action.payload);
        return { ...state, plotData: clearedPlotData };
      }

      case 'ADD_ACTIVE_PLOT': {
        const newActivePlots = new Map(state.activePlots);
        newActivePlots.set(action.payload.registerName, {
          address: action.payload.address,
          pollInterval: action.payload.pollInterval,
          source: action.payload.source ?? 'register',
        });
        return { ...state, activePlots: newActivePlots };
      }

      case 'REMOVE_ACTIVE_PLOT': {
        const updatedActivePlots = new Map(state.activePlots);
        updatedActivePlots.delete(action.payload);
        return { ...state, activePlots: updatedActivePlots };
      }

      case 'SET_SCANNING':
        return { ...state, isScanning: action.payload };

      case 'SET_MAX_DATA_POINTS':
        return { ...state, maxDataPoints: action.payload };

      case 'SET_PLOT_TIME_SPAN': {
        const newTimeSpans = new Map(state.plotTimeSpans);
        newTimeSpans.set(action.payload.series, action.payload.timeSpan);
        return { ...state, plotTimeSpans: newTimeSpans };
      }

      case 'SET_PLOT_PAUSED':
        return { ...state, plotPaused: action.payload };

      case 'CLEAR_LOGS':
        return { ...state, logs: [], unreadLogCount: 0 };

      case 'MARK_LOGS_READ':
        return { ...state, unreadLogCount: 0 };

      case 'CLEAR_REGISTERS':
        return { ...state, registers: new Map() };

      case 'CLEAR_PARAMETERS':
        return { ...state, parameters: new Map() };

      case 'UPDATE_SYSTEM_REGISTER': {
        const newSysRegs = new Map(state.systemRegisters);
        newSysRegs.set(action.payload.address, action.payload);
        // CONTROL_INTERFACE is system register addr 2 — update connection.controlState
        let updatedConn = state.connection;
        if (action.payload.address === 2 && state.connection) {
          updatedConn = { ...state.connection, controlState: action.payload.value };
        }
        return { ...state, systemRegisters: newSysRegs, connection: updatedConn };
      }

      case 'CLEAR_SYSTEM_REGISTERS':
        return { ...state, systemRegisters: new Map() };

      case 'SET_AUTO_REFRESH':
        return {
          ...state,
          autoRefresh: {
            ...state.autoRefresh,
            enabled: action.payload.enabled,
            interval: action.payload.interval ?? state.autoRefresh.interval,
          },
        };

      case 'ADD_AUTO_REFRESH_REGISTER': {
        const newActiveAddresses = new Set(state.autoRefresh.activeAddresses);
        newActiveAddresses.add(action.payload);
        return { ...state, autoRefresh: { ...state.autoRefresh, activeAddresses: newActiveAddresses } };
      }

      case 'REMOVE_AUTO_REFRESH_REGISTER': {
        const filteredAddresses = new Set(state.autoRefresh.activeAddresses);
        filteredAddresses.delete(action.payload);
        return { ...state, autoRefresh: { ...state.autoRefresh, activeAddresses: filteredAddresses } };
      }

      case 'ADD_AUTO_REFRESH_PARAMETER': {
        const newActiveParamAddresses = new Set(state.autoRefresh.activeParameterAddresses);
        newActiveParamAddresses.add(action.payload);
        return { ...state, autoRefresh: { ...state.autoRefresh, activeParameterAddresses: newActiveParamAddresses } };
      }

      case 'REMOVE_AUTO_REFRESH_PARAMETER': {
        const filteredParamAddresses = new Set(state.autoRefresh.activeParameterAddresses);
        filteredParamAddresses.delete(action.payload);
        return { ...state, autoRefresh: { ...state.autoRefresh, activeParameterAddresses: filteredParamAddresses } };
      }

      case 'ADD_AUTO_REFRESH_SYSTEM_REGISTER': {
        const s = new Set(state.autoRefresh.activeSystemAddresses);
        s.add(action.payload);
        return { ...state, autoRefresh: { ...state.autoRefresh, activeSystemAddresses: s } };
      }

      case 'REMOVE_AUTO_REFRESH_SYSTEM_REGISTER': {
        const s = new Set(state.autoRefresh.activeSystemAddresses);
        s.delete(action.payload);
        return { ...state, autoRefresh: { ...state.autoRefresh, activeSystemAddresses: s } };
      }

      case 'CLEAR_AUTO_REFRESH_ADDRESSES':
        return {
          ...state,
          autoRefresh: {
            ...state.autoRefresh,
            activeAddresses: new Set<number>(),
            activeParameterAddresses: new Set<number>(),
            activeSystemAddresses: new Set<number>(),
          },
        };

      default:
        return state;
    }
  };
}

interface DSHubContextType {
  state: DSHubState;
  actions: {
    startScan: () => void;
    connectDevice: (ip: string, interfaceType: InterfaceType, deviceName?: string) => void;
    disconnectDevice: () => void;
    takeControl: () => void;
    readRegister: (address: number, name?: string) => void;
    writeRegister: (address: number, value: number) => void;
    readParameter: (address: number, name?: string) => void;
    writeParameter: (address: number, value: number) => void;
    startPlotting: (registerName: string, pollInterval: number, address: number) => void;
    startPlottingSysRegister: (registerName: string, pollInterval: number, address: number) => void;
    stopPlotting: (registerName: string) => void;
    clearPlotData: (seriesName: string) => void;
    sendCommand: (command: number, value: number, address?: number) => void;
    setMaxDataPoints: (points: number) => void;
    setPlotTimeSpan: (series: string, timeSpan: number) => void;
    setPlotPaused: (paused: boolean) => void;
    clearLogs: () => void;
    markLogsRead: () => void;
    clearRegisters: () => void;
    clearParameters: () => void;
    setAutoRefresh: (enabled: boolean, interval?: number) => void;
    addAutoRefreshRegister: (address: number) => void;
    removeAutoRefreshRegister: (address: number) => void;
    addAutoRefreshParameter: (address: number) => void;
    removeAutoRefreshParameter: (address: number) => void;
    readSystemRegister: (address: number, name?: string) => void;
    writeSystemRegister: (address: number, value: number) => void;
    addAutoRefreshSystemRegister: (address: number) => void;
    removeAutoRefreshSystemRegister: (address: number) => void;
    clearAutoRefreshAddresses: () => void;
  };
}

const DSHubContext = createContext<DSHubContextType | undefined>(undefined);

export function useDSHub() {
  const context = useContext(DSHubContext);
  if (!context) {
    throw new Error('useDSHub must be used within a DSHubProvider');
  }
  return context;
}

interface DSHubProviderProps {
  children: ReactNode;
}

export function DSHubProvider({ children }: DSHubProviderProps) {
  const { settings } = useSettings();

  const logSettingsRef = React.useRef(settings.logSettings);
  logSettingsRef.current = settings.logSettings; // Keep current synchronously so the reducer never reads stale settings

  const dsHubReducer = useMemo(
    () => createDSHubReducer(() => logSettingsRef.current),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [state, dispatch] = useReducer(dsHubReducer, initialState);
  const connectionRef = React.useRef<DeviceConnection | null>(null);
  const registersRef = React.useRef<Map<number, RegisterData>>(new Map());
  const parametersRef = React.useRef<Map<number, ParameterData>>(new Map());
  const systemRegistersRef = React.useRef<Map<number, RegisterData>>(new Map());

  React.useEffect(() => { connectionRef.current = state.connection; }, [state.connection]);
  React.useEffect(() => { registersRef.current = state.registers; }, [state.registers]);
  React.useEffect(() => { parametersRef.current = state.parameters; }, [state.parameters]);
  React.useEffect(() => { systemRegistersRef.current = state.systemRegisters; }, [state.systemRegisters]);

  // ── Tauri event listeners ─────────────────────────────────────────────────

  useEffect(() => {
    dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'DSHub started', timestamp: Date.now() } });

    // Send initial log settings to backend
    invoke('update_log_settings', { settings: settings.logSettings }).catch(console.error);

    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      unlisteners.push(
        await listen<DiscoveredDevice>('deviceDiscovered', e => {
          const device = e.payload;
          dispatch({ type: 'ADD_DISCOVERED_DEVICE', payload: device });
          dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'success', category: 'connection', message: `Device discovered: ${device.board_name} at ${device.ip_address} (ID: ${device.device_id})`, timestamp: Date.now() } });
        }),

        await listen('scanComplete', () => {
          dispatch({ type: 'SET_SCANNING', payload: false });
          dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'Device scan completed', timestamp: Date.now() } });
        }),

        await listen<DeviceConnection>('connectionStatus', e => {
          const status = e.payload;
          dispatch({ type: 'SET_CONNECTING', payload: false });
          dispatch({ type: 'SET_CONNECTION', payload: status });
          if (status.connected) {
            dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'success', category: 'connection', message: `Connected to device at ${status.ip}:${status.port} via ${status.interface}`, timestamp: Date.now() } });
            // Read CONTROL_INTERFACE system register (addr 2) to update control state display
            setTimeout(() => {
              invoke('read_system_register', { address: 2, name: 'CONTROL_INTERFACE' }).catch(console.error);
            }, 500);
          } else {
            dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'warning', category: 'connection', message: 'Disconnected from device', timestamp: Date.now() } });
          }
        }),

        await listen<RegisterData>('registerUpdate', e => {
          const register = e.payload;
          dispatch({ type: 'UPDATE_REGISTER', payload: register });
          if (register.valid) {
            dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'register', message: `Register ${register.name} (${register.address}): ${register.value}`, timestamp: Date.now() } });
          } else {
            dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'warning', category: 'register', message: `Invalid data received for register ${register.name} (${register.address})`, timestamp: Date.now() } });
          }
        }),

        await listen<ParameterData>('parameterUpdate', e => {
          const parameter = e.payload;
          dispatch({ type: 'UPDATE_PARAMETER', payload: parameter });
          if (parameter.valid) {
            dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'parameter', message: `Parameter ${parameter.name} (${parameter.address}): ${parameter.value}`, timestamp: Date.now() } });
          } else {
            dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'warning', category: 'parameter', message: `Invalid data received for parameter ${parameter.name} (${parameter.address})`, timestamp: Date.now() } });
          }
        }),

        await listen<LogEntry>('logEntry', e => {
          dispatch({ type: 'ADD_LOG_ENTRY', payload: e.payload });
        }),

        // plotData payload: { seriesName: string, point: PlotDataPoint }
        await listen<{ seriesName: string; point: PlotDataPoint }>('plotData', e => {
          dispatch({ type: 'ADD_PLOT_DATA', payload: { series: e.payload.seriesName, point: e.payload.point } });
        }),

        await listen<RegisterData>('sysRegisterUpdate', e => {
          dispatch({ type: 'UPDATE_SYSTEM_REGISTER', payload: e.payload });
        }),
      );
    };

    setup().catch(console.error);

    return () => {
      unlisteners.forEach(u => u());
      // Disconnect from device if still connected
      if (connectionRef.current?.connected) {
        invoke('disconnect_device').catch(console.error);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Send log settings updates to backend when they change
  useEffect(() => {
    invoke('update_log_settings', { settings: settings.logSettings }).catch(console.error);
  }, [settings.logSettings]);

  // Auto-refresh timer
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (state.autoRefresh.enabled && state.connection?.connected) {
      intervalId = setInterval(() => {
        if (!connectionRef.current?.connected) return;

        state.autoRefresh.activeAddresses.forEach(address => {
          const name = registersRef.current.get(address)?.name ?? '';
          invoke('read_register', { address, name }).catch(console.error);
        });

        state.autoRefresh.activeParameterAddresses.forEach(address => {
          const name = parametersRef.current.get(address)?.name ?? '';
          invoke('read_parameter', { address, name }).catch(console.error);
        });

        state.autoRefresh.activeSystemAddresses.forEach(address => {
          const name = systemRegistersRef.current.get(address)?.name ?? '';
          invoke('read_system_register', { address, name }).catch(console.error);
        });

        const totalAddresses = state.autoRefresh.activeAddresses.size
          + state.autoRefresh.activeParameterAddresses.size
          + state.autoRefresh.activeSystemAddresses.size;
        if (totalAddresses > 0) {
          dispatch({ type: 'ADD_LOG_ENTRY', payload: {
            level: 'info',
            category: 'autoRefresh',
            message: `Auto-refresh: updating ${state.autoRefresh.activeAddresses.size} registers, ${state.autoRefresh.activeParameterAddresses.size} parameters, ${state.autoRefresh.activeSystemAddresses.size} system registers`,
            timestamp: Date.now()
          }});
        }
      }, state.autoRefresh.interval);
    }

    return () => { if (intervalId) clearInterval(intervalId); };
  }, [
    state.autoRefresh.enabled,
    state.autoRefresh.interval,
    state.autoRefresh.activeAddresses,
    state.autoRefresh.activeParameterAddresses,
    state.autoRefresh.activeSystemAddresses,
    state.connection?.connected,
  ]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const actions = {
    startScan: () => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'Starting device scan...', timestamp: Date.now() } });
      dispatch({ type: 'CLEAR_DISCOVERED_DEVICES' });
      dispatch({ type: 'SET_SCANNING', payload: true });
      invoke('start_scan').catch(err => {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'connection', message: `Scan error: ${err}`, timestamp: Date.now() } });
        dispatch({ type: 'SET_SCANNING', payload: false });
      });
    },

    connectDevice: (ip: string, interfaceType: InterfaceType, deviceName?: string) => {
      const displayName = deviceName ? `${deviceName} (${ip})` : ip;
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: `Connecting to ${displayName} via ${interfaceType}...`, timestamp: Date.now() } });
      dispatch({ type: 'SET_CONNECTING', payload: true });
      invoke('connect_device', { ip, interfaceType, deviceName }).catch(err => {
        dispatch({ type: 'SET_CONNECTING', payload: false });
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'connection', message: `Connect failed: ${err}`, timestamp: Date.now() } });
      });
    },

    disconnectDevice: () => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'Disconnecting from device...', timestamp: Date.now() } });
      invoke('disconnect_device').catch(console.error);
    },

    takeControl: () => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'Taking control of device interface...', timestamp: Date.now() } });
      invoke('take_control').catch(err =>
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'connection', message: `Take control failed: ${err}`, timestamp: Date.now() } })
      );
    },

    readRegister: (address: number, name?: string) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'register', message: `Reading register at address ${address} (0x${address.toString(16).toUpperCase().padStart(4, '0')})`, timestamp: Date.now() } });
      invoke('read_register', { address, name: name ?? '' }).catch(console.error);
    },

    writeRegister: (address: number, value: number) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'register', message: `Writing register at address ${address} (0x${address.toString(16).toUpperCase().padStart(4, '0')}) with value ${value}`, timestamp: Date.now() } });
      invoke('write_register', { address, value }).catch(err =>
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'register', message: `Write register failed: ${err}`, timestamp: Date.now() } })
      );
    },

    readParameter: (address: number, name?: string) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'parameter', message: `Reading parameter at address ${address}`, timestamp: Date.now() } });
      invoke('read_parameter', { address, name: name ?? '' }).catch(console.error);
    },

    writeParameter: (address: number, value: number) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'parameter', message: `Writing parameter at address ${address} with value ${value}`, timestamp: Date.now() } });
      invoke('write_parameter', { address, value }).catch(err =>
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'parameter', message: `Write parameter failed: ${err}`, timestamp: Date.now() } })
      );
    },

    startPlotting: (registerName: string, pollInterval: number, address: number) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'plotting', message: `Starting to plot register '${registerName}' with ${pollInterval}ms interval`, timestamp: Date.now() } });
      dispatch({ type: 'ADD_ACTIVE_PLOT', payload: { registerName, address, pollInterval, source: 'register' } });
      invoke('start_plotting', { registerName, pollInterval, address }).catch(err =>
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'plotting', message: `Start plotting failed: ${err}`, timestamp: Date.now() } })
      );
    },

    startPlottingSysRegister: (registerName: string, pollInterval: number, address: number) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'plotting', message: `Starting to plot system register '${registerName}' with ${pollInterval}ms interval`, timestamp: Date.now() } });
      dispatch({ type: 'ADD_ACTIVE_PLOT', payload: { registerName, address, pollInterval, source: 'sysRegister' } });
      invoke('start_plotting_sys_register', { registerName, pollInterval, address }).catch(err =>
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'plotting', message: `Start plotting sys register failed: ${err}`, timestamp: Date.now() } })
      );
    },

    stopPlotting: (registerName: string) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'plotting', message: `Stopping plot for register '${registerName}'`, timestamp: Date.now() } });
      dispatch({ type: 'REMOVE_ACTIVE_PLOT', payload: registerName });
      invoke('stop_plotting', { registerName }).catch(console.error);
    },

    clearPlotData: (seriesName: string) => {
      dispatch({ type: 'CLEAR_PLOT_DATA', payload: seriesName });
    },

    sendCommand: (command: number, value: number, address: number = 0) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: `Sending command ${command} (addr=${address}) value=${value}`, timestamp: Date.now() } });
      invoke('send_command', { command, address, value }).catch(err =>
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'connection', message: `Command failed: ${err}`, timestamp: Date.now() } })
      );
    },

    setMaxDataPoints: (points: number) => dispatch({ type: 'SET_MAX_DATA_POINTS', payload: points }),
    setPlotTimeSpan: (series: string, timeSpan: number) => dispatch({ type: 'SET_PLOT_TIME_SPAN', payload: { series, timeSpan } }),
    setPlotPaused: (paused: boolean) => dispatch({ type: 'SET_PLOT_PAUSED', payload: paused }),

    clearLogs: () => {
      dispatch({ type: 'CLEAR_LOGS' });
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'Activity log cleared by user', timestamp: Date.now() } });
    },

    markLogsRead: () => dispatch({ type: 'MARK_LOGS_READ' }),
    clearRegisters: () => dispatch({ type: 'CLEAR_REGISTERS' }),
    clearParameters: () => dispatch({ type: 'CLEAR_PARAMETERS' }),

    setAutoRefresh: (enabled: boolean, interval?: number) => {
      dispatch({ type: 'SET_AUTO_REFRESH', payload: { enabled, interval } });
      dispatch({ type: 'ADD_LOG_ENTRY', payload: {
        level: 'info',
        category: 'autoRefresh',
        message: enabled ? `Auto-refresh enabled (${interval || state.autoRefresh.interval}ms interval)` : 'Auto-refresh disabled',
        timestamp: Date.now()
      }});
    },

    addAutoRefreshRegister: (address: number) => dispatch({ type: 'ADD_AUTO_REFRESH_REGISTER', payload: address }),
    removeAutoRefreshRegister: (address: number) => dispatch({ type: 'REMOVE_AUTO_REFRESH_REGISTER', payload: address }),
    addAutoRefreshParameter: (address: number) => dispatch({ type: 'ADD_AUTO_REFRESH_PARAMETER', payload: address }),
    removeAutoRefreshParameter: (address: number) => dispatch({ type: 'REMOVE_AUTO_REFRESH_PARAMETER', payload: address }),

    readSystemRegister: (address: number, name?: string) => {
      invoke('read_system_register', { address, name: name ?? '' }).catch(console.error);
    },

    writeSystemRegister: (address: number, value: number) => {
      invoke('write_system_register', { address, value }).catch(err =>
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'register', message: `Write system register failed: ${err}`, timestamp: Date.now() } })
      );
    },

    addAutoRefreshSystemRegister: (address: number) => dispatch({ type: 'ADD_AUTO_REFRESH_SYSTEM_REGISTER', payload: address }),
    removeAutoRefreshSystemRegister: (address: number) => dispatch({ type: 'REMOVE_AUTO_REFRESH_SYSTEM_REGISTER', payload: address }),
    clearAutoRefreshAddresses: () => dispatch({ type: 'CLEAR_AUTO_REFRESH_ADDRESSES' }),
  };

  return (
    <DSHubContext.Provider value={{ state, actions }}>
      {children}
    </DSHubContext.Provider>
  );
}
