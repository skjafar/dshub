use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::{TcpStream, UdpSocket};
use tokio::sync::mpsc;
use tauri::async_runtime::JoinHandle;

use crate::communicator::{
    emit_log, make_control_packet, make_read_packet, make_sys_cmd_packet,
    make_user_cmd_packet, make_write_packet,
    run_tcp_communicator, run_udp_communicator, DeviceRequest,
};
use crate::types::*;

// ── Reconnect parameters ──────────────────────────────────────────────────────

#[derive(Clone)]
pub struct ReconnectParams {
    pub ip: String,
    pub port: u16,
    pub interface_type: InterfaceType,
    pub device_name: Option<String>,
}

/// Enough info to resume a plot's polling task after a reconnect.
#[derive(Clone)]
pub struct ActivePlotSpec {
    pub address: u16,
    pub command: u16,
    pub poll_interval: u64,
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
    async fn acquire(&self, limit: u32) {
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
                Some(std::time::Duration::from_secs_f64(deficit))
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
    /// Active plot task handles keyed by register name
    pub plot_tasks: tokio::sync::Mutex<HashMap<String, JoinHandle<()>>>,
    /// Specs for currently-plotted registers, kept across reconnects so their
    /// polling tasks (aborted when the communicator drops) can be respawned
    /// once a new connection is established.
    pub active_plots: tokio::sync::Mutex<HashMap<String, ActivePlotSpec>>,
    /// Current device connection info (for takeControl to know interface type)
    pub connection: tokio::sync::Mutex<Option<DeviceConnection>>,
    /// Lock-free log filter, read by the communicator on every request
    pub log_filter: Arc<LogFilter>,
    /// Enforces the user's `requestRateLimit` setting
    pub rate_limiter: RateLimiter,
    /// Prevents concurrent scans (shared as Arc for spawned tasks)
    pub is_scanning: Arc<tokio::sync::Mutex<bool>>,
    /// Last directory used for saving files
    pub last_save_dir: tokio::sync::Mutex<Option<std::path::PathBuf>>,
    /// Stop token for the *current* connection's reconnect loop.
    ///
    /// Replaced wholesale on every connect rather than cleared, so a reconnect
    /// loop belonging to a previous connection can never be re-enabled and race
    /// the new one for `communicator_tx`.
    pub connection_token: tokio::sync::Mutex<Arc<AtomicBool>>,
    /// Parameters of the last successful connection, used by the reconnect loop
    pub reconnect_params: tokio::sync::Mutex<Option<ReconnectParams>>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            communicator_tx: tokio::sync::Mutex::new(None),
            plot_tasks: tokio::sync::Mutex::new(HashMap::new()),
            active_plots: tokio::sync::Mutex::new(HashMap::new()),
            connection: tokio::sync::Mutex::new(None),
            log_filter: Arc::new(LogFilter::new()),
            rate_limiter: RateLimiter::new(),
            is_scanning: Arc::new(tokio::sync::Mutex::new(false)),
            last_save_dir: tokio::sync::Mutex::new(None),
            connection_token: tokio::sync::Mutex::new(Arc::new(AtomicBool::new(true))),
            reconnect_params: tokio::sync::Mutex::new(None),
        }
    }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async fn disconnect_internal(state: &State<'_, AppState>) {
    // Abort all active plot tasks (drops their tx clones)
    let mut plots = state.plot_tasks.lock().await;
    for (_, handle) in plots.drain() {
        handle.abort();
    }
    drop(plots);

    // Drop the main sender → background task's rx will return None → task exits
    let mut tx = state.communicator_tx.lock().await;
    *tx = None;
}

/// Emits a `connectionStatus` event and logs the disconnect/reconnect state.
fn emit_connection_status(app: &AppHandle, mut conn: DeviceConnection, reconnecting: bool) {
    conn.connected = false;
    conn.reconnecting = reconnecting;
    if let Err(e) = app.emit("connectionStatus", &conn) {
        log::warn!("Failed to emit connectionStatus event: {}", e);
    }
}

