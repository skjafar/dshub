//! `.scratch/rust-owned-polling` issue 03: address-keyed poll subscriptions.
//!
//! Generalises `spawn_plot_task` (`commands.rs`) — a reconnect-safe poll loop
//! keyed by plot-series name — to every address any widget currently polls,
//! reference-counted by subscriber so N widgets watching one address still
//! costs one read. This replaces `pollRegistry.ts`'s coalescing for
//! single-address widgets; issue 01's spike already proved the per-address-task
//! shape holds at the scale this needs.
//!
//! Split in two for testability. [`PollSubscriptions`] and [`fastest_interval`]
//! are pure bookkeeping — no Tokio, no Tauri — so the interval-arbitration
//! logic the whole feature depends on is unit tested in isolation. Everything
//! that actually spawns a task or touches `AppState` lives below it and is
//! exercised by hand against the emulator instead, the same split issue 01's
//! own comments describe for the rest of this feature.

use std::collections::HashMap;
use tauri::{AppHandle, Manager, State};
use tokio::sync::mpsc;
use tauri::async_runtime::JoinHandle;

use crate::commands::AppState;
use crate::communicator::{make_read_packet, DeviceRequest};
use crate::types::{CMD_READ_PARAMETER, CMD_READ_REGISTER, CMD_READ_SYS_REG};

/// Matches `pollRegistry.ts`'s existing `MIN_INTERVAL_MS` floor.
pub const MIN_INTERVAL_MS: u64 = 50;

/// The three Address Spaces a subscription can name. `sysCommand` — the
/// frontend's `DataSource` also carries this, for Commands — has no
/// addressable register to poll, so it has no place here.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DataSource {
    Register,
    Parameter,
    SysRegister,
}

impl DataSource {
    fn read_command(self) -> u16 {
        match self {
            DataSource::Register => CMD_READ_REGISTER,
            DataSource::Parameter => CMD_READ_PARAMETER,
            DataSource::SysRegister => CMD_READ_SYS_REG,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct AddressKey {
    pub source: DataSource,
    pub address: u16,
}

// ── Pure bookkeeping ──────────────────────────────────────────────────────────

/// Fastest interval any current subscriber has requested, or `None` when
/// there are no subscribers left — the address's task should stop.
/// Mirrors `pollRegistry.ts`'s `reschedule()`: the minimum across every
/// subscriber's own requested interval, not the registry's floor, which is
/// already applied at subscribe time.
pub fn fastest_interval(subscriber_intervals: &[u64]) -> Option<u64> {
    subscriber_intervals.iter().copied().min()
}

struct SubscriberInfo {
    key: AddressKey,
    interval_ms: u64,
}

struct AddressEntry {
    name: String,
    subscriber_ids: Vec<u64>,
}

/// Subscriber bookkeeping for every address any widget currently wants
/// updates for. Deliberately holds no task handles and issues no reads
/// itself — a widget's mount lifecycle owns entries here, and neither a
/// disconnect nor an explicit reconnect (`connect_device`) touches it, only
/// an explicit `unsubscribe`. That is the one deliberate difference from
/// `AppState::active_plots`, which `connect_device` clears on every fresh
/// connect: a poll subscription models "a mounted UI element wants this
/// address," which has nothing to do with which physical device answers.
#[derive(Default)]
pub struct PollSubscriptions {
    subscribers: HashMap<u64, SubscriberInfo>,
    addresses: HashMap<AddressKey, AddressEntry>,
    next_id: u64,
}

impl PollSubscriptions {
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers interest, flooring `interval_ms` at [`MIN_INTERVAL_MS`].
    /// Returns the id the frontend must hand back to `unsubscribe`.
    pub fn subscribe(&mut self, key: AddressKey, name: String, interval_ms: u64) -> u64 {
        let interval_ms = interval_ms.max(MIN_INTERVAL_MS);
        let id = self.next_id;
        self.next_id += 1;

        self.subscribers.insert(id, SubscriberInfo { key, interval_ms });
        self.addresses
            .entry(key)
            .or_insert_with(|| AddressEntry { name, subscriber_ids: Vec::new() })
            .subscriber_ids
            .push(id);

        id
    }

    /// Removes a subscription. Returns the address it belonged to, so the
    /// caller knows what to reschedule — `None` for an id that was never
    /// issued or was already removed, so a caller may unsubscribe more than
    /// once safely, matching `pollRegistry.ts`'s returned closure.
    pub fn unsubscribe(&mut self, id: u64) -> Option<AddressKey> {
        let info = self.subscribers.remove(&id)?;
        if let Some(entry) = self.addresses.get_mut(&info.key) {
            entry.subscriber_ids.retain(|&sid| sid != id);
            if entry.subscriber_ids.is_empty() {
                self.addresses.remove(&info.key);
            }
        }
        Some(info.key)
    }

    /// The fastest interval currently requested for `key`, or `None` if it
    /// has no subscribers left.
    pub fn fastest_interval_for(&self, key: AddressKey) -> Option<u64> {
        let entry = self.addresses.get(&key)?;
        let intervals: Vec<u64> = entry
            .subscriber_ids
            .iter()
            .filter_map(|id| self.subscribers.get(id))
            .map(|s| s.interval_ms)
            .collect();
        fastest_interval(&intervals)
    }

    fn name_for(&self, key: AddressKey) -> Option<String> {
        self.addresses.get(&key).map(|e| e.name.clone())
    }

    /// Every address with at least one live subscriber — what a fresh
    /// connection needs to resume polling for.
    fn active_keys(&self) -> Vec<AddressKey> {
        self.addresses.keys().copied().collect()
    }
}

// ── Task management ───────────────────────────────────────────────────────────

/// Live per-address poll tasks, paired with the interval they were spawned
/// at so a reschedule only aborts and respawns when that interval actually
/// changes rather than on every subscribe/unsubscribe.
pub type PollTasks = HashMap<AddressKey, (JoinHandle<()>, u64)>;

/// Spawns a task that reads `key`'s address every `interval_ms`. Shares the
/// same request queue and rate limiter every one-shot command goes through
/// (`commands.rs`'s `queue_request`) rather than sending straight to the
/// communicator's channel the way `spawn_plot_task`/`spawn_heartbeat` do —
/// deliberately different from that established precedent, per the design
/// this generalises: a subscription-driven read must obey the user's
/// `requestRateLimit` setting exactly like a manual read does, not bypass it
/// just because a widget triggered it instead of a click. Exits silently
/// once the channel closes; `resume_poll_subscriptions` respawns it against
/// the next connection.
fn spawn_address_poll_task(
    app: AppHandle,
    tx: mpsc::Sender<DeviceRequest>,
    key: AddressKey,
    name: String,
    interval_ms: u64,
) -> JoinHandle<()> {
    let command = key.source.read_command();
    let address = key.address;
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_millis(interval_ms));
        // A brand-new subscription reads immediately: `interval()`'s own first
        // tick fires at once rather than after one period, so no separate
        // "read now" call is needed here.
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;

            let state = app.state::<AppState>();
            state
                .rate_limiter
                .acquire(state.log_filter.request_rate_limit())
                .await;

            let req = DeviceRequest {
                packet: make_read_packet(command, address),
                command,
                address,
                name: Some(name.clone()),
                emit_plot: false,
            };
            if tx.send(req).await.is_err() {
                break; // communicator gone — exit silently
            }
        }
    })
}

