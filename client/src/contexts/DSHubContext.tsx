import React, { createContext, useContext, useReducer, useEffect, ReactNode, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
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
      return true; // Default to allowing unknown categories
  }
}

interface DSHubState {
  socket: Socket | null;
  serverConnected: boolean;
  serverError: string | null;
  discoveredDevices: DiscoveredDevice[];
  connection: DeviceConnection | null;
  registers: Map<number, RegisterData>;
  parameters: Map<number, ParameterData>;
  logs: LogEntry[];
  unreadLogCount: number;
  plotData: Map<string, PlotDataPoint[]>;
  activePlots: Map<string, { address: number; pollInterval: number }>;
  isScanning: boolean;
  maxDataPoints: number; // Maximum number of data points to retain per series
  plotTimeSpans: Map<string, number>; // Time span in seconds for each active plot
  plotPaused: boolean; // Global pause state for plots
  connecting: boolean; // true while a connectDevice call is in-flight (before first connectionStatus)
  autoRefresh: {
    enabled: boolean;
    interval: number; // in milliseconds
    activeAddresses: Set<number>;
    activeParameterAddresses: Set<number>;
  };
}

type DSHubAction =
  | { type: 'SET_SOCKET'; payload: Socket }
  | { type: 'SET_SERVER_CONNECTED'; payload: boolean }
  | { type: 'ADD_DISCOVERED_DEVICE'; payload: DiscoveredDevice }
  | { type: 'CLEAR_DISCOVERED_DEVICES' }
  | { type: 'SET_CONNECTION'; payload: DeviceConnection }
  | { type: 'UPDATE_REGISTER'; payload: RegisterData }
  | { type: 'UPDATE_PARAMETER'; payload: ParameterData }
  | { type: 'ADD_LOG_ENTRY'; payload: LogEntry }
  | { type: 'ADD_PLOT_DATA'; payload: { series: string; point: PlotDataPoint } }
  | { type: 'CLEAR_PLOT_DATA'; payload: string }
  | { type: 'ADD_ACTIVE_PLOT'; payload: { registerName: string; address: number; pollInterval: number } }
  | { type: 'REMOVE_ACTIVE_PLOT'; payload: string }
  | { type: 'SET_SCANNING'; payload: boolean }
  | { type: 'SET_MAX_DATA_POINTS'; payload: number }
  | { type: 'SET_PLOT_TIME_SPAN'; payload: { series: string; timeSpan: number } }
  | { type: 'SET_PLOT_PAUSED'; payload: boolean }
  | { type: 'CLEAR_LOGS' }
  | { type: 'MARK_LOGS_READ' }
  | { type: 'CLEAR_REGISTERS' }
  | { type: 'CLEAR_PARAMETERS' }
  | { type: 'SET_AUTO_REFRESH'; payload: { enabled: boolean; interval?: number } }
  | { type: 'ADD_AUTO_REFRESH_REGISTER'; payload: number }
  | { type: 'REMOVE_AUTO_REFRESH_REGISTER'; payload: number }
  | { type: 'ADD_AUTO_REFRESH_PARAMETER'; payload: number }
  | { type: 'REMOVE_AUTO_REFRESH_PARAMETER'; payload: number }
  | { type: 'CLEAR_AUTO_REFRESH_ADDRESSES' }
  | { type: 'SET_CONNECTING'; payload: boolean };

const initialState: DSHubState = {
  socket: null,
  serverConnected: false,
  serverError: null,
  discoveredDevices: [],
  connection: null,
  registers: new Map(),
  parameters: new Map(),
  logs: [],
  unreadLogCount: 0,
  plotData: new Map(),
  activePlots: new Map(),
  isScanning: false,
  maxDataPoints: 20000, // Default: 20k points per series
  plotTimeSpans: new Map(), // Time span for each series
  plotPaused: false, // Not paused by default
  connecting: false,
  autoRefresh: {
    enabled: false,
    interval: 1000, // Default 1 second
    activeAddresses: new Set<number>(),
    activeParameterAddresses: new Set<number>(),
  },
};

