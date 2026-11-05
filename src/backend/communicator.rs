use crate::runtime::AppHandle;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
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

// ── Log helpers ───────────────────────────────────────────────────────────────

/// The user's live log filter, or `None` before managed state is registered.
fn log_filter(app: &AppHandle) -> Option<std::sync::Arc<LogFilter>> {
    app.try_state()
        .map(|s| std::sync::Arc::clone(&s.log_filter))
}

pub fn emit_log(app: &AppHandle, level: LogLevel, category: LogCategory, message: String) {
    // Errors always reach the user; everything else honours the category filter.
    // Suppressing here — rather than in the frontend reducer — keeps the payload
    // off the IPC boundary entirely.
    if !matches!(level, LogLevel::Error) {
        if let Some(filter) = log_filter(app) {
            if !filter.category_enabled(&category) {
                return;
            }
        }
    }

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
    data.iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(" ")
}

fn analyze_tx_packet(data: &[u8]) -> String {
    if data.len() < 8 {
        return "Invalid TX packet".to_string();
    }
    let cmd = u16::from_le_bytes([data[0], data[1]]);
    let addr = u16::from_le_bytes([data[2], data[3]]);
    let val = i32::from_le_bytes([data[4], data[5], data[6], data[7]]);
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
    format!(
        "Type={} ({}) | Addr={} (0x{:04X}) | Value={}",
        cmd, cmd_name, addr, addr, val
    )
}

pub fn status_name(status: i16) -> &'static str {
    match status {
        0 => "SYS_CMD_OK",
        1 => "READ_REG_OK",
        2 => "WRITE_REG_OK",
        3 => "READ_PARAM_OK",
        4 => "WRITE_PARAM_OK",
        5 => "CONTROL_OK",
        6 => "READ_SYSREG_OK",
        -1 => "ERROR",
        -5 => "PERMISSION_ERROR",
        _ => "UNKNOWN",
    }
}

/// Whether a response status reports success.
///
/// Every success in this protocol is a non-negative code — `WRITE_REG_OK` is 2
/// and `WRITE_PARAM_OK` is 4, not 0 — and every failure is negative: `ERROR` is
/// -1 and `PERMISSION_ERROR` is -5.
///
/// This exists because the write arms below used to discard the status
/// altogether and emit `valid: true` whatever the board said. A write the device
/// refused was reported to the interface as a completed one, which is the exact
/// failure the write path is built to prevent: nothing on screen distinguished a
/// value that reached the register from one that was rejected.
pub fn status_ok(status: i16) -> bool {
    status >= 0
}

fn analyze_rx_packet(data: &[u8]) -> String {
    if data.len() < 8 {
        return "Invalid RX packet".to_string();
    }
    let status = i16::from_le_bytes([data[0], data[1]]);
    let addr = u16::from_le_bytes([data[2], data[3]]);
    let val = i32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    format!(
        "Status={} ({}) | Addr={} (0x{:04X}) | Value={}",
        status,
        status_name(status),
        addr,
        addr,
        val
    )
}