/// Removes and aborts `key`'s task, if it has one. Used wherever an address
/// turns out to have nothing left to poll for — no subscribers, or no
/// connection to poll against.
async fn abort_task(state: &AppState, key: AddressKey) {
    if let Some((handle, _)) = state.poll_tasks.lock().await.remove(&key) {
        handle.abort();
    }
}

/// Spawns, respawns or stops `key`'s task so it matches its current fastest
/// requested interval. A no-op when the task is already running at the right
/// rate. When not connected, clears any stale task and leaves the address
/// unpolled — `resume_poll_subscriptions` picks it up once a connection
/// exists, so registering interest never requires one.
async fn reschedule_address(app: &AppHandle, key: AddressKey) {
    let state = app.state::<AppState>();

    let (name, fastest) = {
        let subs = state.poll_subscriptions.lock().await;
        (subs.name_for(key), subs.fastest_interval_for(key))
    };

    let Some(interval_ms) = fastest else {
        abort_task(&state, key).await;
        return;
    };

    let tx = {
        let guard = state.communicator_tx.lock().await;
        guard.as_ref().cloned()
    };
    let Some(tx) = tx else {
        abort_task(&state, key).await;
        return;
    };

    let mut tasks = state.poll_tasks.lock().await;
    if let Some((_, current_interval)) = tasks.get(&key) {
        if *current_interval == interval_ms {
            return; // already polling at the right rate
        }
    }

    if let Some((handle, _)) = tasks.remove(&key) {
        handle.abort();
    }
    let handle = spawn_address_poll_task(app.clone(), tx, key, name.unwrap_or_default(), interval_ms);
    tasks.insert(key, (handle, interval_ms));
}

