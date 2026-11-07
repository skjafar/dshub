use crate::runtime::{AppHandle, Event};
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::{TcpStream, UdpSocket};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio::time::timeout;

use crate::communicator::{
    emit_log, make_control_packet, make_read_packet, make_sys_cmd_packet, make_write_packet,
    run_tcp_communicator, run_udp_communicator, DeviceRequest,
};
use crate::types::*;

/// Upper bound for opening a transport, including the UDP liveness probe.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(4);
const RECONNECT_MIN_DELAY: Duration = Duration::from_secs(1);
const RECONNECT_MAX_DELAY: Duration = Duration::from_secs(10);
/// Capacity of the per-connection request queue (matches the original MAX_QUEUE_SIZE).
const QUEUE_CAPACITY: usize = 100;

// ── Reconnect parameters ──────────────────────────────────────────────────────

#[derive(Clone)]
pub struct ReconnectParams {
    pub ip: String,
    pub port: u16,
    pub interface_type: InterfaceType,
    pub device_name: Option<String>,
}

// ── Managed application state ─────────────────────────────────────────────────

/// Token-bucket limiter for outbound device requests.
///
/// Backs the user-facing `requestRateLimit` setting, which previously existed in
/// the settings model but was never enforced anywhere.
pub struct RateLimiter {
    /// (last refill instant, available tokens)
    bucket: tokio::sync::Mutex<(tokio::time::Instant, f64)>,
}

impl RateLimiter {
    fn new() -> Self {
        RateLimiter {
            bucket: tokio::sync::Mutex::new((tokio::time::Instant::now(), 0.0)),
        }
    }

    /// Waits until one request may be sent. A `limit` of 0 disables limiting.
    pub async fn acquire(&self, limit: u32) {
        if limit == 0 {
            return;
        }
        let rate = limit as f64;
        let sleep_for = {
            let mut bucket = self.bucket.lock().await;
            let (last, tokens) = *bucket;
            let now = tokio::time::Instant::now();
            // Refill, capped at one second's worth so an idle period cannot bank
            // an unbounded burst.
            let refilled = (tokens + now.duration_since(last).as_secs_f64() * rate).min(rate);
            if refilled >= 1.0 {
                *bucket = (now, refilled - 1.0);
                None
            } else {
                // Charge the token now and sleep off the deficit.
                let deficit = (1.0 - refilled) / rate;
                *bucket = (now, 0.0);
                Some(Duration::from_secs_f64(deficit))
            }
        };
        if let Some(d) = sleep_for {
            tokio::time::sleep(d).await;
        }
    }
}

pub struct AppState {
    /// Sender half of the communicator channel; None when not connected
    pub communicator_tx: tokio::sync::Mutex<Option<mpsc::Sender<DeviceRequest>>>,
    /// Liveness heartbeat for the current connection; aborted on disconnect.
    pub heartbeat: tokio::sync::Mutex<Option<JoinHandle<()>>>,
    /// Current device connection info (for takeControl to know interface type)
    pub connection: tokio::sync::Mutex<Option<DeviceConnection>>,
    /// Lock-free log filter, read by the communicator on every request
    pub log_filter: Arc<LogFilter>,
    /// Enforces the user's `requestRateLimit` setting
    pub rate_limiter: RateLimiter,
    /// Prevents concurrent scans (shared as Arc for spawned tasks)
    pub is_scanning: Arc<tokio::sync::Mutex<bool>>,
    /// Stop token for the *current* connection's supervisor.
    ///
    /// Replaced wholesale on every connect rather than cleared, so a supervisor
    /// belonging to a previous connection can never be re-enabled and race the
    /// new one for `communicator_tx`.
    pub connection_token: tokio::sync::Mutex<Arc<AtomicBool>>,
    /// Per-address poll subscriber bookkeeping — which widgets want which
    /// addresses, at what rate. Survives every connect, disconnect and
    /// reconnect; only an explicit unsubscribe removes an entry.
    pub poll_subscriptions: tokio::sync::Mutex<crate::poll::PollSubscriptions>,
    /// Live poll tasks for `poll_subscriptions`' current entries, aborted on
    /// disconnect and respawned by `poll::resume_poll_subscriptions`.
    pub poll_tasks: tokio::sync::Mutex<crate::poll::PollTasks>,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            communicator_tx: tokio::sync::Mutex::new(None),
            heartbeat: tokio::sync::Mutex::new(None),
            connection: tokio::sync::Mutex::new(None),
            log_filter: Arc::new(LogFilter::new()),
            rate_limiter: RateLimiter::new(),
            is_scanning: Arc::new(tokio::sync::Mutex::new(false)),
            connection_token: tokio::sync::Mutex::new(Arc::new(AtomicBool::new(true))),
            poll_subscriptions: tokio::sync::Mutex::new(crate::poll::PollSubscriptions::new()),
            poll_tasks: tokio::sync::Mutex::new(Default::default()),
        }
    }
}