pub fn emit_packet_log(
    app: &AppHandle,
    direction: &str,
    data: &[u8],
    interface: &str,
    destination: &str,
    response_time: Option<u64>,
) {
    // Hot path: two calls per device request. Bail out before building the hex
    // dump and analysis strings when packet logging is off.
    match log_filter(app) {
        Some(filter) if filter.packet_enabled() => {}
        Some(_) => return,
        None => return,
    }

    let analysis = if direction == "TX" {
        analyze_tx_packet(data)
    } else {
        analyze_rx_packet(data)
    };
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

// ── Response correlation ──────────────────────────────────────────────────────

/// True when `data` is a plausible response to `req`.
///
/// The device echoes the request address for register/parameter traffic. A
/// mismatch means we are looking at a response left in the stream by an earlier
/// request that timed out; accepting it would silently attribute one register's
/// value to another and shift every subsequent read by one.
///
/// `CMD_TAKE_CONTROL`, `CMD_SYS_COMMAND` and user-defined commands do not echo a
/// meaningful address, so they are accepted unconditionally.
fn response_matches(req: &DeviceRequest, data: &[u8]) -> bool {
    match req.command {
        CMD_READ_REGISTER | CMD_WRITE_REGISTER | CMD_READ_PARAMETER | CMD_WRITE_PARAMETER
        | CMD_READ_SYS_REG | CMD_WRITE_SYS_REG => {
            if data.len() < 8 {
                return false;
            }
            u16::from_le_bytes([data[2], data[3]]) == req.address
        }
        _ => true,
    }
}

fn log_discarded_response(app: &AppHandle, req: &DeviceRequest, data: &[u8]) {
    let got = if data.len() >= 8 {
        u16::from_le_bytes([data[2], data[3]]).to_string()
    } else {
        "<short>".to_string()
    };
    emit_log(
        app,
        LogLevel::Warning,
        LogCategory::Connection,
        format!(
            "Discarded out-of-order response (addr={}, expected {}) — resynchronising",
            got, req.address
        ),
    );
}

/// Outcome of waiting for the response to a single request.
enum ResponseOutcome {
    Received([u8; 8]),
    Timeout,
    Fatal(String),
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

    let status = i16::from_le_bytes([data[0], data[1]]);
    let address = u16::from_le_bytes([data[2], data[3]]);
    let value = i32::from_le_bytes([data[4], data[5], data[6], data[7]]);
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
            let ok = status_ok(status);
            if !ok {
                emit_log(
                    app,
                    LogLevel::Error,
                    LogCategory::Register,
                    format!(
                        "Write to register {} (0x{:04X}) refused by the device: status={} ({})",
                        address,
                        address,
                        status,
                        status_name(status)
                    ),
                );
            }
            let reg = RegisterData {
                address,
                name,
                value,
                valid: ok,
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
            let ok = status_ok(status);
            if !ok {
                emit_log(
                    app,
                    LogLevel::Error,
                    LogCategory::Parameter,
                    format!(
                        "Write to parameter {} refused by the device: status={} ({})",
                        address,
                        status,
                        status_name(status)
                    ),
                );
            }
            let param = ParameterData {
                address,
                name,
                value,
                valid: ok,
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
            // System command response — library sys commands (READ_FLASH etc.) and
            // every Profile Command, which are both sent as type=0 with their code
            // in the address field. Mirrors the register/parameter write arms:
            // logged only on refusal, and the typed event (not the log) is what a
            // caller waiting on the outcome reads, so a refused Command cannot be
            // read as a sent one.
            let ok = status_ok(status);
            if !ok {
                emit_log(
                    app,
                    LogLevel::Error,
                    LogCategory::Connection,
                    format!(
                        "Command {} refused by the device: status={} ({})",
                        req.address,
                        status,
                        status_name(status)
                    ),
                );
            }
            let _ = app.emit(
                "commandResponse",
                &CommandResponse {
                    command: req.address,
                    value,
                    status,
                    valid: ok,
                    timestamp: ts,
                },
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
                format!(
                    "User command {} response: status={}, value={}",
                    req.command, status, value
                ),
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

                // Read 8-byte responses (protocol v0.2.2; read_exact handles TCP
                // stream fragmentation) until one correlates with this request or
                // the deadline passes. Discarding stale responses here re-syncs the
                // stream after a timeout instead of shifting every later read by one.
                let deadline = tokio::time::Instant::now() + REQUEST_TIMEOUT;
                let outcome = loop {
                    let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
                    if remaining.is_zero() {
                        break ResponseOutcome::Timeout;
                    }

                    let mut buf = [0u8; 8];
                    match timeout(remaining, stream.read_exact(&mut buf)).await {
                        Ok(Ok(_)) => {
                            if response_matches(&req, &buf) {
                                break ResponseOutcome::Received(buf);
                            }
                            log_discarded_response(&app, &req, &buf);
                        }
                        Ok(Err(e)) => {
                            break ResponseOutcome::Fatal(format!("TCP read error: {}", e))
                        }
                        Err(_) => break ResponseOutcome::Timeout,
                    }
                };

                match outcome {
                    ResponseOutcome::Received(buf) => {
                        consecutive_timeouts = 0;
                        let response_time = send_time.elapsed().as_millis() as u64;
                        emit_packet_log(&app, "RX", &buf, "TCP", &destination, Some(response_time));
                        process_response(&buf, &req, &app);
                    }
                    ResponseOutcome::Fatal(e) => {
                        emit_log(&app, LogLevel::Error, LogCategory::Connection, e);
                        should_reconnect = true;
                        break;
                    }
                    ResponseOutcome::Timeout => {
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

                // Wait for a datagram from the correct source that also correlates
                // with this request. A late reply to a previously timed-out request
                // would otherwise be accepted here and mis-attributed.
                let recv_future = async {
                    let mut buf = [0u8; 64];
                    loop {
                        match socket.recv_from(&mut buf).await {
                            Ok((n, src)) => {
                                if src.ip().to_string() != remote_ip || src.port() != remote_port {
                                    continue; // wrong source — ignore and keep waiting
                                }
                                if n < 8 {
                                    return Err(format!("Short UDP response: {} bytes", n));
                                }
                                let mut out = [0u8; 8];
                                out.copy_from_slice(&buf[..8]);
                                if response_matches(&req, &out) {
                                    return Ok::<[u8; 8], String>(out);
                                }
                                log_discarded_response(&app, &req, &out);
                            }
                            Err(e) => return Err(e.to_string()),
                        }
                    }
                };

                match timeout(REQUEST_TIMEOUT, recv_future).await {
                    Ok(Ok(response_buf)) => {
                        consecutive_timeouts = 0;
                        let response_time = send_time.elapsed().as_millis() as u64;
                        emit_packet_log(
                            &app,
                            "RX",
                            &response_buf,
                            "UDP",
                            &remote_addr,
                            Some(response_time),
                        );
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

#[cfg(test)]
mod tests {
    use super::*;

    fn req(command: u16, address: u16) -> DeviceRequest {
        DeviceRequest {
            packet: make_read_packet(command, address),
            command,
            address,
            name: None,
            emit_plot: false,
        }
    }

    /// 8-byte response frame: status(i16 LE) + address(u16 LE) + value(i32 LE)
    fn response(status: i16, address: u16, value: i32) -> [u8; 8] {
        let mut b = [0u8; 8];
        b[0..2].copy_from_slice(&status.to_le_bytes());
        b[2..4].copy_from_slice(&address.to_le_bytes());
        b[4..8].copy_from_slice(&value.to_le_bytes());
        b
    }

    #[test]
    fn accepts_a_response_for_the_requested_address() {
        let r = req(CMD_READ_REGISTER, 0x1234);
        assert!(response_matches(&r, &response(1, 0x1234, 42)));
    }

    #[test]
    fn rejects_a_response_for_a_different_address() {
        // The regression this guards: after a timeout the device's late reply used
        // to be consumed as the answer to the *next* request, so every subsequent
        // register silently displayed the previous register's value.
        let r = req(CMD_READ_REGISTER, 0x1234);
        assert!(!response_matches(&r, &response(1, 0x1235, 42)));
    }

    #[test]
    fn address_is_checked_for_every_register_and_parameter_command() {
        for command in [
            CMD_READ_REGISTER,
            CMD_WRITE_REGISTER,
            CMD_READ_PARAMETER,
            CMD_WRITE_PARAMETER,
            CMD_READ_SYS_REG,
            CMD_WRITE_SYS_REG,
        ] {
            let r = req(command, 10);
            assert!(
                response_matches(&r, &response(1, 10, 0)),
                "cmd {command} same addr"
            );
            assert!(
                !response_matches(&r, &response(1, 11, 0)),
                "cmd {command} other addr"
            );
        }
    }

    #[test]
    fn commands_without_a_meaningful_echo_are_accepted() {
        // TAKE_CONTROL, SYS_COMMAND and user-defined commands do not echo the
        // request address, so correlating on it would reject valid responses.
        for command in [CMD_TAKE_CONTROL, CMD_SYS_COMMAND, 200] {
            let r = req(command, 0);
            assert!(response_matches(&r, &response(0, 999, 1)), "cmd {command}");
        }
    }

    #[test]
    fn a_refused_write_is_not_reported_as_a_successful_one() {
        // The write arms used to discard the status and emit `valid: true`
        // whatever the board answered, so a register the device refused to write
        // — PERMISSION_ERROR, or an ERROR from a value it would not take — was
        // reported to the interface as written. Nothing on screen distinguished
        // it from a value that had actually landed.
        assert!(!status_ok(-5), "PERMISSION_ERROR");
        assert!(!status_ok(-1), "ERROR");
    }

    #[test]
    fn the_success_codes_this_protocol_uses_are_not_zero() {
        // Writes answer 2 and 4, not 0. Treating "success" as `status == 0`
        // would report every accepted write as refused.
        assert!(status_ok(2), "WRITE_REG_OK");
        assert!(status_ok(4), "WRITE_PARAM_OK");
        assert!(status_ok(0), "SYS_CMD_OK");
        assert_eq!(status_name(2), "WRITE_REG_OK");
        assert_eq!(status_name(-5), "PERMISSION_ERROR");
    }

    #[test]
    fn rejects_a_truncated_frame() {
        let r = req(CMD_READ_REGISTER, 5);
        assert!(!response_matches(&r, &[0u8; 4]));
    }

    #[test]
    fn read_packet_is_eight_bytes_little_endian_with_zero_value() {
        let p = make_read_packet(CMD_READ_REGISTER, 0x0201);
        assert_eq!(p.len(), 8);
        assert_eq!(&p[0..2], &1u16.to_le_bytes());
        assert_eq!(&p[2..4], &0x0201u16.to_le_bytes());
        assert_eq!(&p[4..8], &[0, 0, 0, 0]);
    }

    #[test]
    fn write_packet_carries_a_signed_value() {
        let p = make_write_packet(CMD_WRITE_REGISTER, 0x00FF, -12345);
        assert_eq!(&p[0..2], &2u16.to_le_bytes());
        assert_eq!(&p[2..4], &0x00FFu16.to_le_bytes());
        assert_eq!(i32::from_le_bytes([p[4], p[5], p[6], p[7]]), -12345);
    }

    #[test]
    fn sys_command_packet_puts_the_command_in_the_address_field() {
        // Protocol v0.2.2: type = 0, address = the 65000-range system command.
        let p = make_sys_cmd_packet(SYS_CMD_WRITE_FLASH, 1);
        assert_eq!(u16::from_le_bytes([p[0], p[1]]), CMD_SYS_COMMAND);
        assert_eq!(u16::from_le_bytes([p[2], p[3]]), SYS_CMD_WRITE_FLASH);
    }
}
