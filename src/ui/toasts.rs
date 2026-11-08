//! Transient messages stacked over the bottom-right of the main window.
use super::{colors, session::Session, theme};
use crate::model::Role;
use eframe::egui::{self, RichText};

pub fn show(ctx: &egui::Context, session: &mut Session) {
    let now = crate::communicator::now_ms();
    session
        .toasts
        .retain(|t| t.lifetime().is_none_or(|life| now - t.created < life));
    if session.toasts.is_empty() {
        return;
    }
    let palette = theme::palette(ctx.style().visuals.dark_mode);
    let mut dismiss = None;
    let mut undo = None;
    egui::Area::new(egui::Id::new("toasts"))
        .anchor(egui::Align2::RIGHT_BOTTOM, egui::vec2(-14., -30.))
        .order(egui::Order::Foreground)
        .interactable(true)
        .show(ctx, |ui| {
            ui.set_max_width(380.);
            for (i, toast) in session.toasts.iter().enumerate() {
                let accent = colors::role(ui, toast.role);
                egui::Frame::new()
                    .fill(palette.raised)
                    .stroke(egui::Stroke::new(1_f32, palette.ghost_strong))
                    .corner_radius(4)
                    .inner_margin(egui::Margin::symmetric(10, 8))
                    .shadow(ui.visuals().popup_shadow)
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            let marker = match toast.role {
                                Role::Error => "●",
                                Role::Warn => super::icons::WARNING,
                                Role::Ok => super::icons::CHECK,
                                _ => "●",
                            };
                            ui.label(RichText::new(marker).color(accent));
                            let text = if toast.count > 1 {
                                format!("{} (×{})", toast.text, toast.count)
                            } else {
                                toast.text.clone()
                            };
                            ui.add(
                                egui::Label::new(RichText::new(text).color(palette.text)).wrap(),
                            );
                            if ui
                                .small_button(super::icons::CLOSE)
                                .on_hover_text("Dismiss")
                                .clicked()
                            {
                                dismiss = Some(i);
                            }
                            if toast.undo.is_some() && ui.small_button("Undo").clicked() {
                                undo = Some(i);
                            }
                        });
                    });
                ui.add_space(6.);
            }
        });
    if let Some(i) = dismiss {
        session.toasts.remove(i);
    } else if let Some(i) = undo {
        session.undo = session.toasts.remove(i).undo;
    }
    // Repaint when the next toast expires.
    if let Some(remaining) = session
        .toasts
        .iter()
        .filter_map(|t| t.lifetime().map(|life| life - (now - t.created)))
        .reduce(f64::min)
    {
        ctx.request_repaint_after(std::time::Duration::from_millis(remaining.max(50.) as u64));
    }
}