// ── Connection lifecycle ──────────────────────────────────────────────────────

/// An opened, verified link to the Device.
enum Transport {
    Tcp(TcpStream),
    /// A socket `connect`ed to the Device's address.
    Udp(UdpSocket),
}

async fn disconnect_internal(state: &AppState) {
    if let Some(handle) = state.heartbeat.lock().await.take() {
        handle.abort();
    }

    // Abort all active address-poll tasks. Their subscriber bookkeeping
    // (`poll_subscriptions`) is untouched, so `resume_poll_subscriptions` can
    // respawn every entry once a connection exists again.
    let mut polls = state.poll_tasks.lock().await;
    for (_, (handle, _)) in polls.drain() {
        handle.abort();
    }
    drop(polls);

    // Drop the main sender → background task's rx will return None → task exits
    *state.communicator_tx.lock().await = None;
    *state.connection.lock().await = None;
}

/// Resolves `host:port`; works for IPv4, IPv6 literals and host names.
async fn resolve(host: &str, port: u16) -> Result<SocketAddr, String> {
    tokio::net::lookup_host((host, port))
        .await
        .map_err(|e| format!("Cannot resolve {host}: {e}"))?
        .next()
        .ok_or_else(|| format!("Cannot resolve {host}"))
}

/// Confirms a Device answers on a fresh UDP socket. UDP has no handshake, so
/// without this a wrong address would be reported as connected.
async fn probe_udp(socket: &UdpSocket) -> Result<(), String> {
    let packet = make_read_packet(CMD_READ_SYS_REG, 2);
    let mut buf = [0u8; 64];
    for _ in 0..3 {
        socket
            .send(&packet)
            .await
            .map_err(|e| format!("UDP send failed: {e}"))?;
        let deadline = tokio::time::Instant::now() + Duration::from_millis(800);
        loop {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            match timeout(remaining, socket.recv(&mut buf)).await {
                Ok(Ok(n)) if n >= 8 && buf[2..4] == 2u16.to_le_bytes() => return Ok(()),
                Ok(Ok(_)) => continue,
                Ok(Err(e)) if e.kind() == std::io::ErrorKind::ConnectionReset => break,
                Ok(Err(e)) => return Err(format!("UDP receive failed: {e}")),
                Err(_) => break,
            }
        }
    }
    Err("No response from the device over UDP".into())
}

async fn open(params: &ReconnectParams) -> Result<Transport, String> {
    let open = async {
        let remote = resolve(&params.ip, params.port).await?;
        match params.interface_type {
            InterfaceType::Tcp => {
                let stream = TcpStream::connect(remote)
                    .await
                    .map_err(|e| format!("TCP connect failed: {e}"))?;
                // Small stop-and-wait frames must not wait on Nagle/delayed-ACK.
                stream
                    .set_nodelay(true)
                    .map_err(|e| format!("TCP configuration failed: {e}"))?;
                Ok(Transport::Tcp(stream))
            }
            InterfaceType::Udp => {
                let local = if remote.is_ipv6() {
                    "[::]:0"
                } else {
                    "0.0.0.0:0"
                };
                let socket = UdpSocket::bind(local)
                    .await
                    .map_err(|e| format!("UDP bind failed: {e}"))?;
                socket
                    .connect(remote)
                    .await
                    .map_err(|e| format!("UDP connect failed: {e}"))?;
                probe_udp(&socket).await?;
                Ok(Transport::Udp(socket))
            }
        }
    };
    timeout(CONNECT_TIMEOUT, open)
        .await
        .map_err(|_| "Connection timed out".to_string())?
}