/// Background reconnect loop: retries the connection every few seconds until the device
/// responds or the user explicitly disconnects (sets `stop` to true).
async fn reconnect_loop(app: AppHandle, params: ReconnectParams, stop: Arc<AtomicBool>) {
    const RETRY_DELAY: tokio::time::Duration = tokio::time::Duration::from_secs(3);

    loop {
        if stop.load(Ordering::Relaxed) { break; }

        tokio::time::sleep(RETRY_DELAY).await;

        if stop.load(Ordering::Relaxed) { break; }

        emit_log(
            &app,
            LogLevel::Info,
            LogCategory::Connection,
            format!("Reconnecting to {}:{}…", params.ip, params.port),
        );

        let (tx, rx) = mpsc::channel::<DeviceRequest>(100);

        let should_reconnect = match params.interface_type {
            InterfaceType::Tcp => {
                match TcpStream::connect(format!("{}:{}", params.ip, params.port)).await {
                    Err(e) => {
                        emit_log(
                            &app,
                            LogLevel::Warning,
                            LogCategory::Connection,
                            format!("Reconnect failed: {}", e),
                        );
                        continue; // retry
                    }
                    Ok(stream) => {
                        let connection = DeviceConnection {
                            ip: params.ip.clone(),
                            port: params.port,
                            interface_type: InterfaceType::Tcp,
                            connected: true,
                            reconnecting: false,
                            control_state: 0,
                            device_name: params.device_name.clone(),
                        };

                        // Update AppState before signalling the frontend
                        let state = app.state::<AppState>();
                        let heartbeat_tx = tx.clone();
                        let plot_tx = tx.clone();
                        *state.communicator_tx.lock().await = Some(tx);
                        *state.connection.lock().await = Some(connection.clone());
                        let heartbeat = spawn_heartbeat(heartbeat_tx);
                        state.plot_tasks.lock().await.insert("__heartbeat__".into(), heartbeat);
                        resume_active_plots(&app, &plot_tx).await;

                        if let Err(e) = app.emit("connectionStatus", &connection) {
                            log::warn!("Failed to emit connectionStatus event: {}", e);
                        }
                        emit_log(
                            &app,
                            LogLevel::Info,
                            LogCategory::Connection,
                            format!("Reconnected via TCP to {}:{}", params.ip, params.port),
                        );

                        run_tcp_communicator(stream, rx, app.clone(), connection).await
                    }
                }
            }
            InterfaceType::Udp => {
                match UdpSocket::bind("0.0.0.0:0").await {
                    Err(e) => {
                        emit_log(
                            &app,
                            LogLevel::Warning,
                            LogCategory::Connection,
                            format!("Reconnect failed (UDP bind): {}", e),
                        );
                        continue; // retry
                    }
                    Ok(socket) => {
                        let connection = DeviceConnection {
                            ip: params.ip.clone(),
                            port: params.port,
                            interface_type: InterfaceType::Udp,
                            connected: true,
                            reconnecting: false,
                            control_state: 0,
                            device_name: params.device_name.clone(),
                        };

                        let state = app.state::<AppState>();
                        let heartbeat_tx = tx.clone();
                        let plot_tx = tx.clone();
                        *state.communicator_tx.lock().await = Some(tx);
                        *state.connection.lock().await = Some(connection.clone());
                        let heartbeat = spawn_heartbeat(heartbeat_tx);
                        state.plot_tasks.lock().await.insert("__heartbeat__".into(), heartbeat);
                        resume_active_plots(&app, &plot_tx).await;

                        if let Err(e) = app.emit("connectionStatus", &connection) {
                            log::warn!("Failed to emit connectionStatus event: {}", e);
                        }
                        emit_log(
                            &app,
                            LogLevel::Info,
                            LogCategory::Connection,
                            format!("Reconnected via UDP to {}:{}", params.ip, params.port),
                        );

                        let ip = params.ip.clone();
                        let port = params.port;
                        run_udp_communicator(socket, rx, app.clone(), connection, ip, port).await
                    }
                }
            }
        };

        // Communicator exited — clear state and decide what to do next
        {
            let state = app.state::<AppState>();
            *state.communicator_tx.lock().await = None;
            *state.connection.lock().await = None;
        }

        if should_reconnect && !stop.load(Ordering::Relaxed) {
            // Emit reconnecting state and loop again
            let conn = DeviceConnection {
                ip: params.ip.clone(),
                port: params.port,
                interface_type: params.interface_type.clone(),
                connected: false,
                reconnecting: true,
                control_state: 0,
                device_name: params.device_name.clone(),
            };
            if let Err(e) = app.emit("connectionStatus", &conn) {
                log::warn!("Failed to emit connectionStatus event: {}", e);
            }
        } else {
            // Intentional disconnect — emit final disconnected state and exit
            let conn = DeviceConnection {
                ip: params.ip.clone(),
                port: params.port,
                interface_type: params.interface_type.clone(),
                connected: false,
                reconnecting: false,
                control_state: 0,
                device_name: params.device_name.clone(),
            };
            if let Err(e) = app.emit("connectionStatus", &conn) {
                log::warn!("Failed to emit connectionStatus event: {}", e);
            }
            break;
        }
    }
}

