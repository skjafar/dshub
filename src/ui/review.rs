use crate::model::*;
use eframe::egui;
fn count_widgets(widgets: &[Widget], p: &Profile) -> usize {
    widgets
        .iter()
        .map(|w| {
            usize::from(w.binding.as_ref().is_some_and(|b| !b.matches(p)))
                + w.rows.iter().filter(|b| !b.matches(p)).count()
                + count_widgets(&w.children, p)
        })
        .sum()
}
pub fn count(p: &Profile, series: &[PlotSeries]) -> usize {
    p.dashboards
        .iter()
        .map(|d| count_widgets(&d.widgets, p))
        .sum::<usize>()
        + series.iter().filter(|s| !s.binding.matches(p)).count()
}
fn review_widgets(ui: &mut egui::Ui, widgets: &mut [Widget], p: &Profile) {
    for w in widgets {
        ui.push_id(&w.id, |ui| {
            if let Some(b) = &mut w.binding {
                if !b.matches(p) {
                    ui.label(&w.label);
                    super::widgets::review(ui, b, p);
                }
            }
            for b in &mut w.rows {
                if !b.matches(p) {
                    ui.push_id(b.name.clone(), |ui| {
                        super::widgets::review(ui, b, p);
                    });
                }
            }
            review_widgets(ui, &mut w.children, p);
        });
    }
}
pub fn show(ui: &mut egui::Ui, p: &mut Profile, series: &mut [PlotSeries]) {
    // Lend the dashboards out so bindings are checked against the maps without
    // copying the whole Profile every frame.
    let mut dashboards = std::mem::take(&mut p.dashboards);
    let baseline = &*p;
    ui.label("Map changes can alter addresses and types. Confirm each affected binding before it can read or write again.");
    egui::ScrollArea::vertical().show(ui, |ui| {
        for d in &mut dashboards {
            ui.collapsing(&d.name, |ui| review_widgets(ui, &mut d.widgets, baseline));
        }
        for s in series {
            if !s.binding.matches(baseline) {
                ui.push_id(&s.id, |ui| {
                    ui.label("Plot series");
                    super::widgets::review(ui, &mut s.binding, baseline);
                });
            }
        }
    });
    p.dashboards = dashboards;
}