/// Publishes a freshly opened connection: request queue, heartbeat, resumed
/// subscriptions and the connected status. Returns `None` without publishing
/// anything when `stop` was set meanwhile — a newer connect or a disconnect
/// owns the state now.
async fn activate(
    app: &AppHandle,
    params: &ReconnectParams,
    stop: &AtomicBool,
) -> Option<mpsc::Receiver<DeviceRequest>> {
    let state = app.state();
    let (tx, rx) = mpsc::channel::<DeviceRequest>(QUEUE_CAPACITY);
    let connection = DeviceConnection {
        ip: params.ip.clone(),
        port: params.port,
        interface_type: params.interface_type.clone(),
        connected: true,
        reconnecting: false,
        control_state: 0,
        device_name: params.device_name.clone(),
    };
    {
        // `connect_device` and `disconnect_device` set the token before they
        // take this lock, so checking it here cannot miss one.
        let mut sender = state.communicator_tx.lock().await;
        if stop.load(Ordering::Acquire) {
            return None;
        }
        *sender = Some(tx.clone());
        *state.connection.lock().await = Some(connection.clone());
    }
    *state.heartbeat.lock().await = Some(spawn_heartbeat(tx.clone()));
    crate::poll::resume_poll_subscriptions(app, &tx).await;
    app.emit(Event::ConnectionStatus(connection));
    emit_log(
        app,
        LogLevel::Info,
        LogCategory::Connection,
        format!(
            "Connected via {:?} to {}:{}",
            params.interface_type, params.ip, params.port
        ),
    );
    Some(rx)
}

async fn communicate(
    transport: Transport,
    rx: mpsc::Receiver<DeviceRequest>,
    app: &AppHandle,
    params: &ReconnectParams,
) -> bool {
    let destination = format!("{}:{}", params.ip, params.port);
    match transport {
        Transport::Tcp(stream) => run_tcp_communicator(stream, rx, app.clone(), destination).await,
        Transport::Udp(socket) => run_udp_communicator(socket, rx, app.clone(), destination).await,
    }
}

fn status(params: &ReconnectParams, reconnecting: bool) -> DeviceConnection {
    DeviceConnection {
        ip: params.ip.clone(),
        port: params.port,
        interface_type: params.interface_type.clone(),
        connected: false,
        reconnecting,
        control_state: 0,
        device_name: params.device_name.clone(),
    }
}

/// Up to ±20 % of `delay`, so several hosts do not retry in lockstep.
fn jittered(delay: Duration) -> Duration {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.subsec_nanos());
    let factor = 0.8 + (nanos % 1000) as f64 / 2500.;
    delay.mul_f64(factor)
}

/// Runs a connection until it is stopped, reconnecting with exponential
/// backoff after unexpected loss. A stopped supervisor touches no shared state
/// and emits nothing: whoever stopped it owns the connection state now.
async fn supervise(
    app: AppHandle,
    params: ReconnectParams,
    stop: Arc<AtomicBool>,
    mut transport: Transport,
    mut rx: mpsc::Receiver<DeviceRequest>,
) {
    loop {
        let lost = communicate(transport, rx, &app, &params).await;
        if stop.load(Ordering::Acquire) {
            return;
        }
        disconnect_internal(app.state()).await;
        if !lost {
            app.emit(Event::ConnectionStatus(status(&params, false)));
            return;
        }
        app.emit(Event::ConnectionStatus(status(&params, true)));

        let mut delay = RECONNECT_MIN_DELAY;
        (transport, rx) = loop {
            tokio::time::sleep(jittered(delay)).await;
            if stop.load(Ordering::Acquire) {
                return;
            }
            emit_log(
                &app,
                LogLevel::Info,
                LogCategory::Connection,
                format!("Reconnecting to {}:{}…", params.ip, params.port),
            );
            match open(&params).await {
                Ok(transport) => match activate(&app, &params, &stop).await {
                    Some(rx) => break (transport, rx),
                    None => return,
                },
                Err(e) => {
                    emit_log(
                        &app,
                        LogLevel::Warning,
                        LogCategory::Connection,
                        format!("Reconnect failed: {e}"),
                    );
                    delay = (delay * 2).min(RECONNECT_MAX_DELAY);
                }
            }
        };
    }
}