/// Spawn a heartbeat task that reads CONTROL_INTERFACE (sys reg addr 2) every
/// `HEARTBEAT_INTERVAL` seconds. This keeps the communicator's consecutive-timeout counter
/// ticking even when no panel is actively polling, so a device disconnect is detected promptly.
/// The task exits silently when the channel is closed.
/// The returned handle should be stored in `plot_tasks` under `"__heartbeat__"` so that
/// `disconnect_internal` aborts it automatically.
fn spawn_heartbeat(tx: mpsc::Sender<DeviceRequest>) -> JoinHandle<()> {
    const HEARTBEAT_INTERVAL: std::time::Duration = std::time::Duration::from_secs(1);
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(HEARTBEAT_INTERVAL);
        // Never replay missed ticks: the default Burst behaviour would fire them
        // back-to-back and flood the request queue after any device stall.
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        ticker.tick().await; // skip the immediate first tick
        loop {
            ticker.tick().await;
            let req = DeviceRequest {
                packet: crate::communicator::make_read_packet(CMD_READ_SYS_REG, 2),
                command: CMD_READ_SYS_REG,
                address: 2,
                name: Some("CONTROL_INTERFACE".into()),
                emit_plot: false,
            };
            if tx.send(req).await.is_err() {
                break; // channel closed — exit silently
            }
        }
    })
}

/// Spawn a task that polls `address` via `command` every `interval_ms` and emits a
/// plotData event for each response. Exits silently once the communicator channel closes.
fn spawn_plot_task(
    tx: mpsc::Sender<DeviceRequest>,
    name: String,
    address: u16,
    command: u16,
    interval_ms: u64,
) -> JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_millis(interval_ms));
        // A plot polling faster than the device can answer must fall behind
        // gracefully, not accumulate ticks and burst them at the queue.
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            let req = DeviceRequest {
                packet: make_read_packet(command, address),
                command,
                address,
                name: Some(name.clone()),
                emit_plot: true,
            };
            if tx.send(req).await.is_err() {
                break; // communicator gone — exit silently
            }
        }
    })
}

/// Respawn polling tasks for every registered plot using the freshly (re)established
/// communicator channel. Called after both the initial connect and every successful
/// reconnect, so plots that were running before an unexpected disconnect keep going.
async fn resume_active_plots(app: &AppHandle, tx: &mpsc::Sender<DeviceRequest>) {
    let state = app.state::<AppState>();
    let specs: Vec<(String, ActivePlotSpec)> = state
        .active_plots
        .lock()
        .await
        .iter()
        .map(|(name, spec)| (name.clone(), spec.clone()))
        .collect();

    if specs.is_empty() {
        return;
    }

    let mut tasks = state.plot_tasks.lock().await;
    for (name, spec) in specs {
        let handle = spawn_plot_task(tx.clone(), name.clone(), spec.address, spec.command, spec.poll_interval);
        tasks.insert(name, handle);
    }
}

