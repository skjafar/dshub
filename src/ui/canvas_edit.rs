//! Dashboard editing aids on top of `canvas_layout`: a visible snapping grid,
//! a widget selection (Ctrl/Shift-click for several), keyboard nudge and
//! delete, and layout undo/redo.
use crate::model::Widget;
use eframe::egui;
use std::collections::BTreeSet;

/// Widgets snap to this grid when dropped, resized or nudged.
pub const GRID: f32 = 8.;
/// Layout undo depth per dashboard.
const HISTORY: usize = 50;

pub fn snap(v: f32) -> f32 {
    (v / GRID).round() * GRID
}

fn selection_id() -> egui::Id {
    egui::Id::new("dashboard-selection")
}
pub fn selection(ctx: &egui::Context) -> BTreeSet<String> {
    ctx.data(|d| d.get_temp(selection_id())).unwrap_or_default()
}
pub fn set_selection(ctx: &egui::Context, selection: BTreeSet<String>) {
    ctx.data_mut(|d| d.insert_temp(selection_id(), selection));
}
/// A click on a widget: selects it alone, or with Ctrl/Shift adds or removes it.
pub fn click(ctx: &egui::Context, id: &str) {
    let mut current = selection(ctx);
    if ctx.input(|i| i.modifiers.command || i.modifiers.shift) {
        if !current.remove(id) {
            current.insert(id.to_string());
        }
    } else {
        current = BTreeSet::from([id.to_string()]);
    }
    set_selection(ctx, current);
}

fn each_mut(widgets: &mut [Widget], f: &mut impl FnMut(&mut Widget)) {
    for w in widgets {
        f(w);
        each_mut(&mut w.children, f);
    }
}

/// Rounds one widget's position and size to the grid.
pub fn snap_widget(widgets: &mut [Widget], id: &str) {
    each_mut(widgets, &mut |w| {
        if w.id == id {
            if let Some([x, y]) = w.position {
                w.position = Some([snap(x).max(0.), snap(y).max(0.)]);
            }
            w.width = snap(w.width).max(120.);
            w.height = snap(w.height).max(48.);
        }
    });
}

/// Moves the selected widgets; returns whether any moved.
pub fn nudge(widgets: &mut [Widget], ids: &BTreeSet<String>, delta: egui::Vec2) -> bool {
    let mut moved = false;
    each_mut(widgets, &mut |w| {
        if ids.contains(&w.id) {
            let [x, y] = w.position.unwrap_or([0., 0.]);
            w.position = Some([(x + delta.x).max(0.), (y + delta.y).max(0.)]);
            moved = true;
        }
    });
    moved
}

/// Removes the selected widgets wherever they are; returns how many.
pub fn remove(widgets: &mut Vec<Widget>, ids: &BTreeSet<String>) -> usize {
    let before = widgets.len();
    widgets.retain(|w| !ids.contains(&w.id));
    let mut removed = before - widgets.len();
    for w in widgets {
        removed += remove(&mut w.children, ids);
    }
    removed
}

/// Paints grid dots over the visible part of a canvas starting at `origin`.
pub fn draw_grid(ui: &egui::Ui, origin: egui::Pos2) {
    let clip = ui.clip_rect();
    let color = super::theme::of(ui).ghost_strong;
    let step = GRID * 2.;
    let first = |start: f32, from: f32| from + ((start - from) / step).ceil().max(0.) * step;
    let mut y = first(clip.top(), origin.y);
    while y <= clip.bottom() {
        let mut x = first(clip.left(), origin.x);
        while x <= clip.right() {
            ui.painter().circle_filled(egui::pos2(x, y), 0.8, color);
            x += step;
        }
        y += step;
    }
}

/// Committed layouts of one dashboard, as JSON, for undo and redo.
#[derive(Clone, Default)]
struct History {
    committed: Option<String>,
    undo: Vec<String>,
    redo: Vec<String>,
}
fn history_id(dashboard: &str) -> egui::Id {
    egui::Id::new(("layout-history", dashboard))
}

/// Records the layout once an edit is complete (no button held). Call each
/// frame while editing; cheap unless `changed_input` is set.
pub fn track(ctx: &egui::Context, dashboard: &str, widgets: &[Widget], changed_input: bool) {
    let id = history_id(dashboard);
    let mut history: History = ctx.data(|d| d.get_temp(id)).unwrap_or_default();
    let settled = !ctx.input(|i| i.pointer.any_down());
    if history.committed.is_some() && !(changed_input && settled) {
        return;
    }
    let Ok(json) = serde_json::to_string(widgets) else {
        return;
    };
    match history.committed.replace(json.clone()) {
        Some(previous) if previous != json => {
            history.undo.push(previous);
            if history.undo.len() > HISTORY {
                history.undo.remove(0);
            }
            history.redo.clear();
        }
        _ => {}
    }
    ctx.data_mut(|d| d.insert_temp(id, history));
}

/// Steps the layout back (`redo` false) or forward; returns whether it changed.
pub fn step(ctx: &egui::Context, dashboard: &str, widgets: &mut Vec<Widget>, redo: bool) -> bool {
    let id = history_id(dashboard);
    let mut history: History = ctx.data(|d| d.get_temp(id)).unwrap_or_default();
    let (from, to) = if redo {
        (&mut history.redo, &mut history.undo)
    } else {
        (&mut history.undo, &mut history.redo)
    };
    let Some(target) = from.pop() else {
        return false;
    };
    let Ok(restored) = serde_json::from_str::<Vec<Widget>>(&target) else {
        return false;
    };
    if let Some(current) = history.committed.replace(target) {
        to.push(current);
    }
    *widgets = restored;
    ctx.data_mut(|d| d.insert_temp(id, history));
    true
}

/// Whether undo / redo have anything to apply.
pub fn available(ctx: &egui::Context, dashboard: &str) -> (bool, bool) {
    let history: History = ctx
        .data(|d| d.get_temp(history_id(dashboard)))
        .unwrap_or_default();
    (!history.undo.is_empty(), !history.redo.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::WidgetKind;

    #[test]
    fn nudge_remove_snap_and_undo() {
        let ctx = egui::Context::default();
        let mut container = Widget::new(WidgetKind::Container);
        let mut child = Widget::new(WidgetKind::ValueRead);
        child.position = Some([13., 21.]);
        child.width = 203.;
        let child_id = child.id.clone();
        container.children.push(child);
        let mut widgets = vec![container, Widget::new(WidgetKind::StateLed)];
        track(&ctx, "d", &widgets, false);

        let ids = BTreeSet::from([child_id.clone()]);
        assert!(nudge(&mut widgets, &ids, egui::vec2(-20., 3.)));
        assert_eq!(widgets[0].children[0].position, Some([0., 24.]));
        snap_widget(&mut widgets, &child_id);
        assert_eq!(widgets[0].children[0].width, 200.);

        track(&ctx, "d", &widgets, true);
        assert_eq!(remove(&mut widgets, &ids), 1);
        track(&ctx, "d", &widgets, true);
        assert!(widgets[0].children.is_empty());
        assert!(step(&ctx, "d", &mut widgets, false));
        assert_eq!(widgets[0].children[0].id, child_id);
        assert!(step(&ctx, "d", &mut widgets, true));
        assert!(widgets[0].children.is_empty());
        assert_eq!(available(&ctx, "d"), (true, false));
    }
}