/// Spawn a heartbeat task that reads CONTROL_INTERFACE (sys reg addr 2) every
/// `HEARTBEAT_INTERVAL`. This keeps the communicator's consecutive-timeout counter
/// ticking even when no panel is actively polling, so a device disconnect is detected
/// promptly. It deliberately bypasses the rate limiter: liveness detection must not
/// be throttled by the user's request budget. The task exits silently when the
/// channel is closed.
fn spawn_heartbeat(tx: mpsc::Sender<DeviceRequest>) -> JoinHandle<()> {
    const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(1);
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(HEARTBEAT_INTERVAL);
        // Never replay missed ticks: the default Burst behaviour would fire them
        // back-to-back and flood the request queue after any device stall.
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            let req = DeviceRequest {
                packet: make_read_packet(CMD_READ_SYS_REG, 2),
                command: CMD_READ_SYS_REG,
                address: 2,
                name: Some("CONTROL_INTERFACE".into()),
            };
            if tx.send(req).await.is_err() {
                break; // channel closed — exit silently
            }
        }
    })
}

/// Enqueue a request; awaits if the channel is at capacity (backpressure).
///
/// The sender is cloned and the mutex released *before* awaiting the send. Holding
/// the guard across the await would block every other command — including
/// `disconnect_device` — whenever the channel filled up.
async fn queue_request(state: &AppState, req: DeviceRequest) -> Result<(), String> {
    let tx = {
        let guard = state.communicator_tx.lock().await;
        guard.as_ref().cloned().ok_or("Not connected to device")?
    };

    state
        .rate_limiter
        .acquire(state.log_filter.request_rate_limit())
        .await;

    tx.send(req)
        .await
        .map_err(|_| "Communicator channel closed".to_string())
}

// ── Operations ────────────────────────────────────────────────────────────────

pub async fn start_scan(app: AppHandle, state: &AppState) -> Result<(), String> {
    {
        let mut scanning = state.is_scanning.lock().await;
        if *scanning {
            return Ok(());
        }
        *scanning = true;
    }

    let scanning_flag = Arc::clone(&state.is_scanning);
    tokio::spawn(async move {
        crate::scanner::scan_devices(app).await;
        *scanning_flag.lock().await = false;
    });

    Ok(())
}

/// Connects to `ip:port`. The port comes from the Device's discovery response
/// or the user's explicit address; [`DEFAULT_TCP_PORT`]/[`DEFAULT_UDP_PORT`]
/// apply only when neither is known. Returns once the connection is verified
/// and published; a background supervisor then keeps it alive.
pub async fn connect_device(
    ip: String,
    port: u16,
    interface_type: InterfaceType,
    device_name: Option<String>,
    app: AppHandle,
    state: &AppState,
) -> Result<(), String> {
    // Retire the previous connection's stop token and mint a fresh one for this
    // attempt. Replacing the Arc (rather than setting the old flag back to false)
    // means a supervisor still sleeping from the previous connection can never
    // wake up "allowed" and race this connection for `communicator_tx`.
    let stop = {
        let mut guard = state.connection_token.lock().await;
        guard.store(true, Ordering::Release);
        let fresh = Arc::new(AtomicBool::new(false));
        *guard = Arc::clone(&fresh);
        fresh
    };

    disconnect_internal(state).await;

    let params = ReconnectParams {
        ip,
        port,
        interface_type,
        device_name,
    };
    let transport = open(&params).await?;
    let rx = activate(&app, &params, &stop)
        .await
        .ok_or("Connection was cancelled")?;
    tokio::spawn(supervise(app, params, stop, transport, rx));
    Ok(())
}