/// Enqueue a request; awaits if the channel is at capacity (backpressure).
///
/// The sender is cloned and the mutex released *before* awaiting the send. Holding
/// the guard across the await would block every other command — including
/// `disconnect_device` — whenever the channel filled up.
async fn queue_request(state: &State<'_, AppState>, req: DeviceRequest) -> Result<(), String> {
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

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_scan(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut scanning = state.is_scanning.lock().await;
        if *scanning {
            return Ok(());
        }
        *scanning = true;
    }

    let app_clone = app.clone();
    let scanning_flag = Arc::clone(&state.is_scanning);

    tauri::async_runtime::spawn(async move {
        crate::scanner::scan_devices(app_clone).await;
        *scanning_flag.lock().await = false;
    });

    Ok(())
}

#[tauri::command]
pub async fn connect_device(
    ip: String,
    interface_type: InterfaceType,
    device_name: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Retire the previous connection's stop token and mint a fresh one for this
    // attempt. Replacing the Arc (rather than setting the old flag back to false)
    // means a reconnect loop still sleeping from the previous connection can never
    // wake up "allowed" and race this connection for `communicator_tx`.
    let stop = {
        let mut guard = state.connection_token.lock().await;
        guard.store(true, Ordering::Relaxed);
        let fresh = Arc::new(AtomicBool::new(false));
        *guard = Arc::clone(&fresh);
        fresh
    };

    disconnect_internal(&state).await;

    // An explicit connect starts clean: plots belonging to the previous device
    // must not be resumed against this one.
    state.active_plots.lock().await.clear();

    let port = match interface_type {
        InterfaceType::Tcp => DEFAULT_TCP_PORT,
        InterfaceType::Udp => DEFAULT_UDP_PORT,
    };

    // Store params so the reconnect loop can reuse them
    *state.reconnect_params.lock().await = Some(ReconnectParams {
        ip: ip.clone(),
        port,
        interface_type: interface_type.clone(),
        device_name: device_name.clone(),
    });

    // Channel with capacity 100 (matches original MAX_QUEUE_SIZE)
    let (tx, rx) = mpsc::channel::<DeviceRequest>(100);

    let app_clone = app.clone();

    let connection = DeviceConnection {
        ip: ip.clone(),
        port,
        interface_type: interface_type.clone(),
        connected: true,
        reconnecting: false,
        control_state: 0,
        device_name: device_name.clone(),
    };

    let params = ReconnectParams {
        ip: ip.clone(),
        port,
        interface_type: interface_type.clone(),
        device_name: device_name.clone(),
    };

    match interface_type {
        InterfaceType::Tcp => {
            let stream = TcpStream::connect(format!("{}:{}", ip, port))
                .await
                .map_err(|e| format!("TCP connect failed: {}", e))?;

            let _ = app.emit("connectionStatus", &connection);
            emit_log(
                &app,
                LogLevel::Info,
                LogCategory::Connection,
                format!("TCP connected to {}:{}", ip, port),
            );

            let conn_clone = connection.clone();
            tauri::async_runtime::spawn(async move {
                let should_reconnect =
                    run_tcp_communicator(stream, rx, app_clone.clone(), conn_clone.clone()).await;

                // Communicator exited — clear state
                {
                    let s = app_clone.state::<AppState>();
                    *s.communicator_tx.lock().await = None;
                    *s.connection.lock().await = None;
                }

                let reconnecting = should_reconnect && !stop.load(Ordering::Relaxed);
                emit_connection_status(&app_clone, conn_clone, reconnecting);

                if reconnecting {
                    reconnect_loop(app_clone, params, stop).await;
                }
            });
        }
        InterfaceType::Udp => {
            let socket = UdpSocket::bind("0.0.0.0:0")
                .await
                .map_err(|e| format!("UDP bind failed: {}", e))?;

            let _ = app.emit("connectionStatus", &connection);
            emit_log(
                &app,
                LogLevel::Info,
                LogCategory::Connection,
                format!("UDP ready for {}:{}", ip, port),
            );

            let ip_clone = ip.clone();
            let conn_clone = connection.clone();
            tauri::async_runtime::spawn(async move {
                let should_reconnect = run_udp_communicator(
                    socket,
                    rx,
                    app_clone.clone(),
                    conn_clone.clone(),
                    ip_clone,
                    port,
                )
                .await;

                // Communicator exited — clear state
                {
                    let s = app_clone.state::<AppState>();
                    *s.communicator_tx.lock().await = None;
                    *s.connection.lock().await = None;
                }

                let reconnecting = should_reconnect && !stop.load(Ordering::Relaxed);
                emit_connection_status(&app_clone, conn_clone, reconnecting);

                if reconnecting {
                    reconnect_loop(app_clone, params, stop).await;
                }
            });
        }
    }

    // Set communicator_tx before connection so any concurrent command that
    // reads connection then communicator_tx never sees one without the other.
    let heartbeat_tx = tx.clone();
    let plot_tx = tx.clone();
    *state.communicator_tx.lock().await = Some(tx);
    *state.connection.lock().await = Some(connection);

    // Heartbeat: detect device loss even when no panel is actively reading
    let heartbeat = spawn_heartbeat(heartbeat_tx);
    state.plot_tasks.lock().await.insert("__heartbeat__".into(), heartbeat);

    // Resume any plots that were running before this (re)connect
    resume_active_plots(&app, &plot_tx).await;

    Ok(())
}

