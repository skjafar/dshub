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
    pub command: u8,
    pub address: u8,
    pub name: Option<String>,
    /// When true the response also emits a plotData event
    pub emit_plot: bool,
}

// ── Packet builders ───────────────────────────────────────────────────────────

/// 6-byte read packet: [cmd][addr][0 0 0 0]
pub fn make_read_packet(command: u8, address: u8) -> Vec<u8> {
    let mut p = vec![0u8; 6];
    p[0] = command;
    p[1] = address;
    p
}

/// 6-byte write packet: [cmd][addr][value LE i32]
pub fn make_write_packet(command: u8, address: u8, value: i32) -> Vec<u8> {
    let mut p = vec![0u8; 6];
    p[0] = command;
    p[1] = address;
    p[2..6].copy_from_slice(&value.to_le_bytes());
    p
}

/// 6-byte take-control packet: [5][0][interface_value LE]
pub fn make_control_packet(interface_value: u32) -> Vec<u8> {
    make_write_packet(5, 0, interface_value as i32)
}

/// 10-byte system command packet: [0][cmd][value LE][0 0 0 0 checksum]
pub fn make_sys_cmd_packet(command: u8, value: i32) -> Vec<u8> {
    let mut p = vec![0u8; 10];
    p[0] = 0;
    p[1] = command;
    p[2..6].copy_from_slice(&value.to_le_bytes());
    // bytes [6..10] remain 0 (checksum placeholder)
    p
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
    let _ = app.emit("logEntry", &entry);
}

// ── Response processor ────────────────────────────────────────────────────────

fn process_response(data: &[u8], req: &DeviceRequest, app: &AppHandle) {
    if data.len() < 6 {
        emit_log(
            app,
            LogLevel::Error,
            LogCategory::Connection,
            format!("Short response: {} bytes (expected 6)", data.len()),
        );
        return;
    }

    let address = data[1];
    let value = i32::from_le_bytes([data[2], data[3], data[4], data[5]]);
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
            // Take control response
            emit_log(
                app,
                LogLevel::Info,
                LogCategory::Connection,
                format!("Take Control acknowledged (control_state={})", value),
            );
        }
        0 => {
            // System command response
            emit_log(
                app,
                LogLevel::Info,
                LogCategory::Connection,
                format!("System command response: status={}, value={}", data[0], value),
            );
        }
        _ => {}
    }
}

// ── TCP background task ───────────────────────────────────────────────────────

pub async fn run_tcp_communicator(
    mut stream: TcpStream,
    mut rx: mpsc::Receiver<DeviceRequest>,
    app: AppHandle,
    mut connection: DeviceConnection,
) {
    const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

    while let Some(req) = rx.recv().await {
        // Send the packet
        if let Err(e) = stream.write_all(&req.packet).await {
            emit_log(
                &app,
                LogLevel::Error,
                LogCategory::Connection,
                format!("TCP write error: {}", e),
            );
            break;
        }

        // Read exactly 6-byte response (handles TCP stream fragmentation)
        let mut buf = [0u8; 6];
        match timeout(REQUEST_TIMEOUT, stream.read_exact(&mut buf)).await {
            Ok(Ok(_)) => {
                process_response(&buf, &req, &app);
            }
            Ok(Err(e)) => {
                emit_log(
                    &app,
                    LogLevel::Error,
                    LogCategory::Connection,
                    format!("TCP read error: {}", e),
                );
                break;
            }
            Err(_) => {
                emit_log(
                    &app,
                    LogLevel::Error,
                    LogCategory::Register,
                    format!(
                        "Request timeout (addr={}, cmd={})",
                        req.address, req.command
                    ),
                );
                // Continue processing the queue after a timeout
            }
        }
    }

    // Connection lost — notify frontend
    connection.connected = false;
    let _ = app.emit("connectionStatus", &connection);
    emit_log(
        &app,
        LogLevel::Info,
        LogCategory::Connection,
        "TCP connection closed".to_string(),
    );
}

// ── UDP background task ───────────────────────────────────────────────────────

pub async fn run_udp_communicator(
    socket: UdpSocket,
    mut rx: mpsc::Receiver<DeviceRequest>,
    app: AppHandle,
    mut connection: DeviceConnection,
    remote_ip: String,
    remote_port: u16,
) {
    const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
    let remote_addr = format!("{}:{}", remote_ip, remote_port);

    while let Some(req) = rx.recv().await {
        // Send packet
        if let Err(e) = socket.send_to(&req.packet, &remote_addr).await {
            emit_log(
                &app,
                LogLevel::Error,
                LogCategory::Connection,
                format!("UDP send error: {}", e),
            );
            break;
        }

        // Wait for a response from the correct source within the timeout
        let recv_future = async {
            let mut buf = [0u8; 64];
            loop {
                match socket.recv_from(&mut buf).await {
                    Ok((n, src)) => {
                        if src.ip().to_string() == remote_ip && src.port() == remote_port {
                            if n >= 6 {
                                let mut out = [0u8; 6];
                                out.copy_from_slice(&buf[..6]);
                                return Ok::<[u8; 6], String>(out);
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
                process_response(&response_buf, &req, &app);
            }
            Ok(Err(e)) => {
                emit_log(
                    &app,
                    LogLevel::Error,
                    LogCategory::Connection,
                    format!("UDP error: {}", e),
                );
                break;
            }
            Err(_) => {
                emit_log(
                    &app,
                    LogLevel::Error,
                    LogCategory::Register,
                    format!(
                        "Request timeout (addr={}, cmd={})",
                        req.address, req.command
                    ),
                );
                // Continue processing the queue after a timeout
            }
        }
    }

    connection.connected = false;
    let _ = app.emit("connectionStatus", &connection);
    emit_log(
        &app,
        LogLevel::Info,
        LogCategory::Connection,
        "UDP communicator stopped".to_string(),
    );
}
