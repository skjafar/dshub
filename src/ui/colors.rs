//! Semantic palette shared with client/src/design/status.ts.
use super::session::OutcomeStatus;
use crate::model::Role;
use crate::types::RegisterData;
use eframe::egui::{self, Color32};

pub fn role(ui: &egui::Ui, role: Role) -> Color32 {
    rgb(ui.visuals().dark_mode, role)
}
/// A role's colour in the dark or light theme.
pub fn rgb(dark: bool, role: Role) -> Color32 {
    let rgb = match (dark, role) {
        (true, Role::Ok) => 0x4ade80,
        (true, Role::Warn) => 0xfbbf24,
        (true, Role::Error) => 0xff6b6b,
        (true, Role::Info) => 0x38bdf8,
        (true, Role::Accent) => 0x5cd2dc,
        (true, Role::Idle) => 0x8b98a9,
        (false, Role::Ok) => 0x166534,
        (false, Role::Warn) => 0x854d0e,
        (false, Role::Error) => 0xb91c1c,
        (false, Role::Info) => 0x075985,
        (false, Role::Accent) => 0x0e6973,
        (false, Role::Idle) => 0x475569,
    };
    Color32::from_rgb((rgb >> 16) as u8, (rgb >> 8) as u8, rgb as u8)
}
pub fn badge(ui: &mut egui::Ui, role_name: Role, text: &str) {
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
pub fn reading(
    connected: bool,
    data: Option<&RegisterData>,
    interval: Option<u64>,
) -> (Role, &'static str) {
    match data {
        Some(_) if !connected => (Role::Warn, "Cached · offline"),
        Some(r) if !r.valid => (Role::Error, "Read failed"),
        Some(r)
            if interval.is_some_and(|ms| {
                crate::communicator::now_ms() - r.timestamp > (ms * 3).max(2000) as f64
            }) =>
        {
            (Role::Warn, "Stale")
        }
        Some(_) => (Role::Ok, "Read OK"),
        None if connected => (Role::Idle, "Unread"),
        None => (Role::Idle, "Offline"),
    }
}
/// A write outcome as a dot and short label, for table cells.
pub fn outcome_inline(ui: &mut egui::Ui, value: &super::session::WriteOutcome) {
    let (state, label) = match value.status {
        OutcomeStatus::Sending => (Role::Info, "Writing…"),
        OutcomeStatus::Confirmed => (Role::Ok, "Written"),
        OutcomeStatus::Refused => (Role::Error, "Refused"),
        OutcomeStatus::Unknown => (Role::Warn, "No ack"),
    };
    let color = role(ui, state);
    ui.label(egui::RichText::new("●").small().color(color));
    ui.label(egui::RichText::new(label).small().color(color))
        .on_hover_text(value.label());
}
pub fn outcome(ui: &mut egui::Ui, value: &super::session::WriteOutcome) {
    let role = match value.status {
        OutcomeStatus::Sending => Role::Info,
        OutcomeStatus::Confirmed => Role::Ok,
        OutcomeStatus::Refused => Role::Error,
        OutcomeStatus::Unknown => Role::Warn,
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
        assert_eq!(reading(true, Some(&data), Some(250)), (Role::Ok, "Read OK"));
        assert_eq!(
            reading(false, Some(&data), None),
            (Role::Warn, "Cached · offline")
        );
        data.timestamp -= 10_000.;
        assert_eq!(reading(true, Some(&data), Some(250)), (Role::Warn, "Stale"));
        // Manual snapshots do not pretend to be live, so age alone is not a failure.
        assert_eq!(reading(true, Some(&data), None), (Role::Ok, "Read OK"));
        data.valid = false;
        assert_eq!(
            reading(true, Some(&data), Some(250)),
            (Role::Error, "Read failed")
        );
        assert_eq!(reading(true, None, None), (Role::Idle, "Unread"));
    }
}
