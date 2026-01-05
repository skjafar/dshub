// Copy of shared types from server
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
  // Enhanced with map data
  type?: string;
  isReadOnly?: boolean;
  showAsHex?: boolean;
  description?: string;
}

export interface ParameterData {
  address: number;
  name: string;
  value: number;
  valid: boolean;
  timestamp: number;
  // Enhanced with map data
  type?: string;
  showAsHex?: boolean;
  description?: string;
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

export const DEFAULT_TCP_PORT = 2009;
export const DEFAULT_UDP_PORT = 2011;