#[tauri::command]
pub async fn disconnect_device(state: State<'_, AppState>) -> Result<(), String> {
    // Stop the current connection's reconnect loop before dropping the channel
    state.connection_token.lock().await.store(true, Ordering::Relaxed);
    disconnect_internal(&state).await;
    // Explicit disconnect discards plot registrations; only an automatic
    // reconnect of the *same* connection resumes them.
    state.active_plots.lock().await.clear();
    *state.connection.lock().await = None;
    Ok(())
}

#[tauri::command]
pub async fn take_control(state: State<'_, AppState>) -> Result<(), String> {
    let interface = {
        let conn = state.connection.lock().await;
        conn.as_ref()
            .ok_or("Not connected")?
            .interface_type
            .clone()
    };

    let value = match interface {
        InterfaceType::Tcp => 1u32, // TCP_DATASTREAM
        InterfaceType::Udp => 2u32, // UDP_DATASTREAM
    };

    queue_request(
        &state,
        DeviceRequest {
            packet: make_control_packet(value),
            command: CMD_TAKE_CONTROL,
            address: 0,
            name: Some("TAKE_CONTROL".into()),
            emit_plot: false,
        },
    )
    .await
}

#[tauri::command]
pub async fn read_register(
    address: u16,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    queue_request(
        &state,
        DeviceRequest {
            packet: make_read_packet(CMD_READ_REGISTER, address),
            command: CMD_READ_REGISTER,
            address,
            name: Some(name),
            emit_plot: false,
        },
    )
    .await
}

#[tauri::command]
pub async fn write_register(
    address: u16,
    value: i32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    queue_request(
        &state,
        DeviceRequest {
            packet: make_write_packet(CMD_WRITE_REGISTER, address, value),
            command: CMD_WRITE_REGISTER,
            address,
            name: None,
            emit_plot: false,
        },
    )
    .await
}

#[tauri::command]
pub async fn read_parameter(
    address: u16,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    queue_request(
        &state,
        DeviceRequest {
            packet: make_read_packet(CMD_READ_PARAMETER, address),
            command: CMD_READ_PARAMETER,
            address,
            name: Some(name),
            emit_plot: false,
        },
    )
    .await
}

