use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpStream, UdpSocket};
use tokio::sync::mpsc;
use tokio::time::timeout;

use crate::types::*;

// ── Request type queued by commands ──────────────────────────────────────────

pub struct DeviceRequest {
    pub packet: Vec<u8>,
    pub command: u16,
    pub address: u16,
    pub name: Option<String>,
    /// When true the response also emits a plotData event
    pub emit_plot: bool,
}

// ── Packet builders (protocol v0.2.2: 8-byte packets, 16-bit fields) ─────────

/// 8-byte read packet: [type u16 LE][addr u16 LE][0 0 0 0]
pub fn make_read_packet(command: u16, address: u16) -> Vec<u8> {
    let mut p = vec![0u8; 8];
    p[0..2].copy_from_slice(&command.to_le_bytes());
    p[2..4].copy_from_slice(&address.to_le_bytes());
    // bytes [4..8] remain 0 (value = 0 for reads)
    p
}

/// 8-byte write packet: [type u16 LE][addr u16 LE][value i32 LE]
pub fn make_write_packet(command: u16, address: u16, value: i32) -> Vec<u8> {
    let mut p = vec![0u8; 8];
    p[0..2].copy_from_slice(&command.to_le_bytes());
    p[2..4].copy_from_slice(&address.to_le_bytes());
    p[4..8].copy_from_slice(&value.to_le_bytes());
    p
}

/// 8-byte take-control packet: [5 u16 LE][0 u16 LE][interface_value i32 LE]
pub fn make_control_packet(interface_value: u32) -> Vec<u8> {
    make_write_packet(CMD_TAKE_CONTROL, 0, interface_value as i32)
}

/// 8-byte system command packet: [0 u16 LE][sys_cmd u16 LE][value i32 LE]
/// sys_cmd uses the address field; library commands are 65000–65002 (v0.2.2).
pub fn make_sys_cmd_packet(sys_cmd: u16, value: i32) -> Vec<u8> {
    make_write_packet(CMD_SYS_COMMAND, sys_cmd, value)
}

/// 8-byte user-defined command packet: [cmd_type u16 LE][address u16 LE][value i32 LE]
/// For application commands (CNC motor control, etc.) with type >= 100.
pub fn make_user_cmd_packet(cmd_type: u16, address: u16, value: i32) -> Vec<u8> {
    make_write_packet(cmd_type, address, value)
}

// ── Time helpers ──────────────────────────────────────────────────────────────

pub fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as f64
}

pub fn now_secs() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

// ── Log helper ────────────────────────────────────────────────────────────────

pub fn emit_log(app: &AppHandle, level: LogLevel, category: LogCategory, message: String) {
    let entry = LogEntry {
        level,
        category,
        message,
        timestamp: now_ms(),
        packet_data: None,
    };
    if let Err(e) = app.emit("logEntry", &entry) {
        log::warn!("Failed to emit logEntry event: {}", e);
    }
}

fn hex_dump(data: &[u8]) -> String {
    data.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ")
}

fn analyze_tx_packet(data: &[u8]) -> String {
    if data.len() < 8 { return "Invalid TX packet".to_string(); }
    let cmd  = u16::from_le_bytes([data[0], data[1]]);
    let addr = u16::from_le_bytes([data[2], data[3]]);
    let val  = i32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    let cmd_name = match cmd {
        0 => "SYS_COMMAND",
        1 => "READ_REGISTER",
        2 => "WRITE_REGISTER",
        3 => "READ_PARAMETER",
        4 => "WRITE_PARAMETER",
        5 => "TAKE_CONTROL",
        6 => "READ_SYS_REG",
        7 => "WRITE_SYS_REG",
        _ => "USER_CMD",
    };
    format!("Type={} ({}) | Addr={} (0x{:04X}) | Value={}", cmd, cmd_name, addr, addr, val)
}

