//! `.scratch/daughter-windows-native` issue 01's spike, host side.
//!
//! Throwaway by intent, mirroring `spike.rs`/`poll_spike.rs`'s shape: debug-only
//! commands, reporting through `println!`/`log::info!` since WebView2 does not
//! forward webview console output to the terminal that launched it.
//!
//! What this exists to answer: can a genuinely separate `WebviewWindow` — built
//! explicitly here with `WebviewWindowBuilder`, not adopted from another
//! window's DOM the way the dockview-popout mechanism (ADR 0004) works — call
//! `invoke` and receive a broadcast `listen` event, against a packaged
//! (`cargo build --features custom-protocol`) binary where `cargo tauri dev`'s
//! implicit trust of `devUrl` does not apply? And does that hold for a second
//! *and* third window created the same way, not just the first?
//!
//! The windows this opens load via `WebviewUrl::App` — Tauri's own local
//! protocol — deliberately not through the phase-2 localhost server `lib.rs`
//! still serves the Main Window over today. That server is exactly what this
//! whole effort exists to delete (see `.scratch/daughter-windows-native/spec.md`),
//! so a spike that proved anything through it would prove nothing about the
//! mechanism issue 02 actually needs.

use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{ipc::CapabilityBuilder, AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// Labels a spike window uniquely across the run — mirrors `lib.rs`'s
/// `next_popout_id`, same reasoning: a reused label from an already-closed
/// window is how a stale reference would resolve to the wrong one.
static NEXT_SPIKE_ID: AtomicU32 = AtomicU32::new(1);

/// The event name the frontend probe (`spike/DaughterWindowSpike.tsx`) listens
/// for. Kept here rather than only in the frontend so the two sides cannot
/// drift silently — a typo in either would read as "listen doesn't work" when
/// the real fault is a mismatched string.
pub const BROADCAST_EVENT: &str = "spike-daughter-broadcast";

fn report(line: String) -> String {
    println!("{line}");
    log::info!("{line}");
    line
}

/// Opens three genuinely separate `WebviewWindow`s with runtime-minted labels:
/// two (`daughter-spike-N`) covered only by `capabilities/daughter-window-spike.json`'s
/// static glob (`"daughter-spike-*"`), and a third (`dyn-spike-N`),
/// deliberately outside that glob, covered only by a per-window dynamic grant
/// added here in Rust — the first two of the ticket's three candidate
/// mechanisms, both exercised for real rather than the second argued from
/// source alone. Schedules a broadcast shortly after so every window's
/// `listen` call has something to receive.
///
/// `async fn` is load-bearing, not stylistic. Tauri's codegen (`tauri-macros`'
/// `body_blocking`) runs a *sync* command's body inline, on whatever thread
/// dispatched the IPC message — which this spike traced (a `ThreadId(1)`
/// diagnostic, since removed) to the main/event-loop thread itself.
/// `WebviewWindowBuilder::build()` needs that same thread's message loop to
/// cycle again to finish constructing the window, so calling it *from* the
/// main thread deadlocks it against itself: the first window's OS handle
/// appears (`CreateWindowEx`'s own nested dispatch gets that far) but
/// `build()` never returns, and nothing after it — including this
/// function's own report of what it did — ever runs. `async fn` routes the
/// command through `body_async`/`respond_async_serialized` instead, which
/// runs on the async runtime's thread pool, leaving the real main thread
/// free to service the cross-thread call `build()` makes back into it. This
/// is this spike's first finding, not a style choice.
#[cfg(debug_assertions)]
#[tauri::command]
pub async fn spike_open_daughter_windows(app: AppHandle) -> Result<String, String> {
    let mut labels = Vec::with_capacity(3);
    for _ in 0..2 {
        let n = NEXT_SPIKE_ID.fetch_add(1, Ordering::Relaxed);
        let label = format!("daughter-spike-{n}");
        WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("/".into()))
            .title(format!("Daughter Spike {n}"))
            .inner_size(480.0, 320.0)
            .build()
            .map_err(|error| {
                report(format!(
                    "[daughter-window-spike] failed to open {label}: {error}"
                ))
            })?;
        labels.push(label);
    }

    // A third window, deliberately labelled outside the `daughter-spike-*`
    // glob (`capabilities/daughter-window-spike.json`) so success here can
    // only be attributed to this dynamic, per-label grant — the second of
    // the ticket's three candidate mechanisms, tested for real rather than
    // ruled out by reading source alone. Mirrors `lib.rs`'s own "localhost"
    // capability code, minus `.remote(...)`: this window loads over the
    // *local* protocol, so there is no out-of-band origin to declare.
    let dynamic_n = NEXT_SPIKE_ID.fetch_add(1, Ordering::Relaxed);
    let dynamic_label = format!("dyn-spike-{dynamic_n}");
    app.add_capability(
        CapabilityBuilder::new("daughter-window-spike-dynamic")
            .window(&dynamic_label)
            .permission("core:default")
            .permission("core:window:allow-close")
            .permission("core:window:allow-set-focus"),
    )
    .map_err(|error| {
        report(format!(
            "[daughter-window-spike] failed to add dynamic capability for {dynamic_label}: {error}"
        ))
    })?;
    WebviewWindowBuilder::new(&app, &dynamic_label, WebviewUrl::App("/".into()))
        .title(format!("Daughter Spike {dynamic_n} (dynamic grant)"))
        .inner_size(480.0, 320.0)
        .build()
        .map_err(|error| {
            report(format!(
                "[daughter-window-spike] failed to open {dynamic_label}: {error}"
            ))
        })?;
    labels.push(dynamic_label);

    // Delayed rather than immediate so every window has finished mounting
    // and registered its `listen` call before the event fires — an
    // immediate emit would only prove the *host* can call `emit`, not that a
    // freshly-opened window's listener is live in time to catch it.
    let app_for_broadcast = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        match app_for_broadcast.emit(BROADCAST_EVENT, "hello-from-host") {
            Ok(()) => {
                report("[daughter-window-spike] broadcast emitted".into());
            }
            Err(error) => {
                report(format!(
                    "[daughter-window-spike] broadcast emit failed: {error}"
                ));
            }
        }
    });

    Ok(report(format!(
        "[daughter-window-spike] opened {}",
        labels.join(", ")
    )))
}
