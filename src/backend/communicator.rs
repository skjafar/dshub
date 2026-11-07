use crate::runtime::{AppHandle, Event};
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
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
}

const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
/// Number of consecutive timeouts before declaring the device lost.
const TIMEOUT_THRESHOLD: u32 = 3;

// ── Packet builders (protocol v0.2.2: 8-byte packets, 16-bit fields) ─────────

/// 8-byte read packet: [type u16 LE][addr u16 LE][0 0 0 0]
pub fn make_read_packet(command: u16, address: u16) -> Vec<u8> {
    make_write_packet(command, address, 0)
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
/// The command code uses the address field (PROTOCOL.md, SYS_COMMAND).
pub fn make_sys_cmd_packet(sys_cmd: u16, value: i32) -> Vec<u8> {
    make_write_packet(CMD_SYS_COMMAND, sys_cmd, value)
}

// ── Time helpers ──────────────────────────────────────────────────────────────

/// Milliseconds since the Unix epoch, advanced by a monotonic clock.
///
/// Anchored to the wall clock once at first use, so values still read as
/// calendar time in exports, but a system clock step (NTP, manual change)
/// cannot reorder samples or break staleness and timeout checks.
pub fn now_ms() -> f64 {
    static ANCHOR: OnceLock<(Instant, f64)> = OnceLock::new();
    let (start, wall) = ANCHOR.get_or_init(|| {
        let wall = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64()
            * 1000.;
        (Instant::now(), wall)
    });
    wall + start.elapsed().as_secs_f64() * 1000.
}

// ── Log helpers ───────────────────────────────────────────────────────────────

pub fn emit_log(app: &AppHandle, level: LogLevel, category: LogCategory, message: String) {
    // Errors always reach the user; everything else honours the category filter.
    if !matches!(level, LogLevel::Error) && !app.state().log_filter.category_enabled(&category) {
        return;
    }
    app.emit(Event::Log(LogEntry {
        level,
        category,
        message,
        timestamp: now_ms(),
        packet_data: None,
    }));
}

fn hex_dump(data: &[u8]) -> String {
    data.iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(" ")
}

fn command_name(cmd: u16) -> &'static str {
    match cmd {
        CMD_SYS_COMMAND => "SYS_COMMAND",
        CMD_READ_REGISTER => "READ_REGISTER",
        CMD_WRITE_REGISTER => "WRITE_REGISTER",
        CMD_READ_PARAMETER => "READ_PARAMETER",
        CMD_WRITE_PARAMETER => "WRITE_PARAMETER",
        CMD_TAKE_CONTROL => "TAKE_CONTROL",
        CMD_READ_SYS_REG => "READ_SYS_REG",
        CMD_WRITE_SYS_REG => "WRITE_SYS_REG",
        _ => "USER_CMD",
    }
}

