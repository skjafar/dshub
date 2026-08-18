//! `.scratch/rust-owned-polling` issue 01's spike, host side.
//!
//! Throwaway by intent, mirroring `spike.rs`'s shape: debug-only commands,
//! reporting through `println!`/`log::info!` since WebView2 does not forward
//! webview console output to the terminal that launched it. What this exists
//! to answer is narrower than "does request/response correlation still work
//! under load" — that already holds by construction, since every request
//! (spike-issued or not) funnels through the same single `mpsc::Sender` that
//! one communicator task consumes strictly one at a time (`commands.rs`'s
//! `queue_request`, `communicator.rs`'s `response_matches`). What is actually
//! unproven is scale: whether spawning and tearing down dozens of per-address
//! `tokio::time::interval` tasks — the shape the real feature needs, not the
//! handful `spawn_plot_task` has production precedent for — holds up without
//! runaway task count, channel backpressure stalls, or missed reads.
//!
//! Deliberately keeps its own state outside `AppState` (a process-wide
//! `OnceLock`) rather than adding spike-only fields to it — this is meant to
//! be deleted whole once issue 01 returns a verdict, not partially unwound
//! from shared state later.

use crate::commands::AppState;
use crate::communicator::{make_read_packet, DeviceRequest};
use crate::types::CMD_READ_REGISTER;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock};
use tauri::async_runtime::JoinHandle;
use tauri::State;
use tokio::sync::Mutex as AsyncMutex;

/// `pollRegistry.ts`'s existing floor (`MIN_INTERVAL_MS`) — the real feature
/// inherits it, so the spike tests against the same number rather than a
/// friendlier one.
const MIN_INTERVAL_MS: u64 = 50;

struct SpikeRun {
    tasks: Vec<JoinHandle<()>>,
    address_count: u32,
    base_interval_ms: u64,
    sent: Arc<AtomicUsize>,
    started_at: std::time::Instant,
}

static SPIKE_RUN: OnceLock<AsyncMutex<Option<SpikeRun>>> = OnceLock::new();

fn spike_run_slot() -> &'static AsyncMutex<Option<SpikeRun>> {
    SPIKE_RUN.get_or_init(|| AsyncMutex::new(None))
}

fn report(line: String) -> String {
    println!("{line}");
    log::info!("{line}");
    line
}

/// Spawns `address_count` independent poll tasks against the currently
/// connected device, staggered so they don't all tick in lockstep. Addresses
/// wrap onto the emulator's real register range (0-24) — an out-of-range
/// address still gets a real ERROR response round-trip, exercising the queue
/// identically to a valid one, so `address_count` can exceed 25 to push past
/// what the emulator actually exposes.
#[cfg(debug_assertions)]
#[tauri::command]
pub async fn spike_start_poll_load(
    address_count: u32,
    base_interval_ms: u64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let tx = {
        let guard = state.communicator_tx.lock().await;
        guard
            .as_ref()
            .cloned()
            .ok_or("Not connected to device — connect first")?
    };

    let mut slot = spike_run_slot().lock().await;
    if slot.is_some() {
        return Err("A poll-load spike is already running — call spike_stop_poll_load first".into());
    }

    let sent = Arc::new(AtomicUsize::new(0));
    let mut tasks = Vec::with_capacity(address_count as usize);

    for i in 0..address_count {
        let address = (i % 25) as u16;
        let interval_ms = (base_interval_ms + (i as u64 * 37) % 971).max(MIN_INTERVAL_MS);
        let tx = tx.clone();
        let sent = Arc::clone(&sent);
        let name = format!("SPIKE_{i}");

        let handle = tauri::async_runtime::spawn(async move {
            let mut ticker = tokio::time::interval(std::time::Duration::from_millis(interval_ms));
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                ticker.tick().await;
                let req = DeviceRequest {
                    packet: make_read_packet(CMD_READ_REGISTER, address),
                    command: CMD_READ_REGISTER,
                    address,
                    name: Some(name.clone()),
                    emit_plot: false,
                };
                if tx.send(req).await.is_err() {
                    break; // communicator gone — exit silently, same as spawn_plot_task
                }
                sent.fetch_add(1, Ordering::Relaxed);
            }
        });
        tasks.push(handle);
    }

    let count = tasks.len();
    *slot = Some(SpikeRun {
        tasks,
        address_count,
        base_interval_ms,
        sent,
        started_at: std::time::Instant::now(),
    });

    Ok(report(format!(
        "[poll-spike] started {count} tasks across {address_count} addresses, base_interval={base_interval_ms}ms (floor {MIN_INTERVAL_MS}ms)"
    )))
}

