use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::net::{TcpStream, UdpSocket};
use tokio::sync::mpsc;
use tauri::async_runtime::JoinHandle;

use crate::communicator::{
    emit_log, make_control_packet, make_read_packet, make_sys_cmd_packet,
    make_user_cmd_packet, make_write_packet,
    run_tcp_communicator, run_udp_communicator, DeviceRequest,
};
use crate::types::*;

// ── Managed application state ─────────────────────────────────────────────────

pub struct AppState {
    /// Sender half of the communicator channel; None when not connected
    pub communicator_tx: tokio::sync::Mutex<Option<mpsc::Sender<DeviceRequest>>>,
    /// Active plot task handles keyed by register name
    pub plot_tasks: tokio::sync::Mutex<HashMap<String, JoinHandle<()>>>,
    /// Current device connection info (for takeControl to know interface type)
    pub connection: tokio::sync::Mutex<Option<DeviceConnection>>,
    /// User-configurable log filter settings
    pub log_settings: tokio::sync::Mutex<LogSettings>,
    /// Prevents concurrent scans (shared as Arc for spawned tasks)
    pub is_scanning: Arc<tokio::sync::Mutex<bool>>,
    /// Last directory used for saving files
    pub last_save_dir: tokio::sync::Mutex<Option<std::path::PathBuf>>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            communicator_tx: tokio::sync::Mutex::new(None),
            plot_tasks: tokio::sync::Mutex::new(HashMap::new()),
            connection: tokio::sync::Mutex::new(None),
            log_settings: tokio::sync::Mutex::new(LogSettings::default()),
            is_scanning: Arc::new(tokio::sync::Mutex::new(false)),
            last_save_dir: tokio::sync::Mutex::new(None),
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

/// Enqueue a request; awaits if the channel is at capacity (backpressure).
async fn queue_request(state: &State<'_, AppState>, req: DeviceRequest) -> Result<(), String> {
    let guard = state.communicator_tx.lock().await;
    match guard.as_ref() {
        Some(tx) => tx
            .send(req)
            .await
            .map_err(|_| "Communicator channel closed".to_string()),
        None => Err("Not connected to device".to_string()),
    }
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
    // Clean up any existing connection
    disconnect_internal(&state).await;

    let port = match interface_type {
        InterfaceType::Tcp => DEFAULT_TCP_PORT,
        InterfaceType::Udp => DEFAULT_UDP_PORT,
    };

    let base_connection = DeviceConnection {
        ip: ip.clone(),
        port,
        interface_type: interface_type.clone(),
        connected: false,
        control_state: 0,
        device_name: device_name.clone(),
    };

    // Channel with capacity 100 (matches original MAX_QUEUE_SIZE)
    let (tx, rx) = mpsc::channel::<DeviceRequest>(100);

    let app_clone = app.clone();

    match interface_type {
        InterfaceType::Tcp => {
            let stream = TcpStream::connect(format!("{}:{}", ip, port))
                .await
                .map_err(|e| format!("TCP connect failed: {}", e))?;

            let mut connected = base_connection.clone();
            connected.connected = true;
            let _ = app.emit("connectionStatus", &connected);
            emit_log(
                &app,
                LogLevel::Info,
                LogCategory::Connection,
                format!("TCP connected to {}:{}", ip, port),
            );

            tauri::async_runtime::spawn(async move {
                run_tcp_communicator(stream, rx, app_clone, connected).await;
            });
        }
        InterfaceType::Udp => {
            let socket = UdpSocket::bind("0.0.0.0:0")
                .await
                .map_err(|e| format!("UDP bind failed: {}", e))?;

            let mut connected = base_connection.clone();
            connected.connected = true;
            let _ = app.emit("connectionStatus", &connected);
            emit_log(
                &app,
                LogLevel::Info,
                LogCategory::Connection,
                format!("UDP ready for {}:{}", ip, port),
            );

            let ip_clone = ip.clone();
            tauri::async_runtime::spawn(async move {
                run_udp_communicator(socket, rx, app_clone, connected, ip_clone, port).await;
            });
        }
    }

    *state.connection.lock().await = Some(base_connection);
    *state.communicator_tx.lock().await = Some(tx);

    Ok(())
}

#[tauri::command]
pub async fn disconnect_device(state: State<'_, AppState>) -> Result<(), String> {
    disconnect_internal(&state).await;
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

    let name = register_name.clone();
    let interval_ms = poll_interval.max(10); // enforce 10ms minimum

    let handle = tauri::async_runtime::spawn(async move {
        let mut ticker =
            tokio::time::interval(std::time::Duration::from_millis(interval_ms));
        loop {
            ticker.tick().await;
            let req = DeviceRequest {
                packet: make_read_packet(CMD_READ_REGISTER, address),
                command: CMD_READ_REGISTER,
                address,
                name: Some(name.clone()),
                emit_plot: true,
            };
            if tx.send(req).await.is_err() {
                break; // communicator gone — exit silently
            }
        }
    });

    state.plot_tasks.lock().await.insert(register_name, handle);
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

    let name = register_name.clone();
    let interval_ms = poll_interval.max(10);

    let handle = tauri::async_runtime::spawn(async move {
        let mut ticker =
            tokio::time::interval(std::time::Duration::from_millis(interval_ms));
        loop {
            ticker.tick().await;
            let req = DeviceRequest {
                packet: make_read_packet(CMD_READ_SYS_REG, address),
                command: CMD_READ_SYS_REG,
                address,
                name: Some(name.clone()),
                emit_plot: true,
            };
            if tx.send(req).await.is_err() {
                break;
            }
        }
    });

    state.plot_tasks.lock().await.insert(register_name, handle);
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
    *state.log_settings.lock().await = settings;
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
