//! Small reusable controls.
use super::colors;
use crate::model::Role;
use eframe::egui;

/// How long an armed destructive button waits for its confirming click.
const ARM_SECONDS: f64 = 4.;

/// A destructive button that needs two clicks: the first arms it (it then reads
/// "Confirm …?" in the error colour), the second within a few seconds performs
/// the action. Returns true on the confirming click.
pub fn confirm_button(ui: &mut egui::Ui, id: impl std::hash::Hash, label: &str) -> bool {
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
