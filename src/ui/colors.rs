//! Semantic status palette, distinguishable in both themes.
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
        (true, Role::Warn) => 0xf59e0b,
        (true, Role::Error) => 0xff6b6b,
        (true, Role::Info) => 0x38bdf8,
        (true, Role::Accent) => 0x5cd2dc,
        (true, Role::Idle) => 0x8b98a9,
        (false, Role::Ok) => 0x14532d,
        (false, Role::Warn) => 0x9a4a00,
        (false, Role::Error) => 0xb91c1c,
        (false, Role::Info) => 0x075985,
        (false, Role::Accent) => 0x0e6973,
        (false, Role::Idle) => 0x475569,
    };
    Color32::from_rgb((rgb >> 16) as u8, (rgb >> 8) as u8, rgb as u8)
}
/// A role's shape, so status never rests on hue alone: a tick, a warning
/// triangle, a cross or an "i". Idle and accent have no shape of their own.
pub fn role_glyph(role: Role) -> Option<&'static str> {
    match role {
        Role::Ok => Some(super::icons::CHECK),
        Role::Warn => Some(super::icons::WARNING),
        Role::Error => Some(super::icons::CLOSE),
        Role::Info => Some(super::icons::INFO),
        Role::Idle | Role::Accent => None,
    }
}
/// The small status mark for `role`: its shape when it reports a problem or
/// news, a plain dot when all is well or nothing is known.
pub fn mark(role: Role) -> &'static str {
    match role {
        Role::Warn | Role::Error | Role::Info => role_glyph(role).unwrap_or("●"),
        _ => "●",
    }
}
/// Extra threshold colours beyond the roles: name, the stored (dark theme)
/// value, and the value shown on the light theme.
pub const EXTRA: [(&str, [u8; 3], [u8; 3]); 4] = [
    ("Orange", [0xf9, 0x73, 0x16], [0xc2, 0x41, 0x0c]),
    ("Violet", [0xa7, 0x8b, 0xfa], [0x6d, 0x28, 0xd9]),
    ("Pink", [0xf4, 0x72, 0xb6], [0xbe, 0x18, 0x5d]),
    ("White", [0xe5, 0xe7, 0xeb], [0x1f, 0x29, 0x37]),
];
/// A stored colour as shown in the current theme: an extra colour uses its
/// light variant on the light theme; a colour from the picker is as chosen.
pub fn themed(dark: bool, stored: [u8; 3]) -> Color32 {
    let [r, g, b] = if dark {
        stored
    } else {
        EXTRA
            .iter()
            .find(|(_, preset, _)| *preset == stored)
            .map_or(stored, |(_, _, light)| *light)
    };
    Color32::from_rgb(r, g, b)
}
/// A threshold's colour: its chosen colour, else its role's.
pub fn threshold(ui: &egui::Ui, t: &crate::model::Threshold) -> Color32 {
    t.color.map_or_else(
        || role(ui, t.role),
        |stored| themed(ui.visuals().dark_mode, stored),
    )
}
/// What a user calls a role's colour.
pub fn role_name(role: Role) -> &'static str {
    match role {
        Role::Ok => "Green · ok",
        Role::Warn => "Yellow · warning",
        Role::Error => "Red · error",
        Role::Idle => "Grey · idle",
        Role::Info => "Blue · info",
        Role::Accent => "Cyan · accent",
    }
}
pub fn reading(
    connected: bool,
    data: Option<&RegisterData>,
    interval: Option<u64>,
) -> (Role, &'static str) {
    match data {
        Some(_) if !connected => (Role::Warn, "Cached · offline"),
        Some(r) if !r.valid => (Role::Error, "Read refused"),
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
    ui.label(egui::RichText::new(mark(state)).small().color(color));
    ui.label(egui::RichText::new(label).small().color(color))
        .on_hover_text(value.label());
}
pub fn outcome_role(value: &super::session::WriteOutcome) -> Role {
    match value.status {
        OutcomeStatus::Sending => Role::Info,
        OutcomeStatus::Confirmed => Role::Ok,
        OutcomeStatus::Refused => Role::Error,
        OutcomeStatus::Unknown => Role::Warn,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_colours_are_readable_and_differ_in_brightness() {
        use crate::ui::theme::{contrast, palette};
        for dark in [true, false] {
            let p = palette(dark);
            for role in [Role::Ok, Role::Warn, Role::Error, Role::Info, Role::Idle] {
                for surface in [p.surface, p.raised] {
                    assert!(
                        contrast::ratio(rgb(dark, role), surface) >= 4.5,
                        "{role:?} dark={dark}"
                    );
                }
            }
            // Green and amber must not rest on hue alone.
            let (ok, warn) = (
                contrast::luminance(rgb(dark, Role::Ok)),
                contrast::luminance(rgb(dark, Role::Warn)),
            );
            assert!((ok - warn).abs() / ok.max(warn) >= 0.2, "dark={dark}");
        }
        assert!(role_glyph(Role::Warn).is_some() && role_glyph(Role::Idle).is_none());
        // Extra colours stay visible on both themes; picked colours are kept.
        for (name, preset, _) in EXTRA {
            for dark in [true, false] {
                assert!(
                    contrast::ratio(themed(dark, preset), palette(dark).surface) >= 4.5,
                    "{name} dark={dark}"
                );
            }
        }
        assert_eq!(themed(false, [1, 2, 3]), Color32::from_rgb(1, 2, 3));
    }

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
            (Role::Error, "Read refused")
        );
        assert_eq!(reading(true, None, None), (Role::Idle, "Unread"));
    }
}
