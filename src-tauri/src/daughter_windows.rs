//! Real, independent Daughter Windows (`.scratch/daughter-windows-native`
//! issue 02).
//!
//! Each is a genuine `WebviewWindow` — its own React tree, its own dockview
//! instance — rather than dockview's own `addPopoutGroup` adopting DOM into
//! a same-realm popout (ADR 0004, superseded by ADR 0005). The registry
//! this module owns (`AppState::daughter_windows`) is the one place that
//! knows which labels are currently open; the Main Window's own "Daughter
//! Window list" and the 5th-window warning both read it indirectly, through
//! `list_daughter_windows`/`CHANGED_EVENT` rather than any live dockview
//! api, since dockview no longer has anything to do with *these* windows at
//! all.

use crate::commands::AppState;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// Every Daughter Window's label carries this prefix — the exact string
/// `capabilities/default.json`'s `"daughter-*"` glob matches against
/// (`.scratch/daughter-windows-native` issue 01's confirmed mechanism).
const LABEL_PREFIX: &str = "daughter-";

/// Broadcast whenever the open set changes, carrying the full current list
/// rather than a bare signal — matching every other broadcast this codebase
/// already emits (`communicator.rs`, `scanner.rs`), and letting a listener
/// that subscribes after a burst of opens/closes still land on the correct
/// final state rather than replaying every intermediate one.
const CHANGED_EVENT: &str = "daughter-windows-changed";

/// Open labels, and the next one to mint. Labels are never reused across
/// the app's lifetime — a reused label from an already-closed window is
/// exactly how a stale reference would end up resolving to the wrong one
/// (the same reasoning `lib.rs`'s old `next_popout_id` documented).
pub struct DaughterWindowRegistry {
    next_id: u32,
    open: Vec<String>,
}

impl DaughterWindowRegistry {
    pub fn new() -> Self {
        DaughterWindowRegistry { next_id: 1, open: Vec::new() }
    }
}

fn broadcast(app: &AppHandle, labels: &[String]) {
    if let Err(error) = app.emit(CHANGED_EVENT, labels) {
        log::error!("failed to broadcast the open Daughter Window list: {error}");
    }
}

/// A Daughter Window's saved position and size, in logical pixels —
/// `WebviewWindowBuilder::position`/`inner_size` both take logical pixels
/// (confirmed at the `tauri` crate source level), so the frontend converts
/// from the physical pixels `@tauri-apps/api/window` reports before ever
/// sending this across (`shell/daughterWindowNative.ts`'s `readOwnWindowBounds`).
#[derive(Debug, Clone, Copy, serde::Deserialize)]
pub struct DaughterWindowBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Builds and registers a genuinely separate `WebviewWindow`, shared by
/// `open_daughter_window` (a fresh single-Pane window, OS-default placement)
/// and `restore_daughter_window` (a saved layout at a saved position/size) —
/// the label-minting, registry bookkeeping and `Destroyed` handler are
/// identical for both; only the URL and initial bounds differ.
///
/// `async fn` is load-bearing, not stylistic. A *sync* `#[tauri::command]`
/// runs inline on whatever thread dispatched the IPC message — which issue
/// 01's spike traced to the main/event-loop thread itself — and
/// `WebviewWindowBuilder::build()` needs that same thread's message loop to
/// cycle again to finish constructing the window, so calling it from a sync
/// command deadlocks the app against itself. `async fn` routes this through
/// Tauri's `respond_async_serialized` path onto the async runtime's own
/// thread pool instead, leaving the real main thread free to service the
/// cross-thread call `build()` makes back into it. Both public commands
/// below inherit this by staying `async fn` themselves.
async fn open_and_register(
    app: AppHandle,
    url_query: String,
    bounds: Option<DaughterWindowBounds>,
) -> Result<String, String> {
    let label = {
        let state = app.state::<AppState>();
        let mut registry = state.daughter_windows.lock().expect("daughter window registry poisoned");
        let label = format!("{LABEL_PREFIX}{}", registry.next_id);
        registry.next_id += 1;
        label
    };

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url_query.into()))
        .title("DSHub");
    builder = match bounds {
        Some(b) => builder.position(b.x, b.y).inner_size(b.width, b.height),
        None => builder.inner_size(640.0, 480.0),
    };
    let window = builder.build().map_err(|error| error.to_string())?;

    let opened = {
        let state = app.state::<AppState>();
        let mut registry = state.daughter_windows.lock().expect("daughter window registry poisoned");
        registry.open.push(label.clone());
        registry.open.clone()
    };
    broadcast(&app, &opened);

    // The one mechanism that handles every closure path uniformly — the
    // window's own native close control, the Main Window's Daughter Window
    // list closing it, or a Daughter Window closing itself on losing its
    // last Pane — rather than needing separate bookkeeping per path.
    let app_for_close = app.clone();
    let label_for_close = label.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let remaining = {
                let state = app_for_close.state::<AppState>();
                let mut registry = state.daughter_windows.lock().expect("daughter window registry poisoned");
                registry.open.retain(|open_label| open_label != &label_for_close);
                registry.open.clone()
            };
            broadcast(&app_for_close, &remaining);
        }
    });

    Ok(label)
}