/// Reports live task count and request throughput. Safe to call repeatedly —
/// the frontend harness polls this every couple of seconds so growth (or a
/// stall) is visible without a rebuild.
#[cfg(debug_assertions)]
#[tauri::command]
pub async fn spike_poll_load_status() -> Result<String, String> {
    let slot = spike_run_slot().lock().await;
    match slot.as_ref() {
        Some(run) => {
            let alive = run.tasks.iter().filter(|h| !h.inner().is_finished()).count();
            let sent = run.sent.load(Ordering::Relaxed);
            let elapsed = run.started_at.elapsed().as_secs_f64();
            let rate = if elapsed > 0.0 { sent as f64 / elapsed } else { 0.0 };
            Ok(report(format!(
                "[poll-spike] {alive}/{} tasks alive, {sent} requests sent in {elapsed:.1}s ({rate:.1}/s)",
                run.tasks.len()
            )))
        }
        None => Ok(report("[poll-spike] not running".into())),
    }
}

/// Re-fetches the current `communicator_tx` and respawns the same address
/// list against it. The spike's tasks (like `spawn_plot_task`'s) exit
/// silently when their channel closes on disconnect — this is the manual
/// stand-in for the real feature's `resume_poll_subscriptions`, letting the
/// checklist's reconnect item be exercised by hand: disconnect/reconnect via
/// the app's own Connect UI, then call this, and confirm the request count in
/// `spike_poll_load_status` resumes climbing rather than staying flat.
#[cfg(debug_assertions)]
#[tauri::command]
pub async fn spike_resume_poll_load(state: State<'_, AppState>) -> Result<String, String> {
    let tx = {
        let guard = state.communicator_tx.lock().await;
        guard
            .as_ref()
            .cloned()
            .ok_or("Not connected to device — reconnect first")?
    };

    let mut slot = spike_run_slot().lock().await;
    let previous = slot
        .take()
        .ok_or("No poll-load spike to resume — call spike_start_poll_load first")?;

    for task in &previous.tasks {
        task.abort();
    }

    let address_count = previous.address_count;
    let base_interval_ms = previous.base_interval_ms;
    let sent = Arc::new(AtomicUsize::new(0));
    let mut tasks = Vec::with_capacity(address_count as usize);

    for i in 0..address_count {
        let address = (i % 25) as u16;
        let interval_ms = (base_interval_ms + (i as u64 * 37) % 971).max(MIN_INTERVAL_MS);
        let tx = tx.clone();
        let sent = Arc::clone(&sent);
        let name = format!("SPIKE_{i}");

        let handle = tauri::async_runtime::spawn(async move {
            let mut ticker = tokio::time::interval(std::time::Duration::from_millis(interval_ms));
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                ticker.tick().await;
                let req = DeviceRequest {
                    packet: make_read_packet(CMD_READ_REGISTER, address),
                    command: CMD_READ_REGISTER,
                    address,
                    name: Some(name.clone()),
                    emit_plot: false,
                };
                if tx.send(req).await.is_err() {
                    break;
                }
                sent.fetch_add(1, Ordering::Relaxed);
            }
        });
        tasks.push(handle);
    }

    let count = tasks.len();
    *slot = Some(SpikeRun {
        tasks,
        address_count,
        base_interval_ms,
        sent,
        started_at: std::time::Instant::now(),
    });

    Ok(report(format!(
        "[poll-spike] resumed {count} tasks against the new connection"
    )))
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn spike_stop_poll_load() -> Result<String, String> {
    let mut slot = spike_run_slot().lock().await;
    match slot.take() {
        Some(run) => {
            let sent = run.sent.load(Ordering::Relaxed);
            let elapsed = run.started_at.elapsed().as_secs_f64();
            for task in run.tasks {
                task.abort();
            }
            Ok(report(format!(
                "[poll-spike] stopped after {elapsed:.1}s, {sent} requests sent total"
            )))
        }
        None => Ok(report("[poll-spike] not running".into())),
    }
}