fn analyze_rx_packet(data: &[u8]) -> String {
    if data.len() < 8 { return "Invalid RX packet".to_string(); }
    let status = i16::from_le_bytes([data[0], data[1]]);
    let addr   = u16::from_le_bytes([data[2], data[3]]);
    let val    = i32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    let status_name = match status {
        0  => "SYS_CMD_OK",
        1  => "READ_REG_OK",
        2  => "WRITE_REG_OK",
        3  => "READ_PARAM_OK",
        4  => "WRITE_PARAM_OK",
        5  => "CONTROL_OK",
        6  => "READ_SYSREG_OK",
        -1 => "ERROR",
        -5 => "PERMISSION_ERROR",
        _  => "UNKNOWN",
    };
    format!("Status={} ({}) | Addr={} (0x{:04X}) | Value={}", status, status_name, addr, addr, val)
}

pub fn emit_packet_log(
    app: &AppHandle,
    direction: &str,
    data: &[u8],
    interface: &str,
    destination: &str,
    response_time: Option<u64>,
) {
    let analysis = if direction == "TX" { analyze_tx_packet(data) } else { analyze_rx_packet(data) };
    let entry = LogEntry {
        level: LogLevel::Packet,
        category: LogCategory::Packet,
        message: format!("{} {} | {} bytes", direction, interface, data.len()),
        timestamp: now_ms(),
        packet_data: Some(PacketInfo {
            direction: direction.to_string(),
            size: data.len(),
            hex_data: hex_dump(data),
            analysis,
            response_time,
            interface: interface.to_string(),
            destination: destination.to_string(),
        }),
    };
    let _ = app.emit("logEntry", &entry);
}

// ── Response processor ────────────────────────────────────────────────────────

fn process_response(data: &[u8], req: &DeviceRequest, app: &AppHandle) {
    // Protocol v0.2.2: 8-byte response: status(i16 LE) + address(u16 LE) + value(i32 LE)
    if data.len() < 8 {
        emit_log(
            app,
            LogLevel::Error,
            LogCategory::Connection,
            format!("Short response: {} bytes (expected 8)", data.len()),
        );
        return;
    }

    let status  = i16::from_le_bytes([data[0], data[1]]);
    let address = u16::from_le_bytes([data[2], data[3]]);
    let value   = i32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    let ts = now_ms();

    match req.command {
        1 => {
            // Register read response
            let name = req
                .name
                .clone()
                .unwrap_or_else(|| format!("addr_{}", address));
            let reg = RegisterData {
                address,
                name: name.clone(),
                value,
                valid: true,
                timestamp: ts,
            };
            let _ = app.emit("registerUpdate", &reg);
            if req.emit_plot {
                let payload = PlotDataPayload {
                    series_name: name,
                    point: PlotDataPoint {
                        x: now_secs(),
                        y: value as f64,
                    },
                };
                let _ = app.emit("plotData", &payload);
            }
        }
        2 => {
            // Register write confirmation
            let name = req
                .name
                .clone()
                .unwrap_or_else(|| format!("addr_{}", address));
            let reg = RegisterData {
                address,
                name,
                value,
                valid: true,
                timestamp: ts,
            };
            let _ = app.emit("registerUpdate", &reg);
        }
        3 => {
            // Parameter read response
            let name = req
                .name
                .clone()
                .unwrap_or_else(|| format!("param_{}", address));
            let param = ParameterData {
                address,
                name,
                value,
                valid: true,
                timestamp: ts,
            };
            let _ = app.emit("parameterUpdate", &param);
        }
        4 => {
            // Parameter write confirmation
            let name = req
                .name
                .clone()
                .unwrap_or_else(|| format!("param_{}", address));
            let param = ParameterData {
                address,
                name,
                value,
                valid: true,
                timestamp: ts,
            };
            let _ = app.emit("parameterUpdate", &param);
        }
        5 => {
            // Take control response — emit sysRegisterUpdate for CONTROL_INTERFACE (addr 2)
            // so the frontend can update its controlState display.
            let reg = RegisterData {
                address: 2, // SYSREG_CONTROL_INTERFACE
                name: "CONTROL_INTERFACE".to_string(),
                value,
                valid: true,
                timestamp: ts,
            };
            let _ = app.emit("sysRegisterUpdate", &reg);
            emit_log(
                app,
                LogLevel::Info,
                LogCategory::Connection,
                format!("Take Control acknowledged (control_state={})", value),
            );
        }
        0 => {
            // System command response (library sys commands: READ_FLASH etc.)
            emit_log(
                app,
                LogLevel::Info,
                LogCategory::Connection,
                format!("System command response: status={}, addr={}, value={}", status, address, value),
            );
        }
        6 => {
            // System register read response
            let name = req
                .name
                .clone()
                .unwrap_or_else(|| format!("sysreg_{}", address));
            let reg = RegisterData {
                address,
                name: name.clone(),
                value,
                valid: true,
                timestamp: ts,
            };
            let _ = app.emit("sysRegisterUpdate", &reg);
            if req.emit_plot {
                let payload = PlotDataPayload {
                    series_name: name,
                    point: PlotDataPoint {
                        x: now_secs(),
                        y: value as f64,
                    },
                };
                let _ = app.emit("plotData", &payload);
            }
        }
        7 => {
            // System register write response — device always returns PERMISSION_ERROR (-5)
            emit_log(
                app,
                LogLevel::Warning,
                LogCategory::Register,
                format!(
                    "Write system register addr={} returned status={} (expected PERMISSION_ERROR=-5)",
                    address, status
                ),
            );
        }
        _ => {
            // User-defined command response (CNC motor commands etc.)
            emit_log(
                app,
                LogLevel::Info,
                LogCategory::Connection,
                format!("User command {} response: status={}, value={}", req.command, status, value),
            );
        }
    }
}

