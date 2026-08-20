import React, { createContext, useContext, useReducer, useEffect, ReactNode, useMemo } from 'react';
import { useBackendPort } from './BackendPortContext';
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
  | { type: 'ADD_LOG_ENTRIES'; payload: LogEntry[] }
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
};

function createDSHubReducer(getLogSettings: () => LogSettings) {
  return function dsHubReducer(state: DSHubState, action: DSHubAction): DSHubState {
    const logSettings = getLogSettings();
    switch (action.type) {
      case 'SET_SERVER_CONNECTED':
        if (state.serverConnected === action.payload) return state;
        return { ...state, serverConnected: action.payload };

      case 'ADD_DISCOVERED_DEVICE': {
        const exists = state.discoveredDevices.some(d => d.ip_address === action.payload.ip_address);
        if (exists) return state;
        return { ...state, discoveredDevices: [...state.discoveredDevices, action.payload] };
      }

      case 'CLEAR_DISCOVERED_DEVICES':
        if (state.discoveredDevices.length === 0) return state;
        return { ...state, discoveredDevices: [] };

      case 'SET_CONNECTING':
        if (state.connecting === action.payload) return state;
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

      case 'ADD_LOG_ENTRY':
      case 'ADD_LOG_ENTRIES': {
        // Entries arrive individually but are appended in batches (see
        // `queueLogEntry`), so the O(n) array copy happens once per frame rather
        // than once per device response.
        const incoming = action.type === 'ADD_LOG_ENTRY' ? [action.payload] : action.payload;
        const accepted = incoming.filter(e => shouldLogCategory(e.category, logSettings));
        if (accepted.length === 0) return state;

        let newLogs = state.logs.concat(accepted);
        if (newLogs.length > logSettings.maxLogCount) {
          newLogs = newLogs.slice(newLogs.length - logSettings.maxLogCount);
        }
        const alerts = accepted.reduce(
          (n, e) => n + (e.level === 'error' || e.level === 'warning' ? 1 : 0),
          0
        );
        return {
          ...state,
          logs: newLogs,
          unreadLogCount: state.unreadLogCount + alerts,
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
        if (state.isScanning === action.payload) return state;
        return { ...state, isScanning: action.payload };

      case 'SET_MAX_DATA_POINTS':
        if (state.maxDataPoints === action.payload) return state;
        return { ...state, maxDataPoints: action.payload };

      case 'SET_PLOT_TIME_SPAN': {
        const newTimeSpans = new Map(state.plotTimeSpans);
        newTimeSpans.set(action.payload.series, action.payload.timeSpan);
        return { ...state, plotTimeSpans: newTimeSpans };
      }

      case 'SET_PLOT_PAUSED':
        if (state.plotPaused === action.payload) return state;
        return { ...state, plotPaused: action.payload };

      case 'CLEAR_LOGS':
        if (state.logs.length === 0 && state.unreadLogCount === 0) return state;
        return { ...state, logs: [], unreadLogCount: 0 };

      case 'MARK_LOGS_READ':
        if (state.unreadLogCount === 0) return state;
        return { ...state, unreadLogCount: 0 };

      case 'CLEAR_REGISTERS':
        if (state.registers.size === 0) return state;
        return { ...state, registers: new Map() };

      case 'CLEAR_PARAMETERS':
        if (state.parameters.size === 0) return state;
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
        if (state.systemRegisters.size === 0) return state;
        return { ...state, systemRegisters: new Map() };

      default:
        return state;
    }
  };
}

interface DSHubContextType {
  state: DSHubState;
  actions: {
    startScan: () => void;
    /** Resolves `true` once the request to connect succeeds, `false` if it fails — never rejects. */
    connectDevice: (ip: string, interfaceType: InterfaceType, deviceName?: string) => Promise<boolean>;
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
    readSystemRegister: (address: number, name?: string) => void;
    writeSystemRegister: (address: number, value: number) => void;
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
  /**
   * Whether this provider instance disconnects the device when it unmounts.
   * Defaults to `true` — the Main Window's own instance, which owns the
   * device connection's lifecycle for the app's whole run. A Daughter
   * Window's own instance (`.scratch/daughter-windows-native` issue 02)
   * passes `false`: closing a Daughter Window must never disconnect the
   * Main Window from the device just because *a* `DSHubProvider` unmounted
   * — before this ticket there was only ever one instance for the app's
   * entire lifetime, so this distinction never had to exist (ADR 0003's
   * amendment).
   */
  ownsDeviceLifecycle?: boolean;
}

export function DSHubProvider({ children, ownsDeviceLifecycle = true }: DSHubProviderProps) {
  const { settings, updateSettings } = useSettings();
  const port = useBackendPort();

  const logSettingsRef = React.useRef(settings.logSettings);
  logSettingsRef.current = settings.logSettings; // Keep current synchronously so the reducer never reads stale settings

  const dsHubReducer = useMemo(
    () => createDSHubReducer(() => logSettingsRef.current),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [state, dispatch] = useReducer(dsHubReducer, initialState);
  const connectionRef = React.useRef<DeviceConnection | null>(null);

  React.useEffect(() => { connectionRef.current = state.connection; }, [state.connection]);

  // ── Log batching ──────────────────────────────────────────────────────────
  // A busy link produces a log entry per response. Dispatching each one
  // separately copied the whole log array and re-rendered every context consumer
  // per response; buffering to the next frame collapses that into one update.
  const logBufferRef = React.useRef<LogEntry[]>([]);
  const logFlushRef = React.useRef<number | null>(null);

  const flushLogs = React.useCallback(() => {
    logFlushRef.current = null;
    const batch = logBufferRef.current;
    if (batch.length === 0) return;
    logBufferRef.current = [];
    dispatch({ type: 'ADD_LOG_ENTRIES', payload: batch });
  }, []);

  const queueLogEntry = React.useCallback((entry: LogEntry) => {
    logBufferRef.current.push(entry);
    if (logFlushRef.current === null) {
      logFlushRef.current = requestAnimationFrame(flushLogs);
    }
  }, [flushLogs]);

  React.useEffect(() => () => {
    if (logFlushRef.current !== null) cancelAnimationFrame(logFlushRef.current);
  }, []);

  const queueLogRef = React.useRef(queueLogEntry);
  queueLogRef.current = queueLogEntry;

  /** Survives the effect being run more than once for the same provider. */
  const startupLogged = React.useRef(false);

  // ── Backend event listeners ───────────────────────────────────────────────

  useEffect(() => {
    // Marks the session, so it is logged once per session rather than once per
    // effect run. Unlike the subscriptions below there is no cleanup that could
    // undo it, so a second run would simply leave a second entry behind.
    if (!startupLogged.current) {
      startupLogged.current = true;
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'DSHub started', timestamp: Date.now() } });
    }

    // Send initial log settings to backend
    port.device.updateLogSettings(settings.logSettings).catch(console.error);

    let unlisteners: Array<() => void> = [];
    // Registration is asynchronous and this effect's cleanup is not, so a
    // cleanup can run while the subscriptions below are still in flight — React
    // does exactly that on every mount in development. Without this flag the
    // cleanup found nothing to remove, the registration completed afterwards,
    // and a second live handler set stayed behind: every device event then
    // dispatched twice.
    let cancelled = false;

    const setup = async () => {
      // Awaited in order, so registration order is unchanged.
      const registered = [
        await port.events.on('deviceDiscovered', device => {
          dispatch({ type: 'ADD_DISCOVERED_DEVICE', payload: device });
          dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'success', category: 'connection', message: `Device discovered: ${device.board_name} at ${device.ip_address} (ID: ${device.device_id})`, timestamp: Date.now() } });
        }),

        await port.events.on('scanComplete', () => {
          dispatch({ type: 'SET_SCANNING', payload: false });
          dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'Device scan completed', timestamp: Date.now() } });
        }),

        await port.events.on('connectionStatus', status => {
          dispatch({ type: 'SET_CONNECTING', payload: false });
          dispatch({ type: 'SET_CONNECTION', payload: status });
          if (status.connected) {
            dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'success', category: 'connection', message: `Connected to device at ${status.ip}:${status.port} via ${status.interface}`, timestamp: Date.now() } });
            // Remembered so a later session's "auto-connect to the last device"
            // (AutoConnectManager) has somewhere to read an address from — this
            // is the one place a connection is confirmed to have actually
            // succeeded, rather than merely requested.
            updateSettings({
              lastDeviceIP: status.ip,
              lastDeviceName: status.deviceName,
              lastInterfaceType: status.interface === InterfaceType.UDP ? 'UDP' : 'TCP',
            });
            // Control state itself arrives from the heartbeat's own first tick,
            // which fires immediately on connect rather than after its normal
            // interval — no separate read needed here to get it sooner.
          } else if (status.reconnecting) {
            dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'warning', category: 'connection', message: `Device unresponsive — reconnecting to ${status.ip}:${status.port}…`, timestamp: Date.now() } });
          } else {
            dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'warning', category: 'connection', message: 'Disconnected from device', timestamp: Date.now() } });
          }
        }),

        await port.events.on('registerUpdate', register => {
          dispatch({ type: 'UPDATE_REGISTER', payload: register });
          if (register.valid) {
            queueLogRef.current({ level: 'info', category: 'register', message: `Register ${register.name} (${register.address}): ${register.value}`, timestamp: Date.now() });
          } else {
            queueLogRef.current({ level: 'warning', category: 'register', message: `Invalid data received for register ${register.name} (${register.address})`, timestamp: Date.now() });
          }
        }),

        await port.events.on('parameterUpdate', parameter => {
          dispatch({ type: 'UPDATE_PARAMETER', payload: parameter });
          if (parameter.valid) {
            queueLogRef.current({ level: 'info', category: 'parameter', message: `Parameter ${parameter.name} (${parameter.address}): ${parameter.value}`, timestamp: Date.now() });
          } else {
            queueLogRef.current({ level: 'warning', category: 'parameter', message: `Invalid data received for parameter ${parameter.name} (${parameter.address})`, timestamp: Date.now() });
          }
        }),

        await port.events.on('logEntry', entry => {
          queueLogRef.current(entry);
        }),

        await port.events.on('plotData', ({ seriesName, point }) => {
          dispatch({ type: 'ADD_PLOT_DATA', payload: { series: seriesName, point } });
        }),

        await port.events.on('sysRegisterUpdate', register => {
          dispatch({ type: 'UPDATE_SYSTEM_REGISTER', payload: register });
        }),
      ];

      // Seeds current connection state rather than waiting for the next
      // transition, which may never come this session. `connectionStatus`
      // only ever announces a *change* — a provider mounting after the
      // device already connected (a Daughter Window opened mid-session,
      // `.scratch/daughter-windows-native` issue 02) would otherwise show
      // "disconnected" indefinitely despite a live connection. Harmless for
      // the Main Window's own instance too: at true app launch this simply
      // resolves to nothing connected yet.
      const status = await port.device.getConnectionStatus();
      if (!cancelled && status !== null) {
        dispatch({ type: 'SET_CONNECTION', payload: status });
      }

      if (cancelled) {
        // Cleaned up while registering. Undo it here, since the cleanup that
        // would have done so has already run.
        registered.forEach(u => u());
        return;
      }
      unlisteners = registered;
    };

    setup().catch(console.error);

    return () => {
      cancelled = true;
      unlisteners.forEach(u => u());
      unlisteners = [];
      // Disconnect from device if still connected — only for the instance
      // that owns the connection's lifecycle. A Daughter Window's own
      // instance (`ownsDeviceLifecycle={false}`) must never disconnect the
      // whole app from the device just because that one window closed.
      if (ownsDeviceLifecycle && connectionRef.current?.connected) {
        port.device.disconnect().catch(console.error);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownsDeviceLifecycle]);

  // Send log settings updates to backend when they change
  useEffect(() => {
    port.device.updateLogSettings(settings.logSettings).catch(console.error);
  }, [port, settings.logSettings]);

  // ── Actions ───────────────────────────────────────────────────────────────
  // Memoised once for the provider's lifetime. `dispatch` is stable and every
  // action closes only over it (or over a ref), so consumers can safely list
  // `actions` in effect dependency arrays without re-running every render.

  const actions = useMemo<DSHubContextType['actions']>(() => ({
    startScan: () => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'Starting device scan...', timestamp: Date.now() } });
      dispatch({ type: 'CLEAR_DISCOVERED_DEVICES' });
      dispatch({ type: 'SET_SCANNING', payload: true });
      port.device.startScan().catch(err => {
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'connection', message: `Scan error: ${err}`, timestamp: Date.now() } });
        dispatch({ type: 'SET_SCANNING', payload: false });
      });
    },

    connectDevice: (ip: string, interfaceType: InterfaceType, deviceName?: string) => {
      const displayName = deviceName ? `${deviceName} (${ip})` : ip;
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: `Connecting to ${displayName} via ${interfaceType}...`, timestamp: Date.now() } });
      dispatch({ type: 'SET_CONNECTING', payload: true });
      return port.device
        .connect(ip, interfaceType, deviceName)
        .then(() => true)
        .catch(err => {
          dispatch({ type: 'SET_CONNECTING', payload: false });
          dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'connection', message: `Connect failed: ${err}`, timestamp: Date.now() } });
          return false;
        });
    },

    disconnectDevice: () => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'Disconnecting from device...', timestamp: Date.now() } });
      port.device.disconnect().catch(console.error);
    },

    takeControl: () => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: 'Taking control of device interface...', timestamp: Date.now() } });
      port.device.takeControl().catch(err =>
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'connection', message: `Take control failed: ${err}`, timestamp: Date.now() } })
      );
    },

    readRegister: (address: number, name?: string) => {
      queueLogRef.current({ level: 'info', category: 'register', message: `Reading register at address ${address} (0x${address.toString(16).toUpperCase().padStart(4, '0')})`, timestamp: Date.now() });
      port.device.readRegister(address, name ?? '').catch(console.error);
    },

    writeRegister: (address: number, value: number) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'register', message: `Writing register at address ${address} (0x${address.toString(16).toUpperCase().padStart(4, '0')}) with value ${value}`, timestamp: Date.now() } });
      port.device.writeRegister(address, value).catch(err =>
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'register', message: `Write register failed: ${err}`, timestamp: Date.now() } })
      );
    },

    readParameter: (address: number, name?: string) => {
      queueLogRef.current({ level: 'info', category: 'parameter', message: `Reading parameter at address ${address}`, timestamp: Date.now() });
      port.device.readParameter(address, name ?? '').catch(console.error);
    },

    writeParameter: (address: number, value: number) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'parameter', message: `Writing parameter at address ${address} with value ${value}`, timestamp: Date.now() } });
      port.device.writeParameter(address, value).catch(err =>
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'parameter', message: `Write parameter failed: ${err}`, timestamp: Date.now() } })
      );
    },

    startPlotting: (registerName: string, pollInterval: number, address: number) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'plotting', message: `Starting to plot register '${registerName}' with ${pollInterval}ms interval`, timestamp: Date.now() } });
      dispatch({ type: 'ADD_ACTIVE_PLOT', payload: { registerName, address, pollInterval, source: 'register' } });
      port.device.startPlotting(registerName, pollInterval, address).catch(err =>
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'plotting', message: `Start plotting failed: ${err}`, timestamp: Date.now() } })
      );
    },

    startPlottingSysRegister: (registerName: string, pollInterval: number, address: number) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'plotting', message: `Starting to plot system register '${registerName}' with ${pollInterval}ms interval`, timestamp: Date.now() } });
      dispatch({ type: 'ADD_ACTIVE_PLOT', payload: { registerName, address, pollInterval, source: 'sysRegister' } });
      port.device.startPlottingSysRegister(registerName, pollInterval, address).catch(err =>
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'plotting', message: `Start plotting sys register failed: ${err}`, timestamp: Date.now() } })
      );
    },

    stopPlotting: (registerName: string) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'plotting', message: `Stopping plot for register '${registerName}'`, timestamp: Date.now() } });
      dispatch({ type: 'REMOVE_ACTIVE_PLOT', payload: registerName });
      port.device.stopPlotting(registerName).catch(console.error);
    },

    clearPlotData: (seriesName: string) => {
      dispatch({ type: 'CLEAR_PLOT_DATA', payload: seriesName });
    },

    sendCommand: (command: number, value: number, address: number = 0) => {
      dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'info', category: 'connection', message: `Sending command ${command} (addr=${address}) value=${value}`, timestamp: Date.now() } });
      port.device.sendCommand(command, address, value).catch(err =>
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

    readSystemRegister: (address: number, name?: string) => {
      port.device.readSystemRegister(address, name ?? '').catch(console.error);
    },

    writeSystemRegister: (address: number, value: number) => {
      port.device.writeSystemRegister(address, value).catch(err =>
        dispatch({ type: 'ADD_LOG_ENTRY', payload: { level: 'error', category: 'register', message: `Write system register failed: ${err}`, timestamp: Date.now() } })
      );
    },
  }), [port]);

  const value = useMemo<DSHubContextType>(() => ({ state, actions }), [state, actions]);

  return (
    <DSHubContext.Provider value={value}>
      {children}
    </DSHubContext.Provider>
  );
}