fn analyze_tx_packet(data: &[u8]) -> String {
    if data.len() < 8 {
        return "Invalid TX packet".to_string();
    }
    let cmd = u16::from_le_bytes([data[0], data[1]]);
    let addr = u16::from_le_bytes([data[2], data[3]]);
    let val = i32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    format!(
        "Type={} ({}) | Addr={} (0x{:04X}) | Value={}",
        cmd,
        command_name(cmd),
        addr,
        addr,
        val
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
        -4 => "ADDRESS_OUT_OF_RANGE",
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
/// This exists because the write arms used to discard the status altogether
/// and report every write as accepted. A write the device refused was shown as
/// a completed one, which is the exact failure the write path is built to
/// prevent: nothing on screen distinguished a value that reached the register
/// from one that was rejected.
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
    if !app.state().log_filter.packet_enabled() {
        return;
    }
    let analysis = if direction == "TX" {
        analyze_tx_packet(data)
    } else {
        analyze_rx_packet(data)
    };
    app.emit(Event::Log(LogEntry {
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
    }));
}

// ── Response correlation ──────────────────────────────────────────────────────

/// True when `data` is a plausible response to `req`.
///
/// A successful response echoes the request's operation code as its status
/// (PROTOCOL.md, Status Codes); failures are negative. Checking it rejects a
/// late reply to an earlier request of another kind — for example a register
/// read answering a Command, which would otherwise mark the Command
/// acknowledged.
///
/// Register and parameter traffic also echoes the address. A mismatch means a
/// response left in the stream by an earlier request that timed out; accepting
/// it would silently attribute one register's value to another and shift every
/// subsequent read by one. `CMD_TAKE_CONTROL` and `CMD_SYS_COMMAND` carry no
/// meaningful address echo, so only their status is checked.
fn response_matches(req: &DeviceRequest, data: &[u8]) -> bool {
    if data.len() < 8 {
        return false;
    }
    let status = i16::from_le_bytes([data[0], data[1]]);
    let known = req.command <= CMD_WRITE_SYS_REG;
    if known && status >= 0 && status != req.command as i16 {
        return false;
    }
    match req.command {
        CMD_READ_REGISTER | CMD_WRITE_REGISTER | CMD_READ_PARAMETER | CMD_WRITE_PARAMETER
        | CMD_READ_SYS_REG | CMD_WRITE_SYS_REG => {
            u16::from_le_bytes([data[2], data[3]]) == req.address
        }
        _ => true,
    }
}

fn log_discarded_response(app: &AppHandle, req: &DeviceRequest, data: &[u8]) {
    let (status, got) = if data.len() >= 8 {
        (
            i16::from_le_bytes([data[0], data[1]]).to_string(),
            u16::from_le_bytes([data[2], data[3]]).to_string(),
        )
    } else {
        ("<short>".to_string(), "<short>".to_string())
    };
    emit_log(
        app,
        LogLevel::Warning,
        LogCategory::Connection,
        format!(
            "Discarded out-of-order response (status={}, addr={}; expected {} at {}) — resynchronising",
            status,
            got,
            command_name(req.command),
            req.address
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

fn write_ack(req: &DeviceRequest, status: i16, timestamp: f64) -> Event {
    Event::WriteAck(WriteAck {
        command: req.command,
        address: req.address,
        status,
        valid: status_ok(status),
        timestamp,
    })
}

fn reading(
    req: &DeviceRequest,
    address: u16,
    value: i32,
    timestamp: f64,
    prefix: &str,
) -> RegisterData {
    RegisterData {
        address,
        name: req
            .name
            .clone()
            .unwrap_or_else(|| format!("{prefix}_{address}")),
        value,
        valid: true,
        timestamp,
    }
}

fn process_response(data: &[u8; 8], req: &DeviceRequest, app: &AppHandle) {
    // Protocol v0.2.2: 8-byte response: status(i16 LE) + address(u16 LE) + value(i32 LE)
    let status = i16::from_le_bytes([data[0], data[1]]);
    let address = u16::from_le_bytes([data[2], data[3]]);
    let value = i32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    let ts = now_ms();
    let refused = |category: LogCategory, what: String| {
        emit_log(
            app,
            LogLevel::Error,
            category,
            format!(
                "{what} refused by the device: status={} ({})",
                status,
                status_name(status)
            ),
        )
    };

    match req.command {
        CMD_READ_REGISTER => app.emit(Event::Register(reading(req, address, value, ts, "addr"))),
        CMD_READ_PARAMETER => app.emit(Event::Parameter(reading(req, address, value, ts, "param"))),
        CMD_READ_SYS_REG => app.emit(Event::SysRegister(reading(
            req, address, value, ts, "sysreg",
        ))),
        CMD_WRITE_REGISTER | CMD_WRITE_PARAMETER | CMD_WRITE_SYS_REG => {
            if !status_ok(status) {
                let (category, space) = match req.command {
                    CMD_WRITE_REGISTER => (LogCategory::Register, "register"),
                    CMD_WRITE_PARAMETER => (LogCategory::Parameter, "parameter"),
                    _ => (LogCategory::Register, "system register"),
                };
                refused(
                    category,
                    format!("Write to {space} {} (0x{:04X})", address, address),
                );
            }
            app.emit(write_ack(req, status, ts));
        }
        CMD_TAKE_CONTROL => {
            // Report the new CONTROL_INTERFACE (sys reg 2) so control state updates.
            app.emit(Event::SysRegister(RegisterData {
                address: 2,
                name: "CONTROL_INTERFACE".to_string(),
                value,
                valid: true,
                timestamp: ts,
            }));
            emit_log(
                app,
                LogLevel::Info,
                LogCategory::Connection,
                format!("Take Control acknowledged (control_state={})", value),
            );
        }
        _ => {
            // Library sys commands (READ_FLASH etc.) and every Profile Command
            // are sent as type 0 with their code in the address field; other
            // types are application-defined. Like the write arms, a refusal is
            // logged and the typed event (not the log) is what a caller waiting
            // on the outcome reads, so a refused Command cannot be read as sent.
            if !status_ok(status) {
                refused(LogCategory::Connection, format!("Command {}", req.address));
            }
            app.emit(Event::CommandResponse(CommandResponse {
                command: req.address,
                value,
                status,
                valid: status_ok(status),
                timestamp: ts,
            }));
        }
    }
}

/// Bookkeeping shared by both transports after each request completes.
/// Returns false when the connection should be abandoned.
fn settle(
    app: &AppHandle,
    req: &DeviceRequest,
    outcome: ResponseOutcome,
    consecutive_timeouts: &mut u32,
    send_time: Instant,
    interface: &str,
    destination: &str,
) -> bool {
    match outcome {
        ResponseOutcome::Received(buf) => {
            *consecutive_timeouts = 0;
            let response_time = send_time.elapsed().as_millis() as u64;
            emit_packet_log(app, "RX", &buf, interface, destination, Some(response_time));
            process_response(&buf, req, app);
            true
        }
        ResponseOutcome::Fatal(e) => {
            emit_log(app, LogLevel::Error, LogCategory::Connection, e);
            false
        }
        ResponseOutcome::Timeout => {
            *consecutive_timeouts += 1;
            emit_log(
                app,
                LogLevel::Error,
                LogCategory::Register,
                format!(
                    "Request timeout (addr={}, cmd={}) [{}/{}]",
                    req.address, req.command, consecutive_timeouts, TIMEOUT_THRESHOLD
                ),
            );
            if *consecutive_timeouts >= TIMEOUT_THRESHOLD {
                emit_log(
                    app,
                    LogLevel::Error,
                    LogCategory::Connection,
                    "Device unresponsive — connection lost".to_string(),
                );
                return false;
            }
            true
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
    destination: String,
) -> bool {
    let mut consecutive_timeouts: u32 = 0;
    // Bytes of a response frame received so far; survives request timeouts.
    let mut frame = [0u8; 8];
    let mut filled = 0usize;

    while let Some(req) = rx.recv().await {
        let send_time = Instant::now();
        if let Err(e) = stream.write_all(&req.packet).await {
            emit_log(
                &app,
                LogLevel::Error,
                LogCategory::Connection,
                format!("TCP write error: {}", e),
            );
            return true;
        }
        emit_packet_log(&app, "TX", &req.packet, "TCP", &destination, None);

        // Read 8-byte responses (protocol v0.2.2) until one correlates with
        // this request or the deadline passes. Discarding stale responses
        // re-syncs the stream after a timeout instead of shifting every
        // later read by one.
        //
        // `read` is cancel-safe and `read_exact` is not: a deadline that
        // fires mid-frame would drop the bytes already received and
        // misalign every later frame. Partial bytes stay in `frame` and
        // complete on a later read, even after this request timed out.
        let deadline = tokio::time::Instant::now() + REQUEST_TIMEOUT;
        let outcome = loop {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                break ResponseOutcome::Timeout;
            }
            match timeout(remaining, stream.read(&mut frame[filled..])).await {
                Ok(Ok(0)) => {
                    break ResponseOutcome::Fatal("TCP connection closed by the device".to_string())
                }
                Ok(Ok(n)) => {
                    filled += n;
                    if filled < frame.len() {
                        continue;
                    }
                    filled = 0;
                    if response_matches(&req, &frame) {
                        break ResponseOutcome::Received(frame);
                    }
                    log_discarded_response(&app, &req, &frame);
                }
                Ok(Err(e)) => break ResponseOutcome::Fatal(format!("TCP read error: {}", e)),
                Err(_) => break ResponseOutcome::Timeout,
            }
        };
        if !settle(
            &app,
            &req,
            outcome,
            &mut consecutive_timeouts,
            send_time,
            "TCP",
            &destination,
        ) {
            return true;
        }
    }
    false // channel closed — intentional disconnect
}

// ── UDP background task ───────────────────────────────────────────────────────

/// Runs the UDP communicator loop on a socket `connect`ed to the Device, so
/// the kernel only delivers datagrams from the Device's address and port.
/// Returns `true` if the exit was caused by a device error or timeout (caller should reconnect),
/// or `false` if the channel was closed intentionally (user disconnect).
pub async fn run_udp_communicator(
    socket: UdpSocket,
    mut rx: mpsc::Receiver<DeviceRequest>,
    app: AppHandle,
    destination: String,
) -> bool {
    let mut consecutive_timeouts: u32 = 0;

    while let Some(req) = rx.recv().await {
        let send_time = Instant::now();
        if let Err(e) = socket.send(&req.packet).await {
            emit_log(
                &app,
                LogLevel::Error,
                LogCategory::Connection,
                format!("UDP send error: {}", e),
            );
            return true;
        }
        emit_packet_log(&app, "TX", &req.packet, "UDP", &destination, None);

        // Wait for a datagram that correlates with this request. A late reply
        // to a previously timed-out request would otherwise be accepted here
        // and mis-attributed.
        let deadline = tokio::time::Instant::now() + REQUEST_TIMEOUT;
        let mut buf = [0u8; 64];
        let outcome = loop {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                break ResponseOutcome::Timeout;
            }
            match timeout(remaining, socket.recv(&mut buf)).await {
                Ok(Ok(n)) if n < 8 => {
                    // One malformed datagram is not a lost Device.
                    emit_log(
                        &app,
                        LogLevel::Warning,
                        LogCategory::Connection,
                        format!("Ignored short UDP response: {} bytes", n),
                    );
                }
                Ok(Ok(_)) => {
                    let mut out = [0u8; 8];
                    out.copy_from_slice(&buf[..8]);
                    if response_matches(&req, &out) {
                        break ResponseOutcome::Received(out);
                    }
                    log_discarded_response(&app, &req, &out);
                }
                // Windows reports an ICMP port-unreachable for an earlier
                // datagram as a reset on the next receive; the timeout already
                // covers an absent Device.
                Ok(Err(e)) if e.kind() == std::io::ErrorKind::ConnectionReset => {}
                Ok(Err(e)) => break ResponseOutcome::Fatal(format!("UDP error: {}", e)),
                Err(_) => break ResponseOutcome::Timeout,
            }
        };
        if !settle(
            &app,
            &req,
            outcome,
            &mut consecutive_timeouts,
            send_time,
            "UDP",
            &destination,
        ) {
            return true;
        }
    }
    false // channel closed — intentional disconnect
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
            let status = command as i16;
            assert!(
                response_matches(&r, &response(status, 10, 0)),
                "cmd {command} same addr"
            );
            assert!(
                !response_matches(&r, &response(status, 11, 0)),
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
            let status = if command == 200 { 0 } else { command as i16 };
            assert!(
                response_matches(&r, &response(status, 999, 1)),
                "cmd {command}"
            );
        }
    }

    #[test]
    fn a_response_for_another_operation_is_rejected() {
        // A late register-read reply (status 1) must not acknowledge a Command.
        assert!(!response_matches(
            &req(CMD_SYS_COMMAND, 14),
            &response(1, 14, 0)
        ));
        assert!(!response_matches(
            &req(CMD_WRITE_REGISTER, 3),
            &response(1, 3, 0)
        ));
        // Errors carry no operation code and still answer the request.
        assert!(response_matches(
            &req(CMD_SYS_COMMAND, 14),
            &response(-1, 14, 0)
        ));
        assert!(response_matches(
            &req(CMD_WRITE_REGISTER, 3),
            &response(-5, 3, 0)
        ));
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