// ── TCP background task ───────────────────────────────────────────────────────

/// Runs the TCP communicator loop.
/// Returns `true` if the exit was caused by a device error or timeout (caller should reconnect),
/// or `false` if the channel was closed intentionally (user disconnect).
pub async fn run_tcp_communicator(
    mut stream: TcpStream,
    mut rx: mpsc::Receiver<DeviceRequest>,
    app: AppHandle,
    connection: DeviceConnection,
) -> bool {
    const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
    /// Number of consecutive timeouts before declaring the device lost.
    const TIMEOUT_THRESHOLD: u32 = 3;

    let destination = format!("{}:{}", connection.ip, connection.port);
    let mut consecutive_timeouts: u32 = 0;
    let mut should_reconnect = false;

    loop {
        match rx.recv().await {
            None => break, // channel closed — intentional disconnect
            Some(req) => {
                let send_time = std::time::Instant::now();

                if let Err(e) = stream.write_all(&req.packet).await {
                    emit_log(
                        &app,
                        LogLevel::Error,
                        LogCategory::Connection,
                        format!("TCP write error: {}", e),
                    );
                    should_reconnect = true;
                    break;
                }
                emit_packet_log(&app, "TX", &req.packet, "TCP", &destination, None);

                // Read exactly 8-byte response (protocol v0.2.2; handles TCP stream fragmentation)
                let mut buf = [0u8; 8];
                match timeout(REQUEST_TIMEOUT, stream.read_exact(&mut buf)).await {
                    Ok(Ok(_)) => {
                        consecutive_timeouts = 0;
                        let response_time = send_time.elapsed().as_millis() as u64;
                        emit_packet_log(&app, "RX", &buf, "TCP", &destination, Some(response_time));
                        process_response(&buf, &req, &app);
                    }
                    Ok(Err(e)) => {
                        emit_log(
                            &app,
                            LogLevel::Error,
                            LogCategory::Connection,
                            format!("TCP read error: {}", e),
                        );
                        should_reconnect = true;
                        break;
                    }
                    Err(_) => {
                        consecutive_timeouts += 1;
                        emit_log(
                            &app,
                            LogLevel::Error,
                            LogCategory::Register,
                            format!(
                                "Request timeout (addr={}, cmd={}) [{}/{}]",
                                req.address, req.command, consecutive_timeouts, TIMEOUT_THRESHOLD
                            ),
                        );
                        if consecutive_timeouts >= TIMEOUT_THRESHOLD {
                            emit_log(
                                &app,
                                LogLevel::Error,
                                LogCategory::Connection,
                                "Device unresponsive — connection lost".to_string(),
                            );
                            should_reconnect = true;
                            break;
                        }
                    }
                }
            }
        }
    }

    should_reconnect
}

