pub mod commands;
pub mod communicator;
pub mod daughter_window_spike;
pub mod poll;
pub mod poll_spike;
pub mod scanner;
pub mod spike;
pub mod types;

use commands::AppState;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{
    ipc::CapabilityBuilder,
    webview::NewWindowResponse,
    Manager, WebviewUrl, WebviewWindowBuilder,
};

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
            $($extra,)*
        ]
    };
}

/// The one window this build declares in code rather than in
/// `tauri.conf.json` — see the `setup` closure below for why.
const MAIN_WINDOW_LABEL: &str = "main";
const WINDOW_TITLE: &str = "DSHub";
const WINDOW_WIDTH: f64 = 1440.0;
const WINDOW_HEIGHT: f64 = 900.0;
const WINDOW_MIN_WIDTH: f64 = 1024.0;
const WINDOW_MIN_HEIGHT: f64 = 600.0;

/// The phase-2 localhost origin's preferred port — fixed, not freshly picked
/// per launch. `localStorage`, where every Setting, Profile, Workspace and
/// Dashboard lives, is scoped to the browser origin, and
/// `http://localhost:<port>` *is* that origin. A port picked fresh every
/// launch is a fresh, empty origin every launch — indistinguishable from
/// nothing ever having been saved. Falls back to a freely-chosen port only
/// if this one is already taken (logged, since that machine's persistence
/// stays broken until it is free again) — trading persistence for at least
/// being able to start, rather than failing outright over an unlucky port.
const LOCALHOST_PORT: u16 = 47990;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Issue 01's popout spike reports its verdict through the host, which is
    // the only side of a Tauri window whose stdout a CI job can read. Debug
    // builds only — see `spike.rs`.
    //
    // Annotated rather than inferred: `generate_handler!` builds a closure
    // generic over the runtime, and a `let` binding gives inference nothing to
    // pin that parameter against until the builder sees it.
    type Handler = fn(tauri::ipc::Invoke<tauri::Wry>) -> bool;
    #[cfg(debug_assertions)]
    let handler: Handler = invoke_handler![
        spike::spike_report,
        poll_spike::spike_start_poll_load,
        poll_spike::spike_poll_load_status,
        poll_spike::spike_resume_poll_load,
        poll_spike::spike_stop_poll_load,
        daughter_window_spike::spike_open_daughter_windows,
    ];
    #[cfg(not(debug_assertions))]
    let handler: Handler = invoke_handler![];

    // ADR 0004, phase 2. dockview's popout windows need a same-origin http(s)
    // document to open into (`assertSameOriginPopoutUrl` rejects anything
    // else outright), and Tauri's own custom-protocol origin only clears that
    // bar on Windows (`http://tauri.localhost`) — `tauri://localhost` on macOS
    // and Linux throws unconditionally. Rather than special-case two
    // platforms, every non-dev build serves the bundled frontend over real
    // localhost HTTP via `tauri-plugin-localhost` and points the window at
    // that instead, so the origin dockview compares against is the same one
    // everywhere and this file does not fork by platform.
    //
    // `cargo tauri dev` is untouched: it already serves over
    // `http://localhost:3000` from Vite, which already satisfies the
    // assertion, and spinning up a second HTTP server on top of it would add
    // nothing.
    #[cfg(not(dev))]
    let localhost_port = if std::net::TcpListener::bind(("127.0.0.1", LOCALHOST_PORT)).is_ok() {
        LOCALHOST_PORT
    } else {
        log::warn!(
            "Port {LOCALHOST_PORT} is already in use — falling back to a freshly \
             picked port. Settings, Profiles and Workspaces will not persist \
             across launches until port {LOCALHOST_PORT} is free again."
        );
        portpicker::pick_unused_port().expect("failed to find an unused localhost port")
    };

    let mut builder = tauri::Builder::default();
    #[cfg(not(dev))]
    {
        builder = builder.plugin(tauri_plugin_localhost::Builder::new(localhost_port).build());
    }

    builder
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(dev)]
            let url = WebviewUrl::App(std::path::PathBuf::from("/"));
            #[cfg(not(dev))]
            let url = {
                let url: tauri::Url = format!("http://localhost:{localhost_port}")
                    .parse()
                    .expect("a port number always parses into a valid localhost URL");
                // The localhost origin is a "remote" one as far as Tauri's IPC
                // allowlist is concerned. `capabilities/default.json`'s static
                // grant does not reach it: that file has no `remote` origin of
                // its own, so it only ever matches the app's own bundled
                // origin — which is also why `cargo tauri dev` never needed
                // this at all, dev mode gives its configured `devUrl` the same
                // implicit trust the bundled origin gets. This picked port
                // gets none of that, so every permission the app needs on the
                // Main Window has to be repeated here explicitly — miss one
                // and it fails silently rather than with an error, exactly as
                // `core:event:default`'s absence once did: `invoke` calls kept
                // working (custom commands are not capability-gated at all),
                // but every event the backend pushes — device discovery
                // among them — never reached the frontend. Keep this list in
                // step with `capabilities/default.json`'s own.
                app.add_capability(
                    CapabilityBuilder::new("localhost")
                        .remote(url.to_string())
                        .window(MAIN_WINDOW_LABEL)
                        .permission("core:default")
                        .permission("core:window:allow-close")
                        .permission("core:window:allow-set-focus"),
                )?;
                WebviewUrl::External(url)
            };

            let app_handle = app.handle().clone();
            // Labels a Daughter Window uniquely across the app's lifetime, not
            // just across the currently-open set — reusing a just-closed
            // label is how a stale reference to it would end up resolving to
            // the wrong window.
            let next_popout_id = AtomicU32::new(0);

            // Built here instead of declared in `tauri.conf.json` because the
            // URL above is only known once `localhost_port` is picked — the
            // dev build and the popout mechanism this exists for both need
            // that to happen before the window opens, not after.
            WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, url)
                .title(WINDOW_TITLE)
                .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
                .min_inner_size(WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT)
                .resizable(true)
                .fullscreen(false)
                // Was `dragDropEnabled: false` in `tauri.conf.json`. Kept off
                // for the same reason it was set originally: Tauri's native
                // drag-drop would otherwise swallow the HTML5 drag a Pane
                // relies on, both within the Workspace and — issue 03 — out
                // of it into a Daughter Window.
                .disable_drag_drop_handler()
                // Issue 01's actual finding: wry denies every `window.open`
                // by default unless the host opts in here. This is the
                // Windows/Linux/macOS analogue of the WKWebView
                // `createWebViewWith` requirement the issue named for macOS —
                // it turned out to apply to all three, just undocumented for
                // the other two until this spike hit it. A Daughter Window is
                // handed exactly the URL and window features dockview
                // requested; `window_features` also carries over the
                // platform plumbing `NewWindowResponse::Create` needs (the
                // WebView2 environment on Windows, the related webview on
                // Linux) — without it the child webview fails to construct.
                .on_new_window(move |url, features| {
                    let label = format!(
                        "popout-{}",
                        next_popout_id.fetch_add(1, Ordering::Relaxed)
                    );
                    match WebviewWindowBuilder::new(&app_handle, label, WebviewUrl::External(url))
                        .title(WINDOW_TITLE)
                        .window_features(features)
                        .build()
                    {
                        Ok(window) => NewWindowResponse::Create { window },
                        Err(error) => {
                            log::error!("failed to open a Daughter Window: {error}");
                            NewWindowResponse::Deny
                        }
                    }
                })
                .build()?;

            Ok(())
        })
        .manage(AppState::new())
        .invoke_handler(handler)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
