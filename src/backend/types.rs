use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

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

/// A Command's answer from the Device.
///
/// `command` is the request's own address field, not the response's — SYS_COMMAND
/// (type 0) does not echo a meaningful address (see `response_matches`), so the
/// code identifying which Command this answers has to come from what was sent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResponse {
    pub command: u16,
    pub value: i32,
    pub status: i16,
    pub valid: bool,
    pub timestamp: f64,
}

/// The Device's answer to a register, parameter or system-register write.
///
/// Kept apart from `RegisterData`: a write response echoes the written value
/// only on success (PROTOCOL.md) and carries nothing meaningful on refusal, so
/// it never replaces the live value or enters a plot history. The status alone
/// decides the outcome.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteAck {
    /// The write operation that was sent (`CMD_WRITE_*`).
    pub command: u16,
    pub address: u16,
    pub status: i16,
    pub valid: bool,
    pub timestamp: f64,
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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

/// Lock-free view of the user's log filter.
///
/// Read on every request in the communicator hot path, so it deliberately avoids
/// a mutex. Before this existed the backend serialised two hex-dump `logEntry`
/// events per request across the IPC boundary regardless of the user's settings,
/// only for the frontend reducer to discard them.
#[derive(Debug)]
pub struct LogFilter {
    connection: AtomicBool,
    register: AtomicBool,
    parameter: AtomicBool,
    packet: AtomicBool,
    auto_refresh: AtomicBool,
    plotting: AtomicBool,
    /// Maximum device requests per second; 0 disables the limit.
    request_rate_limit: AtomicU32,
}

impl LogFilter {
    pub fn new() -> Self {
        Self::from_settings(&LogSettings::default())
    }

    pub fn from_settings(s: &LogSettings) -> Self {
        LogFilter {
            connection: AtomicBool::new(s.enable_connection_logs),
            register: AtomicBool::new(s.enable_register_logs),
            parameter: AtomicBool::new(s.enable_parameter_logs),
            packet: AtomicBool::new(s.enable_packet_logs),
            auto_refresh: AtomicBool::new(s.enable_auto_refresh_logs),
            plotting: AtomicBool::new(s.enable_plotting_logs),
            request_rate_limit: AtomicU32::new(s.request_rate_limit),
        }
    }

    pub fn update(&self, s: &LogSettings) {
        self.connection
            .store(s.enable_connection_logs, Ordering::Relaxed);
        self.register
            .store(s.enable_register_logs, Ordering::Relaxed);
        self.parameter
            .store(s.enable_parameter_logs, Ordering::Relaxed);
        self.packet.store(s.enable_packet_logs, Ordering::Relaxed);
        self.auto_refresh
            .store(s.enable_auto_refresh_logs, Ordering::Relaxed);
        self.plotting
            .store(s.enable_plotting_logs, Ordering::Relaxed);
        self.request_rate_limit
            .store(s.request_rate_limit, Ordering::Relaxed);
    }

    pub fn category_enabled(&self, category: &LogCategory) -> bool {
        let flag = match category {
            LogCategory::Connection => &self.connection,
            LogCategory::Register => &self.register,
            LogCategory::Parameter => &self.parameter,
            LogCategory::Packet => &self.packet,
            LogCategory::AutoRefresh => &self.auto_refresh,
            LogCategory::Plotting => &self.plotting,
        };
        flag.load(Ordering::Relaxed)
    }

    pub fn packet_enabled(&self) -> bool {
        self.packet.load(Ordering::Relaxed)
    }

    pub fn request_rate_limit(&self) -> u32 {
        self.request_rate_limit.load(Ordering::Relaxed)
    }
}

impl Default for LogFilter {
    fn default() -> Self {
        Self::new()
    }
}

// ── Protocol constants ────────────────────────────────────────────────────────

/// Command type field values for the datastream protocol (v0.2.2: u16).
/// Packets are 8 bytes: type(u16 LE) + address(u16 LE) + value(i32 LE) for TX,
///                       status(i16 LE) + address(u16 LE) + value(i32 LE) for RX.
pub const CMD_SYS_COMMAND: u16 = 0;
pub const CMD_READ_REGISTER: u16 = 1;
pub const CMD_WRITE_REGISTER: u16 = 2;
pub const CMD_READ_PARAMETER: u16 = 3;
pub const CMD_WRITE_PARAMETER: u16 = 4;
pub const CMD_TAKE_CONTROL: u16 = 5;
/// System registers are library-managed and read-only from the protocol.
/// Writes via CMD_WRITE_SYS_REG always return PERMISSION_ERROR (-5) from the device.
pub const CMD_READ_SYS_REG: u16 = 6;
pub const CMD_WRITE_SYS_REG: u16 = 7;

/// Library system command addresses (v0.2.2: moved to 65000–65002 range).
/// Sent as: type=CMD_SYS_COMMAND(0), address=SYS_CMD_*.
pub const SYS_CMD_READ_FLASH: u16 = 65000;
pub const SYS_CMD_WRITE_FLASH: u16 = 65001;
pub const SYS_CMD_RESET_FIRMWARE: u16 = 65002;

pub const DS_DISCOVERY_MAGIC: u32 = 0xDEAD_BEEF;
pub const DS_DISCOVERY_REQUEST: u8 = 0x01;
pub const DS_DISCOVERY_RESPONSE: u8 = 0x02;
pub const DISCOVERY_PORT: u16 = 2011;
pub const DEFAULT_TCP_PORT: u16 = 2009;
pub const DEFAULT_UDP_PORT: u16 = 2011;
