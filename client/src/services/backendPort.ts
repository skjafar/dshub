/**
 * The single boundary between the interface and the Rust backend.
 *
 * Every call that leaves the frontend passes through here, which makes this the
 * one seam the rebuild tests against: the real implementation talks to Tauri,
 * and a fake implementation serves both the test suites and browser development
 * so the two cannot drift apart.
 *
 * Three concerns cross this boundary and they are kept visibly separate, because
 * they change for different reasons. `device` speaks the board protocol;
 * `files` writes to the host filesystem through native save dialogs; `events`
 * carries everything the backend pushes the other way. A single flat interface
 * would have hidden the latter two behind a name describing only the first.
 */

import type {
  DeviceConnection,
  DiscoveredDevice,
  InterfaceType,
  LogEntry,
  ParameterData,
  PlotDataPoint,
  RegisterData,
} from '../types/shared';
import type { LogSettings } from '../types/settings';

/** A host save dialog request. These four always travel together. */
export interface SaveTextRequest {
  readonly content: string;
  readonly suggestedName: string;
  readonly filterName: string;
  readonly filterExt: string;
}

/**
 * Commands addressed to the Device.
 *
 * Reads resolve as soon as the request is *sent*, not when the value arrives —
 * responses are delivered as events, and the backend correlates each one to its
 * request by address. Callers must not treat a resolved read as a value.
 */
export interface DevicePort {
  startScan(): Promise<void>;
  connect(ip: string, interfaceType: InterfaceType, deviceName?: string): Promise<void>;
  disconnect(): Promise<void>;
  takeControl(): Promise<void>;

  readRegister(address: number, name: string): Promise<void>;
  writeRegister(address: number, value: number): Promise<void>;
  readParameter(address: number, name: string): Promise<void>;
  writeParameter(address: number, value: number): Promise<void>;
  readSystemRegister(address: number, name: string): Promise<void>;
  writeSystemRegister(address: number, value: number): Promise<void>;

  sendCommand(command: number, address: number, value: number): Promise<void>;

  startPlotting(registerName: string, pollInterval: number, address: number): Promise<void>;
  startPlottingSysRegister(registerName: string, pollInterval: number, address: number): Promise<void>;
  stopPlotting(registerName: string): Promise<void>;

  updateLogSettings(settings: LogSettings): Promise<void>;
}

/**
 * Writes to the host filesystem. Each resolves `true` when a file was written
 * and `false` when the user dismissed the save dialog — a dismissal is not an
 * error and must not be reported as one.
 */
export interface FilePort {
  saveText(request: SaveTextRequest): Promise<boolean>;
  saveCsv(content: string, suggestedName: string): Promise<boolean>;
  savePdf(dataBase64: string, suggestedName: string): Promise<boolean>;
}

/**
 * Everything the backend pushes to the frontend, keyed by event name.
 *
 * Read commands resolve when the request is sent; the value itself arrives here.
 * That makes this half of the boundary load-bearing rather than incidental — a
 * port that could only send would leave the interface permanently empty.
 */
export interface BackendEventMap {
  deviceDiscovered: DiscoveredDevice;
  scanComplete: void;
  connectionStatus: DeviceConnection;
  registerUpdate: RegisterData;
  parameterUpdate: ParameterData;
  sysRegisterUpdate: RegisterData;
  logEntry: LogEntry;
  plotData: { seriesName: string; point: PlotDataPoint };
}

export type BackendEventName = keyof BackendEventMap;

/** Removes one subscription. Safe to call more than once. */
export type Unsubscribe = () => void;

export interface EventPort {
  /**
   * Subscribes to a backend event. Resolves once the subscription is live,
   * mirroring the transport's own asynchronous registration — a caller that
   * awaits this knows no event has been missed after it returns.
   */
  on<K extends BackendEventName>(
    event: K,
    handler: (payload: BackendEventMap[K]) => void
  ): Promise<Unsubscribe>;
}

export interface BackendPort {
  readonly device: DevicePort;
  readonly files: FilePort;
  readonly events: EventPort;
}
