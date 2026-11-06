//! Semantic palette shared with client/src/design/status.ts.
use super::session::{OutcomeStatus, Session};
use crate::types::RegisterData;
use eframe::egui::{self, Color32};

pub fn role(ui: &egui::Ui, role: &str) -> Color32 {
    let rgb = match (ui.visuals().dark_mode, role) {
        (true, "ok") => 0x4ade80,
        (true, "warn") => 0xfbbf24,
        (true, "error") => 0xff6b6b,
        (true, "info") => 0x38bdf8,
        (true, "accent") => 0x5cd2dc,
        (true, _) => 0x8b98a9,
        (false, "ok") => 0x166534,
        (false, "warn") => 0x854d0e,
        (false, "error") => 0xb91c1c,
        (false, "info") => 0x075985,
        (false, "accent") => 0x0e6973,
        (false, _) => 0x475569,
    };
    Color32::from_rgb((rgb >> 16) as u8, (rgb >> 8) as u8, rgb as u8)
}
pub fn badge(ui: &mut egui::Ui, role_name: &str, text: &str) {
    let color = role(ui, role_name);
    egui::Frame::new()
        .fill(color.gamma_multiply(0.10))
        .stroke(egui::Stroke::new(1_f32, color.gamma_multiply(0.5)))
        .corner_radius(4.)
        .inner_margin(egui::Margin::symmetric(6, 2))
        .show(ui, |ui| {
            ui.colored_label(color, text);
        });
}
pub fn connection(ui: &mut egui::Ui, session: &Session) {
    let (role, label) = if session.connection.as_ref().is_some_and(|c| c.reconnecting) {
        ("warn", "● Reconnecting")
    } else if session.busy {
        ("info", "● Connecting")
    } else if session.connected() {
        ("ok", "● Connected")
    } else {
        ("idle", "○ Offline")
    };
    badge(ui, role, label);
    if session.controlled() {
        badge(ui, "accent", "Control held");
    } else if session.connected() {
        badge(ui, "warn", "No control");
    }
}
pub fn reading(
    connected: bool,
    data: Option<&RegisterData>,
    interval: Option<u64>,
) -> (&'static str, &'static str) {
    match data {
        Some(_) if !connected => ("warn", "Cached · offline"),
        Some(r) if !r.valid => ("error", "Read failed"),
        Some(r)
            if interval.is_some_and(|ms| {
                crate::communicator::now_ms() - r.timestamp > (ms * 3).max(2000) as f64
            }) =>
        {
            ("warn", "Stale")
        }
        Some(_) => ("ok", "Read OK"),
        None if connected => ("idle", "Unread"),
        None => ("idle", "Offline"),
    }
}
pub fn outcome(ui: &mut egui::Ui, value: &super::session::WriteOutcome) {
    let role = match value.status {
        OutcomeStatus::Sending => "info",
        OutcomeStatus::Confirmed => "ok",
        OutcomeStatus::Refused => "error",
        OutcomeStatus::Unknown => "warn",
    };
    badge(ui, role, value.label());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cached_and_failed_reads_never_appear_healthy() {
        let mut data = RegisterData {
            address: 0,
            name: "status".into(),
            value: 0,
            valid: true,
            timestamp: crate::communicator::now_ms(),
        };
        assert_eq!(reading(true, Some(&data), Some(250)), ("ok", "Read OK"));
        assert_eq!(
            reading(false, Some(&data), None),
            ("warn", "Cached · offline")
        );
        data.timestamp -= 10_000.;
        assert_eq!(reading(true, Some(&data), Some(250)), ("warn", "Stale"));
        // Manual snapshots do not pretend to be live, so age alone is not a failure.
        assert_eq!(reading(true, Some(&data), None), ("ok", "Read OK"));
        data.valid = false;
        assert_eq!(
            reading(true, Some(&data), Some(250)),
            ("error", "Read failed")
        );
        assert_eq!(reading(true, None, None), ("idle", "Unread"));
    }
}