/// Respawns a task for every address that still has subscribers, against a
/// freshly (re)established communicator channel. Called after both an
/// explicit connect and every successful reconnect, mirroring
/// `commands.rs`'s `resume_active_plots` — except the subscriptions being
/// resumed here were never cleared to begin with.
pub async fn resume_poll_subscriptions(app: &AppHandle, tx: &mpsc::Sender<DeviceRequest>) {
    let state = app.state::<AppState>();

    let specs: Vec<(AddressKey, String, u64)> = {
        let subs = state.poll_subscriptions.lock().await;
        subs.active_keys()
            .into_iter()
            .filter_map(|key| {
                let interval_ms = subs.fastest_interval_for(key)?;
                let name = subs.name_for(key).unwrap_or_default();
                Some((key, name, interval_ms))
            })
            .collect()
    };

    if specs.is_empty() {
        return;
    }

    let mut tasks = state.poll_tasks.lock().await;
    for (key, name, interval_ms) in specs {
        // Aborts any stale handle left over from a reconnect racing a
        // subscribe/unsubscribe — disconnect already clears these in the
        // ordinary case, so this is a defensive no-op most of the time.
        if let Some((handle, _)) = tasks.remove(&key) {
            handle.abort();
        }
        let handle = spawn_address_poll_task(app.clone(), tx.clone(), key, name, interval_ms);
        tasks.insert(key, (handle, interval_ms));
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn subscribe_address(
    source: DataSource,
    address: u16,
    name: String,
    interval_ms: u64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    let key = AddressKey { source, address };
    let id = state.poll_subscriptions.lock().await.subscribe(key, name, interval_ms);
    reschedule_address(&app, key).await;
    Ok(id)
}

#[tauri::command]
pub async fn unsubscribe_address(
    id: u64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let key = state.poll_subscriptions.lock().await.unsubscribe(id);
    if let Some(key) = key {
        reschedule_address(&app, key).await;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn register(address: u16) -> AddressKey {
        AddressKey { source: DataSource::Register, address }
    }

    #[test]
    fn fastest_interval_of_no_subscribers_is_none() {
        assert_eq!(fastest_interval(&[]), None);
    }

    #[test]
    fn fastest_interval_is_the_minimum_requested() {
        assert_eq!(fastest_interval(&[500, 100, 1000]), Some(100));
    }

    #[test]
    fn subscribing_floors_the_interval_at_the_minimum() {
        let mut subs = PollSubscriptions::new();
        subs.subscribe(register(1), "A".into(), 1);
        assert_eq!(subs.fastest_interval_for(register(1)), Some(MIN_INTERVAL_MS));
    }

    #[test]
    fn several_subscribers_to_one_address_still_produce_one_entry_at_the_fastest_rate() {
        let mut subs = PollSubscriptions::new();
        subs.subscribe(register(7), "SPEED".into(), 500);
        subs.subscribe(register(7), "SPEED".into(), 100);
        subs.subscribe(register(7), "SPEED".into(), 1000);
        assert_eq!(subs.fastest_interval_for(register(7)), Some(100));
        assert_eq!(subs.active_keys(), vec![register(7)]);
    }

    #[test]
    fn unsubscribing_reverts_the_fastest_interval_to_what_remains() {
        let mut subs = PollSubscriptions::new();
        let slow = subs.subscribe(register(3), "X".into(), 1000);
        let fast = subs.subscribe(register(3), "X".into(), 100);
        assert_eq!(subs.fastest_interval_for(register(3)), Some(100));

        let key = subs.unsubscribe(fast);
        assert_eq!(key, Some(register(3)));
        assert_eq!(subs.fastest_interval_for(register(3)), Some(1000));

        subs.unsubscribe(slow);
        assert_eq!(subs.fastest_interval_for(register(3)), None);
        assert!(subs.active_keys().is_empty());
    }

    #[test]
    fn unsubscribing_an_unknown_or_already_removed_id_is_safe() {
        let mut subs = PollSubscriptions::new();
        let id = subs.subscribe(register(1), "A".into(), 100);
        assert_eq!(subs.unsubscribe(id), Some(register(1)));
        // Unsubscribing again — a double-invoke, or a race with an in-flight
        // subscribe — must not panic and must report nothing left to reschedule.
        assert_eq!(subs.unsubscribe(id), None);
        assert_eq!(subs.unsubscribe(9999), None);
    }

    #[test]
    fn different_sources_at_the_same_numeric_address_are_distinct() {
        let sys_register_2 = AddressKey { source: DataSource::SysRegister, address: 2 };
        let mut subs = PollSubscriptions::new();
        subs.subscribe(register(2), "R".into(), 200);
        let sys_id = subs.subscribe(sys_register_2, "S".into(), 200);
        assert_eq!(subs.active_keys().len(), 2);

        // Removing one leaves the other's subscriber count untouched.
        let unsub = subs.unsubscribe(sys_id);
        assert_eq!(unsub, Some(sys_register_2));
        assert_eq!(subs.fastest_interval_for(register(2)), Some(200));
        assert_eq!(subs.fastest_interval_for(sys_register_2), None);
    }

    #[test]
    fn the_first_subscriber_names_the_address() {
        let mut subs = PollSubscriptions::new();
        subs.subscribe(register(4), "FIRST".into(), 100);
        subs.subscribe(register(4), "SECOND".into(), 100);
        assert_eq!(subs.name_for(register(4)), Some("FIRST".into()));
    }
}
