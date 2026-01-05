// Shared types between client and server

export interface DiscoveredDevice {
  ip_address: string;
  board_name: string;
  mac_address: string;
  device_id: number;
  board_type: number;
  firmware_version: number;
  tcp_port: number;
  udp_port: number;
}

export enum InterfaceType {
  TCP = 'TCP',
  UDP = 'UDP'
}

export enum ControlInterfaceState {
  UNDECIDED = 0,
  TCP_DATASTREAM = 1,
  UDP_DATASTREAM = 2,
  TCP_CLI = 101,
  USB = 102
}

export interface RegisterData {
  address: number;
  name: string;
  value: number;
  valid: boolean;
  timestamp: number;
}

export interface ParameterData {
  address: number;
  name: string;
  value: number;
  valid: boolean;
  timestamp: number;
}

export interface DeviceConnection {
  ip: string;
  port: number;
  interface: InterfaceType;
  connected: boolean;
  controlState: ControlInterfaceState;
  deviceName?: string; // Board name from device discovery
}

export interface PlotDataPoint {
  x: number; // timestamp
  y: number; // value
}

export interface PlotSeries {
  name: string;
  data: PlotDataPoint[];
  color: string;
  visible: boolean;
}

export type LogCategory = 'connection' | 'register' | 'parameter' | 'packet' | 'autoRefresh' | 'plotting';

export interface LogEntry {
  level: 'info' | 'warning' | 'error' | 'success' | 'packet';
  category: LogCategory;
  message: string;
  timestamp: number;
  packetData?: PacketInfo;
}

export interface PacketInfo {
  direction: 'SENT' | 'RECEIVED';
  size: number;
  hexData: string;
  analysis: string;
  responseTime?: number;
  interface: string;
  destination: string;
}

export interface LogSettings {
  enableConnectionLogs: boolean;
  enableRegisterLogs: boolean;
  enableParameterLogs: boolean;
  enablePacketLogs: boolean; // Detailed packet hex dumps and analysis (very verbose)
  enableAutoRefreshLogs: boolean;
  enablePlottingLogs: boolean;
  maxLogCount: number;
}

// Socket.IO event types
export interface ServerToClientEvents {
  deviceDiscovered: (device: DiscoveredDevice) => void;
  scanComplete: () => void;
  connectionStatus: (status: DeviceConnection) => void;
  registerUpdate: (register: RegisterData) => void;
  parameterUpdate: (parameter: ParameterData) => void;
  logEntry: (entry: LogEntry) => void;
  plotData: (seriesName: string, point: PlotDataPoint) => void;
}

export interface ClientToServerEvents {
  startScan: () => void;
  connectDevice: (ip: string, interfaceType: InterfaceType, deviceName?: string) => void;
  disconnectDevice: () => void;
  takeControl: () => void;
  readRegister: (address: number) => void;
  writeRegister: (address: number, value: number) => void;
  readParameter: (address: number) => void;
  writeParameter: (address: number, value: number) => void;
  startPlotting: (registerName: string, pollInterval: number) => void;
  stopPlotting: (registerName: string) => void;
  sendCommand: (command: number, value: number) => void;
  updateLogSettings: (settings: LogSettings) => void;
}

// Discovery protocol constants
export const DS_DISCOVERY_MAGIC = 0xDEADBEEF;
export const DS_DISCOVERY_REQUEST = 0x01;
export const DS_DISCOVERY_RESPONSE = 0x02;

export const DEFAULT_TCP_PORT = 2009;
export const DEFAULT_UDP_PORT = 2011;
export const DISCOVERY_PORT = 2011;