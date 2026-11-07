//! In-process event bridge. Device I/O runs on Tokio; egui never waits on it.
use crate::commands::AppState;
use crate::types::{
    CommandResponse, DeviceConnection, DiscoveredDevice, LogEntry, RegisterData, WriteAck,
};
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

const MAX_QUEUED_EVENTS: usize = 20_000;

/// Everything the backend reports to the interface.
#[derive(Debug, Clone)]
pub enum Event {
    DeviceDiscovered(DiscoveredDevice),
    ScanComplete,
    ConnectionStatus(DeviceConnection),
    Disconnected,
    /// A connect attempt finished, successfully or not.
    Idle,
    Error(String),
    Log(LogEntry),
    Register(RegisterData),
    Parameter(RegisterData),
    SysRegister(RegisterData),
    WriteAck(WriteAck),
    CommandResponse(CommandResponse),
}
impl Event {
    /// Telemetry that a newer event supersedes; everything else is a state transition.
    fn droppable(&self) -> bool {
        matches!(
            self,
            Self::Log(_) | Self::Register(_) | Self::Parameter(_) | Self::SysRegister(_)
        )
    }
}

type Notifier = Arc<dyn Fn() + Send + Sync>;

#[derive(Clone)]
pub struct AppHandle {
    state: Arc<AppState>,
    events: Arc<Mutex<VecDeque<Event>>>,
    notifier: Arc<Mutex<Option<Notifier>>>,
    /// Set from the first event after a drain until the next drain, so a burst
    /// of events wakes the interface once.
    notified: Arc<AtomicBool>,
}
impl Default for AppHandle {
    fn default() -> Self {
        Self::new()
    }
}
impl AppHandle {
    pub fn new() -> Self {
        Self {
            state: Arc::new(AppState::new()),
            events: Arc::new(Mutex::new(VecDeque::new())),
            notifier: Arc::new(Mutex::new(None)),
            notified: Arc::new(AtomicBool::new(false)),
        }
    }
    pub fn state(&self) -> &AppState {
        &self.state
    }
    /// Called (at most once per drain) when new events arrive, so the interface
    /// can repaint on demand instead of polling.
    pub fn set_notifier(&self, notify: impl Fn() + Send + Sync + 'static) {
        *self.notifier.lock().unwrap_or_else(|e| e.into_inner()) = Some(Arc::new(notify));
    }
    /// Wakes the interface for state that arrives outside the event queue.
    pub fn notify(&self) {
        let notify = self
            .notifier
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        if let Some(notify) = notify {
            notify();
        }
    }
    pub fn emit(&self, event: Event) {
        {
            let mut events = self.events.lock().unwrap_or_else(|e| e.into_inner());
            // Bound memory even when the window is minimized or rendering is stalled.
            // Only telemetry is shed: connection, acknowledgement and error events are
            // state transitions the interface cannot recover if they go missing, so
            // they stay queued in order however much telemetry arrives around them.
            if events.len() >= MAX_QUEUED_EVENTS {
                if let Some(i) = events.iter().position(Event::droppable) {
                    events.remove(i);
                }
            }
            events.push_back(event);
        }
        if !self.notified.swap(true, Ordering::AcqRel) {
            self.notify();
        }
    }
    pub fn drain(&self) -> Vec<Event> {
        self.notified.store(false, Ordering::Release);
        self.events
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .drain(..)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reading(address: u16) -> RegisterData {
        RegisterData {
            address,
            name: String::new(),
            value: 0,
            valid: true,
            timestamp: 0.,
        }
    }

    #[test]
    fn a_full_queue_sheds_telemetry_but_keeps_state_transitions() {
        let app = AppHandle::new();
        app.emit(Event::Disconnected);
        for i in 0..MAX_QUEUED_EVENTS {
            app.emit(Event::Register(reading(i as u16)));
        }
        app.emit(Event::Idle);
        let events = app.drain();
        assert_eq!(events.len(), MAX_QUEUED_EVENTS);
        assert!(matches!(events[0], Event::Disconnected));
        assert!(matches!(events.last(), Some(Event::Idle)));
    }

    #[test]
    fn a_burst_of_events_wakes_the_interface_once_per_drain() {
        let app = AppHandle::new();
        let wakes = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counter = wakes.clone();
        app.set_notifier(move || {
            counter.fetch_add(1, Ordering::Relaxed);
        });
        for i in 0..10 {
            app.emit(Event::Register(reading(i)));
        }
        assert_eq!(wakes.load(Ordering::Relaxed), 1);
        app.drain();
        app.emit(Event::Idle);
        assert_eq!(wakes.load(Ordering::Relaxed), 2);
    }
}