/// Opens a genuinely separate `WebviewWindow` showing one Pane, at the OS's
/// own default placement — the "Move to new window" tab command's own
/// mechanism.
///
/// Loads over Tauri's own local protocol (`WebviewUrl::App`), carrying the
/// initial Pane's kind as a query string on the root path — confirmed at
/// the `tauri`/`url` crate level that the query is stripped before asset
/// resolution, so this still resolves to the same `index.html` the Main
/// Window loads; `window.location.search` is what tells the frontend which
/// Pane to open first (`shell/DaughterWindowShell.tsx`).
#[tauri::command]
pub async fn open_daughter_window(app: AppHandle, pane_kind: String) -> Result<String, String> {
    open_and_register(app, format!("/?pane={pane_kind}"), None).await
}

/// Restores a genuinely separate `WebviewWindow` at a saved position and
/// size, for one entry of the active Workspace's saved `daughterWindows`
/// list (`.scratch/daughter-windows-native` issue 03) — driven by the Main
/// Window at launch, one call per saved entry, `restore_index` naming which
/// one so `shell/DaughterWindowShell.tsx` can read its own saved
/// `dockLayout`/`paneStates` back out of the shared Settings blob rather
/// than this carrying the payload itself (`?restore=<index>`, mirroring
/// `open_daughter_window`'s own `?pane=<kind>`).
#[tauri::command]
pub async fn restore_daughter_window(
    app: AppHandle,
    restore_index: u32,
    bounds: DaughterWindowBounds,
) -> Result<String, String> {
    open_and_register(app, format!("/?restore={restore_index}"), Some(bounds)).await
}

/// Opens a genuinely separate `WebviewWindow` for one Pane dragged out of an
/// already-open Window (`.scratch/daughter-windows-native` issue 07), at an
/// explicit position and size rather than the OS's own default placement —
/// unlike `open_daughter_window`, whose "Move to new window" menu command
/// has no drop point of its own to anchor on.
///
/// `pane_state` is the dragged Pane's own serialized state
/// (`shell/paneState.ts`'s `snapshotPaneStates`), JSON-stringified and
/// percent-encoded by the frontend before this call, appended to the query
/// string as-is rather than parsed here — this command only ever moves the
/// bytes, the same way it already does for `pane_kind`. It travels on the
/// new window's own URL (`?pane=<kind>&paneState=<encoded>`) rather than
/// through `shell/paneHandoff.ts`'s live event broadcast (issue 05): that
/// mechanism assumes its target is already open and already listening (its
/// own doc comment), which a window this very call is still in the middle
/// of creating is not — its React tree has not mounted, let alone
/// registered a listener, by the time this command resolves.
#[tauri::command]
pub async fn open_daughter_window_at(
    app: AppHandle,
    pane_kind: String,
    bounds: DaughterWindowBounds,
    pane_state: Option<String>,
) -> Result<String, String> {
    let mut url_query = format!("/?pane={pane_kind}");
    if let Some(state) = pane_state {
        url_query.push_str("&paneState=");
        url_query.push_str(&state);
    }
    open_and_register(app, url_query, Some(bounds)).await
}

/// The currently-open Daughter Window labels, for a window's one-time read
/// on mount — live changes after that arrive via `CHANGED_EVENT` instead,
/// since a broadcast only fires on change and this is what seeds the state
/// it changes relative to.
#[tauri::command]
pub fn list_daughter_windows(state: State<'_, AppState>) -> Vec<String> {
    state.daughter_windows.lock().expect("daughter window registry poisoned").open.clone()
}

/// Closes every currently-open Daughter Window — called from `lib.rs` when
/// the Main Window itself closes, since a Daughter Window's independent
/// `DSHubProvider` has nothing left worth running once the one Window that
/// can Connect, take Control or manage the Workspace is gone. Read the open
/// labels first and release the lock before calling out to `.close()`: that
/// call re-enters this module's own `Destroyed` handler above (which prunes
/// the registry and re-broadcasts), and re-locking an already-held
/// `std::sync::Mutex` on the same thread deadlocks rather than blocking.
///
/// Each `.close()` here is the same call `daughterWindowNative.ts`'s own
/// `closeDaughterWindow` makes from the frontend (`Window.getByLabel(label).close()`)
/// for the Main Window's "close a Daughter Window" list — just issued from
/// the Rust side instead of round-tripping through IPC, since the Main
/// Window closing has no live frontend left to issue that call from.
pub fn close_all(app: &AppHandle) {
    let labels = {
        let state = app.state::<AppState>();
        let registry = state.daughter_windows.lock().expect("daughter window registry poisoned");
        registry.open.clone()
    };
    for label in labels {
        let Some(window) = app.get_webview_window(&label) else { continue };
        if let Err(error) = window.close() {
            log::error!("failed to close Daughter Window {label} after the Main Window closed: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::DaughterWindowRegistry;

    #[test]
    fn labels_are_never_reused() {
        let mut registry = DaughterWindowRegistry::new();
        let mut mint = || {
            let label = format!("{}{}", super::LABEL_PREFIX, registry.next_id);
            registry.next_id += 1;
            label
        };

        let first = mint();
        registry.open.push(first.clone());
        registry.open.retain(|l| l != &first); // closed
        let second = mint();

        assert_ne!(first, second, "a closed window's label must never be reused");
    }

    #[test]
    fn open_reflects_inserts_and_removals() {
        let mut registry = DaughterWindowRegistry::new();
        registry.open.push("daughter-1".into());
        registry.open.push("daughter-2".into());
        assert_eq!(registry.open, vec!["daughter-1", "daughter-2"]);

        registry.open.retain(|l| l != "daughter-1");
        assert_eq!(registry.open, vec!["daughter-2"]);
    }
}
