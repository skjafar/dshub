//! Resizable table columns: a double-click on a column's right divider fits
//! the column to its contents, and dragging can narrow a column to a sliver
//! but never hide it.
//!
//! egui_extras auto-sizes on a double-click too, but it looks for the
//! double-click under an id without the table's salt while the divider is
//! registered with it, so a salted table never auto-sizes; and it measures
//! the width cells used, which for clipped, right-aligned or full-width
//! cells is always the whole column. Columns here find the divider under its
//! real id and measure their own contents.
use eframe::egui;
use egui_extras::Column;

/// The narrowest a column can be dragged: thin, but visibly still there.
pub const MIN_COLUMN: f32 = 10.;
/// Room around a cell's contents.
const PADDING: f32 = 14.;

/// A resizable, clipping column `index` of the table about to be built in
/// `ui` with `id_salt`. In the frame its divider is double-clicked, its width
/// is `fit()` plus padding; the table keeps that width afterwards.
pub fn column(
    ui: &egui::Ui,
    id_salt: impl egui::AsIdSalt,
    index: usize,
    initial: f32,
    fit: impl FnOnce() -> f32,
) -> Column {
    let column = Column::initial(initial).at_least(MIN_COLUMN).clip(true);
    if divider_double_clicked(ui, id_salt, index) {
        let width = (fit() + PADDING).ceil().max(MIN_COLUMN);
        column.range(width..=width)
    } else {
        column
    }
}

/// Whether the divider after column `index` of the table in `ui` was
/// double-clicked.
fn divider_double_clicked(ui: &egui::Ui, id_salt: impl egui::AsIdSalt, index: usize) -> bool {
    ui.ctx()
        .read_response(divider_id(ui, id_salt, index))
        .is_some_and(|r| r.double_clicked())
}

/// The id egui_extras gives the resize handle after column `index`.
fn divider_id(ui: &egui::Ui, id_salt: impl egui::AsIdSalt, index: usize) -> egui::Id {
    ui.id()
        .with(egui::IdSalt::new(id_salt))
        .with("resize_column")
        .with(index)
}

/// The width of the widest of `texts` in `style`, on one line.
pub fn widest<S: Into<String>>(
    ui: &egui::Ui,
    style: egui::TextStyle,
    texts: impl IntoIterator<Item = S>,
) -> f32 {
    let font = style.resolve(ui.style());
    let painter = ui.painter();
    texts
        .into_iter()
        .map(|t| {
            painter
                .layout_no_wrap(t.into(), font.clone(), egui::Color32::PLACEHOLDER)
                .size()
                .x
        })
        .fold(0., f32::max)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Guards the id copied from egui_extras: a drawn table must have a
    /// resize handle under the id this module reads.
    #[test]
    fn divider_ids_match_the_table_resize_handles() {
        let ctx = egui::Context::default();
        let mut found = false;
        for _ in 0..3 {
            let mut output = ctx.run_ui(egui::RawInput::default(), |ui| {
                let salt = ("pane", "entries");
                let columns = [
                    column(ui, salt, 0, 80., || 0.),
                    column(ui, salt, 1, 80., || 0.),
                ];
                let mut table = egui_extras::TableBuilder::new(ui)
                    .id_salt(salt)
                    .resizable(true);
                for c in columns {
                    table = table.column(c);
                }
                table
                    .column(Column::remainder())
                    .header(20., |mut h| {
                        for _ in 0..3 {
                            h.col(|ui| {
                                ui.label("x");
                            });
                        }
                    })
                    .body(|_| {});
                found = ui.ctx().read_response(divider_id(ui, salt, 0)).is_some();
            });
            output.textures_delta.clear();
        }
        assert!(found, "no resize handle under the expected id");
    }

    /// A double-click on a divider sets that column to its measured fit.
    #[test]
    fn double_clicking_a_divider_fits_the_column() {
        let ctx = egui::Context::default();
        let salt = ("pane", "entries");
        let divider_x = std::cell::Cell::new(None);
        let frame = |events: Vec<egui::Event>, time: f64| {
            let input = egui::RawInput {
                screen_rect: Some(egui::Rect::from_min_size(
                    egui::Pos2::ZERO,
                    egui::vec2(800., 400.),
                )),
                time: Some(time),
                events,
                ..Default::default()
            };
            let mut output = ctx.run_ui(input, |ui| {
                let first = column(ui, salt, 0, 80., || 200.);
                let second = column(ui, salt, 1, 80., || 0.);
                egui_extras::TableBuilder::new(ui)
                    .id_salt(salt)
                    .resizable(true)
                    .column(first)
                    .column(second)
                    .column(Column::remainder())
                    .header(20., |mut h| {
                        for _ in 0..3 {
                            h.col(|ui| {
                                ui.label("x");
                            });
                        }
                    })
                    .body(|_| {});
                divider_x.set(
                    ui.ctx()
                        .read_response(divider_id(ui, salt, 0))
                        .map(|r| r.rect.center()),
                );
            });
            output.textures_delta.clear();
        };
        frame(vec![], 0.);
        frame(vec![], 0.1);
        let before = divider_x.get().unwrap();
        let click = |pressed| egui::Event::PointerButton {
            pos: before,
            button: egui::PointerButton::Primary,
            pressed,
            modifiers: Default::default(),
        };
        frame(vec![egui::Event::PointerMoved(before)], 0.2);
        frame(vec![click(true)], 0.25);
        frame(vec![click(false)], 0.27);
        frame(vec![click(true)], 0.3);
        frame(vec![click(false)], 0.32);
        frame(vec![], 0.4);
        frame(vec![], 0.5);
        let after = divider_x.get().unwrap();
        assert!(
            (after.x - before.x - (200. + PADDING - 80.)).abs() < 1.,
            "divider moved from {} to {}",
            before.x,
            after.x
        );
    }
}
