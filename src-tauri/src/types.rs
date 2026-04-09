use serde::{Deserialize, Serialize};

// ── Discovery types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredDevice {
    pub ip_address: String,
    pub board_name: String,
    pub mac_address: String,
    pub device_id: u32,
    pub board_type: u8,
    pub firmware_version: u16,
    pub tcp_port: u16,
    pub udp_port: u16,
}

// ── Connection types ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InterfaceType {
    #[serde(rename = "TCP")]
    Tcp,
    #[serde(rename = "UDP")]
    Udp,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceConnection {
    pub ip: String,
    pub port: u16,
    /// Serialised as "interface" to match the TypeScript shape
    #[serde(rename = "interface")]
    pub interface_type: InterfaceType,
    pub connected: bool,
    /// True while a reconnect loop is running after an unexpected disconnect.
    /// False once the user intentionally disconnects or reconnect succeeds.
    pub reconnecting: bool,
    /// Serialised as "controlState" (numeric) to match TypeScript
    #[serde(rename = "controlState")]
    pub control_state: u32,
    #[serde(rename = "deviceName", skip_serializing_if = "Option::is_none")]
    pub device_name: Option<String>,
}

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterData {
    pub address: u16,
    pub name: String,
    pub value: i32,
    pub valid: bool,
    pub timestamp: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterData {
    pub address: u16,
    pub name: String,
    pub value: i32,
    pub valid: bool,
    pub timestamp: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlotDataPoint {
    pub x: f64, // Unix timestamp in seconds
    pub y: f64, // register value
}

/// Payload for the "plotData" Tauri event (single-arg replacement for Socket.IO two-arg emit)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlotDataPayload {
    #[serde(rename = "seriesName")]
    pub series_name: String,
    pub point: PlotDataPoint,
}

// ── Log types ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Info,
    Warning,
    Error,
    Success,
    Packet,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LogCategory {
    #[serde(rename = "connection")]
    Connection,
    #[serde(rename = "register")]
    Register,
    #[serde(rename = "parameter")]
    Parameter,
    #[serde(rename = "packet")]
    Packet,
    #[serde(rename = "autoRefresh")]
    AutoRefresh,
    #[serde(rename = "plotting")]
    Plotting,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PacketInfo {
    pub direction: String,
    pub size: usize,
    #[serde(rename = "hexData")]
    pub hex_data: String,
    pub analysis: String,
    #[serde(rename = "responseTime", skip_serializing_if = "Option::is_none")]
    pub response_time: Option<u64>,
    pub interface: String,
    pub destination: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub level: LogLevel,
    pub category: LogCategory,
    pub message: String,
    pub timestamp: f64,
    #[serde(rename = "packetData", skip_serializing_if = "Option::is_none")]
    pub packet_data: Option<PacketInfo>,
}

// ── Settings ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogSettings {
    pub enable_connection_logs: bool,
    pub enable_register_logs: bool,
    pub enable_parameter_logs: bool,
    pub enable_packet_logs: bool,
    pub enable_auto_refresh_logs: bool,
    pub enable_plotting_logs: bool,
    pub max_log_count: u32,
    pub request_rate_limit: u32,
}

impl Default for LogSettings {
    fn default() -> Self {
        LogSettings {
            enable_connection_logs: true,
            enable_register_logs: false,
            enable_parameter_logs: false,
            enable_packet_logs: false,
            enable_auto_refresh_logs: false,
            enable_plotting_logs: false,
            max_log_count: 1000,
            request_rate_limit: 2000,
        }
    }
}

// ── Protocol constants ────────────────────────────────────────────────────────

/// Command type field values for the datastream protocol (v0.2.2: u16).
/// Packets are 8 bytes: type(u16 LE) + address(u16 LE) + value(i32 LE) for TX,
///                       status(i16 LE) + address(u16 LE) + value(i32 LE) for RX.
pub const CMD_SYS_COMMAND: u16      = 0;
pub const CMD_READ_REGISTER: u16    = 1;
pub const CMD_WRITE_REGISTER: u16   = 2;
pub const CMD_READ_PARAMETER: u16   = 3;
pub const CMD_WRITE_PARAMETER: u16  = 4;
pub const CMD_TAKE_CONTROL: u16     = 5;
/// System registers are library-managed and read-only from the protocol.
/// Writes via CMD_WRITE_SYS_REG always return PERMISSION_ERROR (-5) from the device.
pub const CMD_READ_SYS_REG: u16     = 6;
pub const CMD_WRITE_SYS_REG: u16    = 7;

/// Library system command addresses (v0.2.2: moved to 65000–65002 range).
/// Sent as: type=CMD_SYS_COMMAND(0), address=SYS_CMD_*.
pub const SYS_CMD_READ_FLASH: u16     = 65000;
pub const SYS_CMD_WRITE_FLASH: u16    = 65001;
pub const SYS_CMD_RESET_FIRMWARE: u16 = 65002;

pub const DS_DISCOVERY_MAGIC: u32 = 0xDEAD_BEEF;
pub const DS_DISCOVERY_REQUEST: u8 = 0x01;
pub const DS_DISCOVERY_RESPONSE: u8 = 0x02;
pub const DISCOVERY_PORT: u16 = 2011;
pub const DEFAULT_TCP_PORT: u16 = 2009;
pub const DEFAULT_UDP_PORT: u16 = 2011;