// ── UDP background task ───────────────────────────────────────────────────────

/// Runs the UDP communicator loop.
/// Returns `true` if the exit was caused by a device error or timeout (caller should reconnect),
/// or `false` if the channel was closed intentionally (user disconnect).
pub async fn run_udp_communicator(
    socket: UdpSocket,
    mut rx: mpsc::Receiver<DeviceRequest>,
    app: AppHandle,
    _connection: DeviceConnection,
    remote_ip: String,
    remote_port: u16,
) -> bool {
    const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
    /// Number of consecutive timeouts before declaring the device lost.
    const TIMEOUT_THRESHOLD: u32 = 3;

    let remote_addr = format!("{}:{}", remote_ip, remote_port);
    let mut consecutive_timeouts: u32 = 0;
    let mut should_reconnect = false;

    loop {
        match rx.recv().await {
            None => break, // channel closed — intentional disconnect
            Some(req) => {
                let send_time = std::time::Instant::now();

                if let Err(e) = socket.send_to(&req.packet, &remote_addr).await {
                    emit_log(
                        &app,
                        LogLevel::Error,
                        LogCategory::Connection,
                        format!("UDP send error: {}", e),
                    );
                    should_reconnect = true;
                    break;
                }
                emit_packet_log(&app, "TX", &req.packet, "UDP", &remote_addr, None);

                // Wait for a response from the correct source within the timeout
                let recv_future = async {
                    let mut buf = [0u8; 64];
                    loop {
                        match socket.recv_from(&mut buf).await {
                            Ok((n, src)) => {
                                if src.ip().to_string() == remote_ip && src.port() == remote_port {
                                    if n >= 8 {
                                        let mut out = [0u8; 8];
                                        out.copy_from_slice(&buf[..8]);
                                        return Ok::<[u8; 8], String>(out);
                                    } else {
                                        return Err(format!("Short UDP response: {} bytes", n));
                                    }
                                }
                                // Packet from wrong source — ignore and keep waiting
                            }
                            Err(e) => return Err(e.to_string()),
                        }
                    }
                };

                match timeout(REQUEST_TIMEOUT, recv_future).await {
                    Ok(Ok(response_buf)) => {
                        consecutive_timeouts = 0;
                        let response_time = send_time.elapsed().as_millis() as u64;
                        emit_packet_log(&app, "RX", &response_buf, "UDP", &remote_addr, Some(response_time));
                        process_response(&response_buf, &req, &app);
                    }
                    Ok(Err(e)) => {
                        emit_log(
                            &app,
                            LogLevel::Error,
                            LogCategory::Connection,
                            format!("UDP error: {}", e),
                        );
                        should_reconnect = true;
                        break;
                    }
                    Err(_) => {
                        consecutive_timeouts += 1;
                        emit_log(
                            &app,
                            LogLevel::Error,
                            LogCategory::Register,
                            format!(
                                "Request timeout (addr={}, cmd={}) [{}/{}]",
                                req.address, req.command, consecutive_timeouts, TIMEOUT_THRESHOLD
                            ),
                        );
                        if consecutive_timeouts >= TIMEOUT_THRESHOLD {
                            emit_log(
                                &app,
                                LogLevel::Error,
                                LogCategory::Connection,
                                "Device unresponsive — connection lost".to_string(),
                            );
                            should_reconnect = true;
                            break;
                        }
                    }
                }
            }
        }
    }

    should_reconnect
}
