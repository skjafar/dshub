pub mod commands;
pub mod communicator;
pub mod daughter_windows;
pub mod poll;
pub mod poll_spike;
pub mod scanner;
pub mod types;

use commands::AppState;
use tauri::Manager;

/// Every command the frontend may invoke, plus whatever debug-only extras this
/// build asks for.
///
/// Written once and expanded twice rather than written twice:
/// `generate_handler!` needs its arguments literally, so a debug-only command
/// cannot be `#[cfg]`-ed into the list — and a second `invoke_handler` call
/// silently *replaces* the first rather than adding to it, which would drop
/// every real command on the floor.
macro_rules! invoke_handler {
    ($($extra:path),* $(,)?) => {
        tauri::generate_handler![
            commands::start_scan,
            commands::connect_device,
            commands::disconnect_device,
            commands::take_control,
            commands::get_connection_status,
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
            commands::save_text_file,
            commands::save_pdf_file,
            poll::subscribe_address,
            poll::unsubscribe_address,
            daughter_windows::open_daughter_window,
            daughter_windows::restore_daughter_window,
            daughter_windows::list_daughter_windows,
            $($extra,)*
        ]
    };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Annotated rather than inferred: `generate_handler!` builds a closure
    // generic over the runtime, and a `let` binding gives inference nothing to
    // pin that parameter against until the builder sees it.
    type Handler = fn(tauri::ipc::Invoke<tauri::Wry>) -> bool;
    #[cfg(debug_assertions)]
    let handler: Handler = invoke_handler![
        poll_spike::spike_start_poll_load,
        poll_spike::spike_poll_load_status,
        poll_spike::spike_resume_poll_load,
        poll_spike::spike_stop_poll_load,
    ];
    #[cfg(not(debug_assertions))]
    let handler: Handler = invoke_handler![];

    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // A Daughter Window is independent of the Main Window's own
            // dockview instance, but not of what the Main Window alone can
            // do — Connect, take Control, manage the Workspace. Nothing in
            // a Daughter Window's own React tree can do any of that once
            // the Main Window is gone, so closing the Main Window cascades
            // to every currently-open Daughter Window rather than leaving
            // them running, orphaned, as the only thing keeping the app
            // process alive. `tauri.conf.json` declares exactly one window
            // labelled "main" (`app.windows`), so this `expect` documents
            // an assumption already load-bearing everywhere else in this
            // codebase (`windowRole.ts`'s `MAIN_TAURI_WINDOW_LABEL`), not a
            // new one.
            let main_window = app
                .get_webview_window("main")
                .expect("tauri.conf.json must declare a window labelled \"main\"");
            let app_handle = app.handle().clone();
            main_window.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::Destroyed) {
                    daughter_windows::close_all(&app_handle);
                }
            });

            Ok(())
        })
        .manage(AppState::new())
        .invoke_handler(handler)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
