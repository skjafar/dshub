//! The one field for writing a register or parameter value, in panes and
//! widgets alike: Enter sends, Esc discards, and an outline says what needs
//! attention (a value not sent, a refusal, no acknowledgement, or a device
//! value that no longer matches what was sent), with the reason on hover.
use super::{
    colors,
    session::{OutcomeStatus, Session},
};
use crate::model::{DisplayFormat, Entry, Metadata, Role, Space};
use eframe::egui;

/// What a field writes, and how its text is read.
pub struct Target<'a> {
    pub space: Space,
    pub entry: &'a Entry,
    pub meta: Option<&'a Metadata>,
    pub format: DisplayFormat,
    pub confirm: bool,
    /// Text the field starts with, such as a Value Write widget's preset. It
    /// is a suggestion, so it is not outlined as unsent.
    pub initial: &'a str,
}

/// A value this field sent: its text, the raw value, and when.
#[derive(Clone, Debug, PartialEq)]
pub(super) struct Sent {
    pub text: String,
    pub raw: i32,
    pub at: f64,
}

/// Typed text and the last value sent. Kept in egui's temporary memory, never
/// in the Profile: pending operations are not persisted.
#[derive(Clone, Debug, Default)]
pub(super) struct State {
    pub text: String,
    pub sent: Option<Sent>,
}

const UNSENT: &str = "Not sent. Enter sends it; Esc discards it.";

/// Draws the field `width` wide and sends on Enter. `blocked` disables it and
/// says why on hover.
pub fn show(
    ui: &mut egui::Ui,
    session: &mut Session,
    id: egui::Id,
    target: Target,
    blocked: Option<&str>,
    width: f32,
) -> egui::Response {
    let mut state = ui
        .ctx()
        .data_mut(|d| d.get_temp::<State>(id))
        .unwrap_or_else(|| State {
            text: target.initial.to_string(),
            sent: None,
        });
    let edit = ui.add_enabled(
        blocked.is_none(),
        egui::TextEdit::singleline(&mut state.text)
            .font(egui::TextStyle::Monospace)
            .horizontal_align(egui::Align::Max)
            .desired_width(width)
            // Exactly one control tall, so the row that holds it and the
            // widget fit measured from that row contain all of it.
            .min_size(egui::vec2(0., ui.spacing().interact_size.y))
            .id(id.with("edit")),
    );
    let typing = edit.has_focus() || edit.lost_focus();
    if typing && ui.input(|i| i.key_pressed(egui::Key::Escape)) {
        state.text = state
            .sent
            .as_ref()
            .map(|s| s.text.clone())
            .unwrap_or_default();
    } else if edit.lost_focus()
        && ui.input(|i| i.key_pressed(egui::Key::Enter))
        && blocked.is_none()
        && !state.text.trim().is_empty()
    {
        let at = crate::communicator::now_ms();
        let raw = target
            .format
            .encode_with(target.entry, &state.text, target.meta);
        if session.write_formatted(
            target.space,
            target.entry,
            &state.text,
            target.format,
            target.meta,
            target.confirm,
        ) {
            if let Ok(raw) = raw {
                state.sent = Some(Sent {
                    text: state.text.clone(),
                    raw,
                    at,
                });
            }
        }
    }
    let note = attention(session, &target, &state);
    if let Some((role, _)) = &note {
        outline(ui, edit.rect, *role);
    }
    let edit = match (blocked, note) {
        (Some(reason), _) => edit.on_disabled_hover_text(reason),
        (None, Some((_, reason))) => edit.on_hover_text(reason),
        (None, None) => edit.on_hover_text("Type a value; Enter sends it"),
    };
    ui.ctx().data_mut(|d| d.insert_temp(id, state));
    edit
}

/// Outlines `rect` inside its bounds, so a table cell or card never clips it.
pub fn outline(ui: &egui::Ui, rect: egui::Rect, role: Role) {
    ui.painter().rect_stroke(
        rect,
        3.,
        egui::Stroke::new(1.5_f32, colors::role(ui, role)),
        egui::StrokeKind::Inside,
    );
}

/// Why the field is outlined, if it is.
pub(super) fn attention(
    session: &Session,
    target: &Target,
    state: &State,
) -> Option<(Role, String)> {
    let text = state.text.trim();
    if text.is_empty() {
        return None;
    }
    let unsent = Some((Role::Warn, UNSENT.to_string()));
    let Some(sent) = state.sent.as_ref().filter(|s| s.text == state.text) else {
        return if state.sent.is_none() && state.text == target.initial {
            None
        } else {
            unsent
        };
    };
    let key = (target.space, target.entry.address);
    let Some(outcome) = session.writes.get(&key).filter(|o| o.sent_at >= sent.at) else {
        // Waiting for the user to confirm it, or the confirmation was declined.
        return if session.confirm.is_some() {
            None
        } else {
            unsent
        };
    };
    let shown = |raw: i32| target.format.format_with(target.entry, raw, target.meta);
    match outcome.status {
        OutcomeStatus::Sending => None,
        OutcomeStatus::Refused => Some((
            Role::Error,
            format!("The device refused {text}. Edit it or press Enter to send again."),
        )),
        OutcomeStatus::Unknown => Some((
            Role::Warn,
            "No acknowledgement from the device; the outcome is unknown.".into(),
        )),
        OutcomeStatus::Confirmed => {
            // Only a reading taken after the device accepted the write says
            // what it holds now.
            let reading = session
                .readings
                .get(&key)
                .filter(|r| r.valid && outcome.acked_at.is_some_and(|at| r.timestamp >= at))?;
            (reading.value != sent.raw).then(|| {
                (
                    Role::Error,
                    format!(
                        "Sent {}, but the device reads {}.",
                        shown(sent.raw),
                        shown(reading.value)
                    ),
                )
            })
        }
    }
}
