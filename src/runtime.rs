//! In-process event bridge. Device I/O runs on Tokio; egui never waits on it.
use crate::commands::AppState;
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
};

#[derive(Debug, Clone)]
pub struct Event {
    pub name: String,
    pub payload: Value,
}

#[derive(Clone)]
pub struct AppHandle {
    state: Arc<AppState>,
    events: Arc<Mutex<VecDeque<Event>>>,
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
        }
    }
    pub fn state(&self) -> &AppState {
        &self.state
    }
    pub fn try_state(&self) -> Option<&AppState> {
        Some(&self.state)
    }
    pub fn emit(&self, name: &str, payload: impl Serialize) -> Result<(), String> {
        let event = Event {
            name: name.into(),
            payload: serde_json::to_value(payload).map_err(|e| e.to_string())?,
        };
        let mut events = self.events.lock().map_err(|e| e.to_string())?;
        // Bound memory even when the window is minimized or rendering is stalled.
        if events.len() >= 20_000 {
            events.pop_front();
        }
        events.push_back(event);
        Ok(())
    }
    pub fn drain(&self) -> Vec<Event> {
        self.events
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .drain(..)
            .collect()
    }
}
