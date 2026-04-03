pub mod commands;
pub mod communicator;
pub mod scanner;
pub mod types;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::start_scan,
            commands::connect_device,
            commands::disconnect_device,
            commands::take_control,
            commands::read_register,
            commands::write_register,
            commands::read_parameter,
            commands::write_parameter,
            commands::start_plotting,
            commands::start_plotting_sys_register,
            commands::stop_plotting,
            commands::send_command,
            commands::send_sys_command,
            commands::update_log_settings,
            commands::read_system_register,
            commands::write_system_register,
            commands::save_csv,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