// Create a reducer factory.
// IMPORTANT: Accepts a getter function (not a value) so the reducer identity
// stays stable across renders while still reading current logSettings at dispatch time.
function createDSHubReducer(getLogSettings: () => LogSettings) {
  return function dsHubReducer(state: DSHubState, action: DSHubAction): DSHubState {
    const logSettings = getLogSettings();
    switch (action.type) {
      case 'SET_SOCKET':
        return { ...state, socket: action.payload };

      case 'SET_SERVER_CONNECTED':
        return { ...state, serverConnected: action.payload };

      case 'ADD_DISCOVERED_DEVICE':
        // Check if device already exists
        const exists = state.discoveredDevices.some(d => d.ip_address === action.payload.ip_address);
        if (exists) return state;
        return {
          ...state,
          discoveredDevices: [...state.discoveredDevices, action.payload]
        };

      case 'CLEAR_DISCOVERED_DEVICES':
        return { ...state, discoveredDevices: [] };

      case 'SET_CONNECTING':
        return { ...state, connecting: action.payload };

      case 'SET_CONNECTION':
        return { ...state, connection: action.payload };

      case 'UPDATE_REGISTER':
        const newRegisters = new Map(state.registers);
        newRegisters.set(action.payload.address, action.payload);

        // Update connection control state if CONTROL_INTERFACE register is updated
        // CONTROL_INTERFACE is at address 2
        let updatedConnection = state.connection;
        if (action.payload.address === 2 && action.payload.name === 'CONTROL_INTERFACE' && state.connection) {
          updatedConnection = {
            ...state.connection,
            controlState: action.payload.value
          };
        }

        return { ...state, registers: newRegisters, connection: updatedConnection };

      case 'UPDATE_PARAMETER':
        const newParameters = new Map(state.parameters);
        newParameters.set(action.payload.address, action.payload);
        return { ...state, parameters: newParameters };

      case 'ADD_LOG_ENTRY':
        // Check if this log category should be logged based on settings
        if (!shouldLogCategory(action.payload.category, logSettings)) {
          return state; // Skip logging if category is disabled
        }

        let newLogs = [...state.logs, action.payload];
        // Use configurable max log count from settings
        if (newLogs.length > logSettings.maxLogCount) {
          newLogs = newLogs.slice(newLogs.length - logSettings.maxLogCount);
        }
        const isAlertLevel = action.payload.level === 'error' || action.payload.level === 'warning';
        return {
          ...state,
          logs: newLogs,
          unreadLogCount: isAlertLevel ? state.unreadLogCount + 1 : state.unreadLogCount,
        };
    
    case 'ADD_PLOT_DATA':
      const newPlotData = new Map(state.plotData);
      const currentData = newPlotData.get(action.payload.series) || [];
      const updatedData = [...currentData, action.payload.point];

      // Get time span for this series (default to 60 seconds if not set)
      const timeSpan = state.plotTimeSpans.get(action.payload.series) || 60;

      // Calculate cutoff time: only keep data within the time window (unless paused)
      const currentTime = Date.now() / 1000; // Current time in seconds
      const cutoffTime = currentTime - timeSpan;

      // Filter data based on pause state
      let filteredData = state.plotPaused
        ? updatedData // Keep all data when paused
        : updatedData.filter(point => point.x >= cutoffTime); // Only keep data within time window

      // ALWAYS enforce maxDataPoints limit to prevent unbounded growth
      if (filteredData.length > state.maxDataPoints) {
        // Use slice instead of splice to avoid mutating the array
        filteredData = filteredData.slice(filteredData.length - state.maxDataPoints);
      }

      newPlotData.set(action.payload.series, filteredData);
      return { ...state, plotData: newPlotData };

    case 'CLEAR_PLOT_DATA':
      const clearedPlotData = new Map(state.plotData);
      clearedPlotData.delete(action.payload);
      return { ...state, plotData: clearedPlotData };

    case 'ADD_ACTIVE_PLOT':
      const newActivePlots = new Map(state.activePlots);
      newActivePlots.set(action.payload.registerName, {
        address: action.payload.address,
        pollInterval: action.payload.pollInterval
      });
      return { ...state, activePlots: newActivePlots };

    case 'REMOVE_ACTIVE_PLOT':
      const updatedActivePlots = new Map(state.activePlots);
      updatedActivePlots.delete(action.payload);
      return { ...state, activePlots: updatedActivePlots };

    case 'SET_SCANNING':
      return { ...state, isScanning: action.payload };

    case 'SET_MAX_DATA_POINTS':
      return { ...state, maxDataPoints: action.payload };

    case 'SET_PLOT_TIME_SPAN':
      const newTimeSpans = new Map(state.plotTimeSpans);
      newTimeSpans.set(action.payload.series, action.payload.timeSpan);
      return { ...state, plotTimeSpans: newTimeSpans };

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

    case 'SET_AUTO_REFRESH':
      return {
        ...state,
        autoRefresh: {
          ...state.autoRefresh,
          enabled: action.payload.enabled,
          interval: action.payload.interval ?? state.autoRefresh.interval,
        },
      };
    
    case 'ADD_AUTO_REFRESH_REGISTER':
      const newActiveAddresses = new Set(state.autoRefresh.activeAddresses);
      newActiveAddresses.add(action.payload);
      return {
        ...state,
        autoRefresh: {
          ...state.autoRefresh,
          activeAddresses: newActiveAddresses,
        },
      };
    
    case 'REMOVE_AUTO_REFRESH_REGISTER':
      const filteredAddresses = new Set(state.autoRefresh.activeAddresses);
      filteredAddresses.delete(action.payload);
      return {
        ...state,
        autoRefresh: {
          ...state.autoRefresh,
          activeAddresses: filteredAddresses,
        },
      };
    
    case 'ADD_AUTO_REFRESH_PARAMETER':
      const newActiveParamAddresses = new Set(state.autoRefresh.activeParameterAddresses);
      newActiveParamAddresses.add(action.payload);
      return {
        ...state,
        autoRefresh: {
          ...state.autoRefresh,
          activeParameterAddresses: newActiveParamAddresses,
        },
      };
    
    case 'REMOVE_AUTO_REFRESH_PARAMETER':
      const filteredParamAddresses = new Set(state.autoRefresh.activeParameterAddresses);
      filteredParamAddresses.delete(action.payload);
      return {
        ...state,
        autoRefresh: {
          ...state.autoRefresh,
          activeParameterAddresses: filteredParamAddresses,
        },
      };
    
    case 'CLEAR_AUTO_REFRESH_ADDRESSES':
      return {
        ...state,
        autoRefresh: {
          ...state.autoRefresh,
          activeAddresses: new Set<number>(),
          activeParameterAddresses: new Set<number>(),
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
    stopPlotting: (registerName: string) => void;
    clearPlotData: (seriesName: string) => void;
    sendCommand: (command: number, value: number) => void;
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

  // Ref for logSettings so the reducer and socket handlers always read the
  // current value without needing to be recreated when settings change.
  const logSettingsRef = React.useRef(settings.logSettings);
  React.useEffect(() => {
    logSettingsRef.current = settings.logSettings;
  }, [settings.logSettings]);

  // Stable reducer — created once, reads current logSettings via the ref getter.
  // This prevents the reducer identity from changing on every logSettings update.
  const dsHubReducer = useMemo(
    () => createDSHubReducer(() => logSettingsRef.current),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [state, dispatch] = useReducer(dsHubReducer, initialState);
  const connectionRef = React.useRef<DeviceConnection | null>(null);
  const socketRef = React.useRef<Socket | null>(null);
  const registersRef = React.useRef<Map<number, RegisterData>>(new Map());
  const parametersRef = React.useRef<Map<number, ParameterData>>(new Map());

  // Keep connection ref updated
  React.useEffect(() => {
    connectionRef.current = state.connection;
  }, [state.connection]);

  // Keep socket ref updated
  React.useEffect(() => {
    socketRef.current = state.socket;
  }, [state.socket]);

  // Keep registers ref updated
  React.useEffect(() => {
    registersRef.current = state.registers;
  }, [state.registers]);

  // Keep parameters ref updated
  React.useEffect(() => {
    parametersRef.current = state.parameters;
  }, [state.parameters]);

  useEffect(() => {
    // Connect to Socket.IO server
    // Use environment variable or default to current host
    const serverUrl = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3002`;
    const socket = io(serverUrl);

    // Send log settings IMMEDIATELY upon connection (before any other operations)
    socket.emit('updateLogSettings', settings.logSettings);

    dispatch({ type: 'SET_SOCKET', payload: socket });
    dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'DSHub started', timestamp: Date.now() } });
    dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: `Connecting to server at ${serverUrl}...`, timestamp: Date.now() } });

    // Set up event listeners
    socket.on('deviceDiscovered', (device: DiscoveredDevice) => {
      dispatch({ type: 'ADD_DISCOVERED_DEVICE', payload: device });
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'success', category: 'connection', message: `Device discovered: ${device.board_name} at ${device.ip_address} (ID: ${device.device_id})`, timestamp: Date.now() } });
    });

    socket.on('scanComplete', () => {
      dispatch({ type: 'SET_SCANNING', payload: false });
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'Device scan completed', timestamp: Date.now() } });
    });

    socket.on('connectionStatus', (status: DeviceConnection) => {
      dispatch({ type: 'SET_CONNECTING', payload: false });
      dispatch({ type: 'SET_CONNECTION', payload: status });
      if (status.connected) {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'success', category: 'connection', message: `Connected to device at ${status.ip}:${status.port} via ${status.interface}`, timestamp: Date.now() } });

        // Read CONTROL_INTERFACE register (address 2) to update dashboard
        setTimeout(() => {
          socket.emit('readRegister', { address: 2, name: 'CONTROL_INTERFACE' });
        }, 500);
      } else {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'warning', category: 'connection', message: `Disconnected from device`, timestamp: Date.now() } });
      }
    });

    socket.on('registerUpdate', (register: RegisterData) => {
      dispatch({ type: 'UPDATE_REGISTER', payload: register });
      if (register.valid) {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'register', message: `Register ${register.name} (${register.address}): ${register.value}`, timestamp: Date.now() } });
      } else {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'warning', category: 'register', message: `Invalid data received for register ${register.name} (${register.address})`, timestamp: Date.now() } });
      }
    });

    socket.on('parameterUpdate', (parameter: ParameterData) => {
      dispatch({ type: 'UPDATE_PARAMETER', payload: parameter });
      if (parameter.valid) {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'parameter', message: `Parameter ${parameter.name} (${parameter.address}): ${parameter.value}`, timestamp: Date.now() } });
      } else {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'warning', category: 'parameter', message: `Invalid data received for parameter ${parameter.name} (${parameter.address})`, timestamp: Date.now() } });
      }
    });

    socket.on('logEntry', (entry: LogEntry) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: entry });
    });

    socket.on('plotData', (seriesName: string, point: PlotDataPoint) => {
      dispatch({ type: 'ADD_PLOT_DATA', payload: { series: seriesName, point } });
    });

    socket.on('connect', () => {
      console.log('[DSHubContext] Socket connected, setting serverConnected=true');
      dispatch({ type: 'SET_SERVER_CONNECTED', payload: true });
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'success', category: 'connection', message: 'Connected to DSHub server', timestamp: Date.now() } });

      // Re-synchronize log settings with server on (re)connect.
      // The server has no persistent state — it forgets preferences on disconnect.
      socket.emit('updateLogSettings', logSettingsRef.current);
    });

    socket.on('disconnect', () => {
      dispatch({ type: 'SET_SERVER_CONNECTED', payload: false });
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'warning', category: 'connection', message: 'Disconnected from DSHub server', timestamp: Date.now() } });
    });

    socket.on('connect_error', (error) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'connection', message: `Server connection error: ${error.message}`, timestamp: Date.now() } });
    });

    // Handle page close/refresh - disconnect from device before page unloads
    const handleBeforeUnload = () => {
      // Use ref to get current connection state
      if (connectionRef.current?.connected) {
        // Send synchronous disconnect request
        socket.emit('disconnectDevice');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);

      // Remove all Socket.IO event listeners before disconnecting
      socket.off('deviceDiscovered');
      socket.off('scanComplete');
      socket.off('connectionStatus');
      socket.off('registerUpdate');
      socket.off('parameterUpdate');
      socket.off('logEntry');
      socket.off('plotData');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');

      // Disconnect from device if connected (only on actual unmount)
      if (connectionRef.current?.connected) {
        socket.emit('disconnectDevice');
      }

      socket.disconnect();
    };
  }, []); // Empty dependency array - only run once on mount

  // Send settings updates to server when they change (after initial connection)
  useEffect(() => {
    if (state.socket) {
      state.socket.emit('updateLogSettings', settings.logSettings);
      // Note: Settings only affect NEW logs, not existing ones
    }
  }, [settings.logSettings, state.socket]); // Depend on both settings and socket

  // Auto-refresh timer effect
  // IMPORTANT: Uses refs to avoid recreating interval on every register/parameter update
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (state.autoRefresh.enabled && state.connection?.connected && state.socket) {
      intervalId = setInterval(() => {
        // Safety check: verify socket and connection are still valid
        // This prevents race condition where disconnect happens mid-interval
        if (!socketRef.current || !connectionRef.current?.connected) {
          return;
        }

        // Refresh registers - use ref to get current register names
        state.autoRefresh.activeAddresses.forEach(address => {
          // Get the existing register name to preserve it
          const existingRegister = registersRef.current.get(address);
          const name = existingRegister?.name;
          socketRef.current?.emit('readRegister', { address, name });
        });

        // Refresh parameters - use ref to get current parameter names
        state.autoRefresh.activeParameterAddresses.forEach(address => {
          // Get the existing parameter name to preserve it
          const existingParameter = parametersRef.current.get(address);
          const name = existingParameter?.name;
          socketRef.current?.emit('readParameter', { address, name });
        });

        // Log periodic refresh (but only if there are addresses to refresh)
        const totalAddresses = state.autoRefresh.activeAddresses.size + state.autoRefresh.activeParameterAddresses.size;
        if (totalAddresses > 0) {
          dispatch({ type: 'ADD_LOG_ENTRY', payload: {
            level: 'info',
            category: 'autoRefresh',
            message: `Auto-refresh: updating ${state.autoRefresh.activeAddresses.size} registers and ${state.autoRefresh.activeParameterAddresses.size} parameters`,
            timestamp: Date.now()
          }});
        }
      }, state.autoRefresh.interval);
    }

    // Cleanup: Clear interval when effect dependencies change or component unmounts
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [
    state.autoRefresh.enabled,
    state.autoRefresh.interval,
    state.autoRefresh.activeAddresses,
    state.autoRefresh.activeParameterAddresses,
    state.connection?.connected,
    state.socket
    // NOTE: Removed state.registers and state.parameters from dependencies
    // to prevent recreating interval on every update. Using refs instead.
  ]);

  const actions = {
    startScan: () => {
      if (state.socket) {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'Starting device scan...', timestamp: Date.now() } });
        dispatch({ type: 'CLEAR_DISCOVERED_DEVICES' });
        dispatch({ type: 'SET_SCANNING', payload: true });
        state.socket.emit('startScan');
      } else {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'connection', message: 'Cannot start scan: no socket connection', timestamp: Date.now() } });
      }
    },

    connectDevice: (ip: string, interfaceType: InterfaceType, deviceName?: string) => {
      if (state.socket) {
        const displayName = deviceName ? `${deviceName} (${ip})` : ip;
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: `Connecting to ${displayName} via ${interfaceType}...`, timestamp: Date.now() } });
        dispatch({ type: 'SET_CONNECTING', payload: true });
        state.socket.emit('connectDevice', ip, interfaceType, deviceName);
      } else {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'connection', message: 'Cannot connect: no socket connection', timestamp: Date.now() } });
      }
    },

    disconnectDevice: () => {
      if (state.socket) {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'Disconnecting from device...', timestamp: Date.now() } });
        state.socket.emit('disconnectDevice');
      }
    },

    takeControl: () => {
      if (state.socket) {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'Taking control of device interface...', timestamp: Date.now() } });
        state.socket.emit('takeControl');
      } else {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'connection', message: 'Cannot take control: no socket connection', timestamp: Date.now() } });
      }
    },

    readRegister: (address: number, name?: string) => {
      if (state.socket) {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'register', message: `Reading register at address ${address} (0x${address.toString(16).toUpperCase().padStart(4, '0')})`, timestamp: Date.now() } });
        state.socket.emit('readRegister', { address, name });
      }
    },

    writeRegister: (address: number, value: number) => {
      if (state.socket) {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'register', message: `Writing register at address ${address} (0x${address.toString(16).toUpperCase().padStart(4, '0')}) with value ${value}`, timestamp: Date.now() } });
        state.socket.emit('writeRegister', address, value);
      } else {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'register', message: 'Cannot write register: no socket connection', timestamp: Date.now() } });
      }
    },

    readParameter: (address: number, name?: string) => {
      if (state.socket) {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'parameter', message: `Reading parameter at address ${address}`, timestamp: Date.now() } });
        state.socket.emit('readParameter', { address, name });
      } else {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'parameter', message: 'Cannot read parameter: no socket connection', timestamp: Date.now() } });
      }
    },

    writeParameter: (address: number, value: number) => {
      if (state.socket) {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'parameter', message: `Writing parameter at address ${address} with value ${value}`, timestamp: Date.now() } });
        state.socket.emit('writeParameter', address, value);
      } else {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'parameter', message: 'Cannot write parameter: no socket connection', timestamp: Date.now() } });
      }
    },

    startPlotting: (registerName: string, pollInterval: number, address: number) => {
      if (state.socket) {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'plotting', message: `Starting to plot register '${registerName}' with ${pollInterval}ms interval`, timestamp: Date.now() } });
        // Track active plot in state
        dispatch({ type: 'ADD_ACTIVE_PLOT', payload: { registerName, address, pollInterval } });
        // Send name, address, and poll interval
        state.socket.emit('startPlotting', { registerName, pollInterval, address });
      } else {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'plotting', message: 'Cannot start plotting: no socket connection', timestamp: Date.now() } });
      }
    },

    stopPlotting: (registerName: string) => {
      if (state.socket) {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'plotting', message: `Stopping plot for register '${registerName}'`, timestamp: Date.now() } });
        // Remove from active plots
        dispatch({ type: 'REMOVE_ACTIVE_PLOT', payload: registerName });
        state.socket.emit('stopPlotting', registerName);
      }
    },

    clearPlotData: (seriesName: string) => {
      dispatch({ type: 'CLEAR_PLOT_DATA', payload: seriesName });
    },

    sendCommand: (command: number, value: number) => {
      if (state.socket) {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: `Sending system command ${command} with value ${value}`, timestamp: Date.now() } });
        state.socket.emit('sendCommand', command, value);
      } else {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'connection', message: 'Cannot send command: no socket connection', timestamp: Date.now() } });
      }
    },

    setMaxDataPoints: (points: number) => {
      dispatch({ type: 'SET_MAX_DATA_POINTS', payload: points });
    },

    setPlotTimeSpan: (series: string, timeSpan: number) => {
      dispatch({ type: 'SET_PLOT_TIME_SPAN', payload: { series, timeSpan } });
    },

    setPlotPaused: (paused: boolean) => {
      dispatch({ type: 'SET_PLOT_PAUSED', payload: paused });
    },

    clearLogs: () => {
      dispatch({ type: 'CLEAR_LOGS' });
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'Activity log cleared by user', timestamp: Date.now() } });
    },

    markLogsRead: () => {
      dispatch({ type: 'MARK_LOGS_READ' });
    },

    clearRegisters: () => {
      dispatch({ type: 'CLEAR_REGISTERS' });
    },

    clearParameters: () => {
      dispatch({ type: 'CLEAR_PARAMETERS' });
    },

    setAutoRefresh: (enabled: boolean, interval?: number) => {
      dispatch({ type: 'SET_AUTO_REFRESH', payload: { enabled, interval } });
      dispatch({ type: 'ADD_LOG_ENTRY', payload: {
        level: 'info',
        category: 'autoRefresh',
        message: enabled ? `Auto-refresh enabled (${interval || state.autoRefresh.interval}ms interval)` : 'Auto-refresh disabled',
        timestamp: Date.now()
      }});
    },

    addAutoRefreshRegister: (address: number) => {
      dispatch({ type: 'ADD_AUTO_REFRESH_REGISTER', payload: address });
    },

    removeAutoRefreshRegister: (address: number) => {
      dispatch({ type: 'REMOVE_AUTO_REFRESH_REGISTER', payload: address });
    },

    addAutoRefreshParameter: (address: number) => {
      dispatch({ type: 'ADD_AUTO_REFRESH_PARAMETER', payload: address });
    },

    removeAutoRefreshParameter: (address: number) => {
      dispatch({ type: 'REMOVE_AUTO_REFRESH_PARAMETER', payload: address });
    },

    clearAutoRefreshAddresses: () => {
      dispatch({ type: 'CLEAR_AUTO_REFRESH_ADDRESSES' });
    },
  };

  return (
    <DSHubContext.Provider value={{ state, actions }}>
      {children}
    </DSHubContext.Provider>
  );
}