#[tauri::command]
pub async fn write_parameter(
    address: u16,
    value: i32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    queue_request(
        &state,
        DeviceRequest {
            packet: make_write_packet(CMD_WRITE_PARAMETER, address, value),
            command: CMD_WRITE_PARAMETER,
            address,
            name: None,
            emit_plot: false,
        },
    )
    .await
}

#[tauri::command]
pub async fn start_plotting(
    register_name: String,
    poll_interval: u64,
    address: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Stop any existing plot for this register
    if let Some(handle) = state.plot_tasks.lock().await.remove(&register_name) {
        handle.abort();
    }

    // Clone the sender before spawning
    let tx = {
        let guard = state.communicator_tx.lock().await;
        guard
            .as_ref()
            .ok_or("Not connected")?
            .clone()
    };

    let interval_ms = poll_interval.max(10); // enforce 10ms minimum

    let handle = spawn_plot_task(tx, register_name.clone(), address, CMD_READ_REGISTER, interval_ms);

    state.plot_tasks.lock().await.insert(register_name.clone(), handle);
    state.active_plots.lock().await.insert(
        register_name,
        ActivePlotSpec { address, command: CMD_READ_REGISTER, poll_interval: interval_ms },
    );
    Ok(())
}

#[tauri::command]
pub async fn stop_plotting(
    register_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if let Some(handle) = state.plot_tasks.lock().await.remove(&register_name) {
        handle.abort();
    }
    state.active_plots.lock().await.remove(&register_name);
    Ok(())
}

#[tauri::command]
pub async fn start_plotting_sys_register(
    register_name: String,
    poll_interval: u64,
    address: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Stop any existing plot for this name
    if let Some(handle) = state.plot_tasks.lock().await.remove(&register_name) {
        handle.abort();
    }

    let tx = {
        let guard = state.communicator_tx.lock().await;
        guard
            .as_ref()
            .ok_or("Not connected")?
            .clone()
    };

    let interval_ms = poll_interval.max(10);

    let handle = spawn_plot_task(tx, register_name.clone(), address, CMD_READ_SYS_REG, interval_ms);

    state.plot_tasks.lock().await.insert(register_name.clone(), handle);
    state.active_plots.lock().await.insert(
        register_name,
        ActivePlotSpec { address, command: CMD_READ_SYS_REG, poll_interval: interval_ms },
    );
    Ok(())
}

/// Send a user-defined command (type field = command, for CNC and other app-specific commands).
/// command: u16 type value (100–64999 for user-defined; e.g. 200 = ENABLE_ALL_MOTORS)
/// address: sub-address passed in the address field (typically 0 for CNC commands)
/// value:   parameter passed in the value field
#[tauri::command]
pub async fn send_command(
    command: u16,
    address: u16,
    value: i32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    queue_request(
        &state,
        DeviceRequest {
            packet: make_user_cmd_packet(command, address, value),
            command,
            address,
            name: Some(format!("CMD_{}", command)),
            emit_plot: false,
        },
    )
    .await
}

/// Send a library system command (type=0, address=sys_cmd address).
/// sys_cmd: one of SYS_CMD_READ_FLASH (65000), SYS_CMD_WRITE_FLASH (65001),
///          SYS_CMD_RESET_FIRMWARE (65002)
#[tauri::command]
pub async fn send_sys_command(
    sys_cmd: u16,
    value: i32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    queue_request(
        &state,
        DeviceRequest {
            packet: make_sys_cmd_packet(sys_cmd, value),
            command: CMD_SYS_COMMAND,
            address: sys_cmd,
            name: Some(format!("SYS_CMD_{}", sys_cmd)),
            emit_plot: false,
        },
    )
    .await
}

#[tauri::command]
pub async fn update_log_settings(
    settings: LogSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.log_filter.update(&settings);
    Ok(())
}

