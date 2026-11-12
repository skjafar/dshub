//! Small reusable controls.
use super::colors;
use crate::model::Role;
use eframe::egui;

/// How long an armed destructive button waits for its confirming click.
const ARM_SECONDS: f64 = 4.;

/// A destructive button that needs two clicks: the first arms it (it then reads
/// "Confirm …?" in the error colour), the second within a few seconds performs
/// the action. Returns true on the confirming click.
pub fn confirm_button(ui: &mut egui::Ui, id: impl egui::AsId, label: &str) -> bool {
    let id = ui.id().with(("confirm-button", id));
    let now = ui.input(|i| i.time);
    let armed = ui
        .ctx()
        .data_mut(|d| d.get_temp::<f64>(id))
        .is_some_and(|at| now - at < ARM_SECONDS);
    if armed {
        let text = egui::RichText::new(format!("Confirm {}?", label.to_lowercase()))
            .color(colors::role(ui, Role::Error));
        let clicked = ui
            .small_button(text)
            .on_hover_text("Click again to confirm. This cannot be undone.")
            .clicked();
        if clicked {
            ui.ctx().data_mut(|d| d.remove::<f64>(id));
        } else {
            // Repaint when the arm expires so the label reverts on its own.
            ui.ctx()
                .request_repaint_after(std::time::Duration::from_secs_f64(ARM_SECONDS));
        }
        clicked
    } else {
        if ui.small_button(label).clicked() {
            ui.ctx().data_mut(|d| d.insert_temp(id, now));
        }
        false
    }
}

/// The emphasised action of a view: accent fill, dark text.
pub fn primary(ui: &egui::Ui, text: &str) -> egui::Button<'static> {
    let accent = super::theme::of(ui).accent;
    let text_color = if ui.visuals().dark_mode {
        super::theme::DARK.well
    } else {
        egui::Color32::WHITE
    };
    egui::Button::new(egui::RichText::new(text).color(text_color)).fill(accent)
}

pub fn primary_button(ui: &mut egui::Ui, text: &str) -> egui::Response {
    let button = primary(ui, text);
    ui.add(button)
}

/// A compact segmented choice between a few values.
pub fn segmented<T: PartialEq + Copy>(ui: &mut egui::Ui, value: &mut T, options: &[(T, &str)]) {
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 0.;
        for (option, label) in options {
            let selected = *value == *option;
            let text = egui::RichText::new(*label);
            let button = egui::Button::new(if selected {
                text.color(super::theme::of(ui).accent)
            } else {
                text
            })
            .fill(if selected {
                ui.visuals().selection.bg_fill
            } else {
                ui.visuals().widgets.inactive.weak_bg_fill
            })
            // Reported to assistive technology as the chosen segment.
            .selected(selected);
            let response = ui.add(button);
            if selected {
                // An underline as well as colour marks the choice.
                let rect = response.rect;
                ui.painter().hline(
                    rect.x_range().shrink(3.),
                    rect.bottom() - 1.5,
                    egui::Stroke::new(2_f32, super::theme::of(ui).accent),
                );
            }
            if response.clicked() {
                *value = *option;
            }
        }
    });
}

/// A button that fires only after being held for `seconds` (pointer, or
/// Space/Enter while focused); the fill shows progress, and releasing early
/// cancels.
pub fn hold_button(ui: &mut egui::Ui, label: &str, seconds: f64) -> bool {
    let warn = colors::role(ui, Role::Warn);
    let response = ui.add(
        egui::Button::new(egui::RichText::new(label).color(warn)).min_size(egui::vec2(140., 0.)),
    );
    let id = response.id.with("hold");
    let now = ui.input(|i| i.time);
    // Held with the pointer, or with Space or Enter while focused.
    let keyed = response.has_focus()
        && ui.input(|i| i.key_down(egui::Key::Space) || i.key_down(egui::Key::Enter));
    if !(response.is_pointer_button_down_on() || keyed) {
        ui.data_mut(|d| d.remove_temp::<f64>(id));
        return false;
    }
    let start = ui.data_mut(|d| *d.get_temp_mut_or_insert_with(id, || now));
    let progress = ((now - start) / seconds).clamp(0., 1.) as f32;
    let mut fill = response.rect;
    fill.set_width(fill.width() * progress);
    ui.painter().rect_filled(
        fill,
        ui.visuals().widgets.active.corner_radius,
        warn.gamma_multiply(0.3),
    );
    if progress >= 1. {
        ui.data_mut(|d| d.remove_temp::<f64>(id));
        return true;
    }
    ui.ctx().request_repaint();
    false
}

/// The toolbar's connection summary: status dot, device and transport, and
/// whether this session holds Control.
pub fn device_chip(ui: &egui::Ui, session: &super::session::Session) -> egui::text::LayoutJob {
    use egui::text::{LayoutJob, TextFormat};
    let palette = super::theme::of(ui);
    let body = egui::TextStyle::Body.resolve(ui.style());
    let mono = egui::TextStyle::Monospace.resolve(ui.style());
    let small = egui::TextStyle::Small.resolve(ui.style());
    let (role, state) = match &session.connection {
        Some(c) if c.reconnecting => (Role::Warn, "Reconnecting"),
        _ if session.busy => (Role::Info, "Connecting"),
        Some(_) if session.connected() => (Role::Ok, ""),
        _ => (Role::Idle, "Offline"),
    };
    let mut job = LayoutJob::default();
    job.append(
        "● ",
        0.,
        TextFormat::simple(body.clone(), colors::role(ui, role)),
    );
    match session.connection.as_ref().filter(|_| state.is_empty()) {
        Some(c) => {
            if let Some(name) = &c.device_name {
                job.append(name, 0., TextFormat::simple(body.clone(), palette.text));
                job.append("  ", 0., TextFormat::simple(body.clone(), palette.text));
            }
            job.append(
                &format!("{}:{}", c.ip, c.port),
                0.,
                TextFormat::simple(mono, palette.text),
            );
            job.append(
                &format!("  {:?}", c.interface_type).to_uppercase(),
                0.,
                TextFormat::simple(small.clone(), palette.text_weak),
            );
            let (role, label) = if session.controlled() {
                (Role::Accent, "  CONTROL")
            } else {
                (Role::Warn, "  NO CONTROL")
            };
            job.append(
                label,
                0.,
                TextFormat::simple(small.clone(), colors::role(ui, role)),
            );
            if session.exposure().is_some() {
                job.append(
                    "  UNSECURED",
                    0.,
                    TextFormat::simple(small, colors::role(ui, Role::Warn)),
                );
            }
        }
        None => job.append(state, 0., TextFormat::simple(body, palette.text)),
    }
    job
}

/// Outlines a field whose value is changed but not yet saved or sent;
/// `changed` false leaves it unmarked. Returns the response for chaining.
pub fn mark_unsaved(ui: &egui::Ui, response: egui::Response, changed: bool) -> egui::Response {
    if changed {
        ui.painter().rect_stroke(
            response.rect.expand(1.),
            3.,
            egui::Stroke::new(1.5_f32, colors::role(ui, Role::Warn)),
            egui::StrokeKind::Outside,
        );
    }
    response
}

/// The line between read-only and read/write registers: subtle, but visible
/// in both themes.
pub fn access_boundary(
    painter: &egui::Painter,
    palette: &super::theme::Palette,
    x: egui::Rangef,
    y: f32,
) {
    painter.hline(
        x,
        y,
        egui::Stroke::new(1_f32, palette.text_weak.gamma_multiply(0.45)),
    );
}