pub async fn disconnect_device(state: &AppState) -> Result<(), String> {
    // Stop the current connection's supervisor before dropping the channel
    state
        .connection_token
        .lock()
        .await
        .store(true, Ordering::Release);
    disconnect_internal(state).await;
    Ok(())
}

pub async fn take_control(state: &AppState) -> Result<(), String> {
    let interface = {
        let conn = state.connection.lock().await;
        conn.as_ref().ok_or("Not connected")?.interface_type.clone()
    };

    let value = match interface {
        InterfaceType::Tcp => 1u32, // TCP_DATASTREAM
        InterfaceType::Udp => 2u32, // UDP_DATASTREAM
    };

    queue_request(
        state,
        DeviceRequest {
            packet: make_control_packet(value),
            command: CMD_TAKE_CONTROL,
            address: 0,
            name: Some("TAKE_CONTROL".into()),
        },
    )
    .await
}

async fn read(state: &AppState, command: u16, address: u16, name: String) -> Result<(), String> {
    queue_request(
        state,
        DeviceRequest {
            packet: make_read_packet(command, address),
            command,
            address,
            name: Some(name),
        },
    )
    .await
}

async fn write(state: &AppState, command: u16, address: u16, value: i32) -> Result<(), String> {
    queue_request(
        state,
        DeviceRequest {
            packet: make_write_packet(command, address, value),
            command,
            address,
            name: None,
        },
    )
    .await
}

pub async fn read_register(address: u16, name: String, state: &AppState) -> Result<(), String> {
    read(state, CMD_READ_REGISTER, address, name).await
}

pub async fn write_register(address: u16, value: i32, state: &AppState) -> Result<(), String> {
    write(state, CMD_WRITE_REGISTER, address, value).await
}

pub async fn read_parameter(address: u16, name: String, state: &AppState) -> Result<(), String> {
    read(state, CMD_READ_PARAMETER, address, name).await
}

pub async fn write_parameter(address: u16, value: i32, state: &AppState) -> Result<(), String> {
    write(state, CMD_WRITE_PARAMETER, address, value).await
}

pub async fn read_system_register(
    address: u16,
    name: String,
    state: &AppState,
) -> Result<(), String> {
    read(state, CMD_READ_SYS_REG, address, name).await
}

/// Send a system command (type=0, address=command code): library commands
/// 65000–65002 or a Profile's application commands 0–64999.
pub async fn send_sys_command(sys_cmd: u16, value: i32, state: &AppState) -> Result<(), String> {
    queue_request(
        state,
        DeviceRequest {
            packet: make_sys_cmd_packet(sys_cmd, value),
            command: CMD_SYS_COMMAND,
            address: sys_cmd,
            name: Some(format!("SYS_CMD_{}", sys_cmd)),
        },
    )
    .await
}

pub async fn update_log_settings(settings: LogSettings, state: &AppState) -> Result<(), String> {
    state.log_filter.update(&settings);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn heartbeat_sends_its_first_request_without_waiting_for_an_interval() {
        let (tx, mut rx) = mpsc::channel::<DeviceRequest>(10);
        let _handle = spawn_heartbeat(tx);

        let first = tokio::time::timeout(Duration::from_millis(200), rx.recv())
            .await
            .expect("heartbeat did not send its first request promptly — is the first tick still being skipped?")
            .expect("heartbeat's channel closed before sending anything");

        assert_eq!(first.command, CMD_READ_SYS_REG);
        assert_eq!(first.address, 2);
        assert_eq!(first.name.as_deref(), Some("CONTROL_INTERFACE"));
    }

    #[test]
    fn reconnect_jitter_stays_within_twenty_percent() {
        let d = jittered(Duration::from_secs(10));
        assert!(d >= Duration::from_secs(8) && d <= Duration::from_secs(12));
    }

    #[tokio::test]
    async fn udp_connect_fails_when_no_device_answers() {
        // Bind a silent peer so the probe has a reachable but mute target.
        let peer = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let params = ReconnectParams {
            ip: "127.0.0.1".into(),
            port: peer.local_addr().unwrap().port(),
            interface_type: InterfaceType::Udp,
            device_name: None,
        };
        assert!(open(&params).await.is_err());
    }
}