#[tauri::command]
pub async fn read_system_register(
    address: u16,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    queue_request(
        &state,
        DeviceRequest {
            packet: make_read_packet(CMD_READ_SYS_REG, address),
            command: CMD_READ_SYS_REG,
            address,
            name: Some(name),
            emit_plot: false,
        },
    )
    .await
}

/// Sends a write system register packet (command type 7).
/// The device always returns PERMISSION_ERROR (-5) — all system registers are read-only
/// from the external protocol. This command is provided for future compatibility should
/// the library introduce writable system registers.
#[tauri::command]
pub async fn write_system_register(
    address: u16,
    value: i32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    queue_request(
        &state,
        DeviceRequest {
            packet: make_write_packet(CMD_WRITE_SYS_REG, address, value),
            command: CMD_WRITE_SYS_REG,
            address,
            name: None,
            emit_plot: false,
        },
    )
    .await
}

/// Opens a native save dialog and writes text content to the chosen file.
/// `filter_name` and `filter_ext` control the file-type filter shown in the dialog (e.g. "Map File", "map").
#[tauri::command]
pub async fn save_text_file(
    content: String,
    suggested_name: String,
    filter_name: String,
    filter_ext: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let last_dir = state.last_save_dir.lock().await.clone();

    let mut dialog = rfd::AsyncFileDialog::new()
        .set_file_name(&suggested_name)
        .add_filter(&filter_name, &[filter_ext.as_str()]);

    if let Some(dir) = last_dir {
        dialog = dialog.set_directory(dir);
    }

    match dialog.save_file().await {
        Some(path) => {
            if let Some(parent) = path.path().parent() {
                *state.last_save_dir.lock().await = Some(parent.to_path_buf());
            }
            std::fs::write(path.path(), content.as_bytes())
                .map(|_| true)
                .map_err(|e| e.to_string())
        }
        None => Ok(false),
    }
}

/// Opens a native save dialog and writes binary (PDF) content to the chosen file.
/// `data_base64` is the file content encoded as a standard Base64 string.
#[tauri::command]
pub async fn save_pdf_file(
    data_base64: String,
    suggested_name: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    use base64::{Engine as _, engine::general_purpose};

    let data = general_purpose::STANDARD
        .decode(&data_base64)
        .map_err(|e| format!("Base64 decode error: {e}"))?;

    let last_dir = state.last_save_dir.lock().await.clone();

    let mut dialog = rfd::AsyncFileDialog::new()
        .set_file_name(&suggested_name)
        .add_filter("PDF Document", &["pdf"]);

    if let Some(dir) = last_dir {
        dialog = dialog.set_directory(dir);
    }

    match dialog.save_file().await {
        Some(path) => {
            if let Some(parent) = path.path().parent() {
                *state.last_save_dir.lock().await = Some(parent.to_path_buf());
            }
            std::fs::write(path.path(), data)
                .map(|_| true)
                .map_err(|e| e.to_string())
        }
        None => Ok(false),
    }
}

/// Opens a native save dialog and writes CSV data to the chosen file.
/// Remembers the last used directory and reopens it on subsequent calls.
#[tauri::command]
pub async fn save_csv(content: String, suggested_name: String, state: State<'_, AppState>) -> Result<bool, String> {
    let last_dir = state.last_save_dir.lock().await.clone();

    let mut dialog = rfd::AsyncFileDialog::new()
        .set_file_name(&suggested_name)
        .add_filter("CSV", &["csv"]);

    if let Some(dir) = last_dir {
        dialog = dialog.set_directory(dir);
    }

    match dialog.save_file().await {
        Some(path) => {
            if let Some(parent) = path.path().parent() {
                *state.last_save_dir.lock().await = Some(parent.to_path_buf());
            }
            std::fs::write(path.path(), content.as_bytes())
                .map(|_| true)
                .map_err(|e| e.to_string())
        }
        None => Ok(false), // User cancelled
    }
}
