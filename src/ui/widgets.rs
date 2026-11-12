use super::theme::{RADIUS_CARD, RADIUS_CELL, WIDGET_INSET};
use super::{canvas_edit, canvas_layout, colors};
use super::{
    session::{OutcomeStatus, Session, Undo},
    Pane,
};
use crate::model::*;
use eframe::egui::{self, Color32, RichText};

pub fn dashboard(
    ui: &mut egui::Ui,
    pane: &mut Pane,
    session: &mut Session,
    profile: &mut Profile,
    prefs: &Preferences,
) {
    if profile.dashboards.is_empty() {
        profile.dashboards.push(Dashboard {
            id: unique_id(),
            name: "Dashboard".into(),
            widgets: vec![],
        });
    }
    pane.dashboard = pane.dashboard.min(profile.dashboards.len() - 1);
    // Built-in dashboards are read-only; they are changed on a copy.
    let bundled = profile.dashboards[pane.dashboard].bundled();
    if bundled {
        pane.editing = false;
    }
    // Editing works on a draft; the Profile changes only on Save.
    let mut fresh = false;
    if pane.editing
        && pane
            .dashboard_draft
            .as_ref()
            .is_none_or(|d| d.id != profile.dashboards[pane.dashboard].id)
    {
        pane.dashboard_draft = Some(profile.dashboards[pane.dashboard].clone());
        fresh = true;
    }
    if !pane.editing {
        pane.dashboard_draft = None;
    }
    let saved = profile.dashboards[pane.dashboard].clone();
    let changes = pane
        .dashboard_draft
        .as_ref()
        .map(|d| unsaved_changes(&saved, d))
        .unwrap_or_default();
    let dirty = pane.dashboard_draft.as_ref().is_some_and(|d| *d != saved);
    let unsaved_hint = "Save or Revert the dashboard changes first";
    ui.horizontal_wrapped(|ui| {
        ui.add_enabled_ui(!dirty, |ui| {
            egui::ComboBox::from_id_salt("dashboards")
                .selected_text(
                    pane.dashboard_draft
                        .as_ref()
                        .map_or(&saved.name, |d| &d.name),
                )
                .show_ui(ui, |ui| {
                    for (i, d) in profile.dashboards.iter().enumerate() {
                        ui.selectable_value(&mut pane.dashboard, i, &d.name);
                    }
                })
                .response
                .on_disabled_hover_text(unsaved_hint);
        });
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if bundled {
                if ui
                    .button("Duplicate to edit")
                    .on_hover_text(
                        "Built-in dashboards are updated with DSHub. Make your own copy to change it.",
                    )
                    .clicked()
                {
                    profile.dashboards.push(saved.duplicate());
                    pane.dashboard = profile.dashboards.len() - 1;
                    pane.editing = true;
                }
                if profile.dashboards.len() > 1
                    && super::controls::confirm_button(ui, &saved.id, "Remove")
                {
                    profile.dashboards.remove(pane.dashboard);
                    pane.dashboard = 0;
                }
            } else {
                let mut editing = pane.editing;
                let toggle = ui.checkbox(&mut editing, "Edit dashboard");
                if editing != pane.editing {
                    if !editing && dirty {
                        session.notice = unsaved_hint.into();
                    } else {
                        pane.editing = editing;
                    }
                }
                if dirty {
                    toggle.on_hover_text(unsaved_hint);
                }
            }
            if pane.editing {
                let dashboard = &saved.id;
                let (can_undo, can_redo) = canvas_edit::available(ui.ctx(), dashboard);
                let request = egui::Id::new(("layout-step", dashboard));
                if ui
                    .add_enabled(can_redo, egui::Button::new("Redo"))
                    .on_hover_text("Ctrl+Shift+Z")
                    .clicked()
                {
                    ui.ctx().data_mut(|d| d.insert_temp(request, true));
                }
                if ui
                    .add_enabled(can_undo, egui::Button::new("Undo"))
                    .on_hover_text("Ctrl+Z")
                    .clicked()
                {
                    ui.ctx().data_mut(|d| d.insert_temp(request, false));
                }
                ui.separator();
                if ui
                    .add_enabled(dirty, egui::Button::new("Revert"))
                    .on_hover_text("Discard the unsaved dashboard changes")
                    .clicked()
                {
                    pane.dashboard_draft = Some(saved.clone());
                    canvas_edit::forget(ui.ctx(), dashboard);
                }
                let save = ui.add_enabled(
                    dirty,
                    egui::Button::new(RichText::new("Save").color(if dirty {
                        colors::role(ui, Role::Accent)
                    } else {
                        ui.visuals().weak_text_color()
                    })),
                );
                if save.clicked() || (dirty && super::save_requested(ui.ctx())) {
                    if let Some(draft) = &pane.dashboard_draft {
                        profile.dashboards[pane.dashboard] = draft.clone();
                    }
                }
                if dirty {
                    let mut summary = vec![];
                    if !changes.modified.is_empty() {
                        summary.push(format!("{} changed", changes.modified.len()));
                    }
                    if changes.removed > 0 {
                        summary.push(format!("{} removed", changes.removed));
                    }
                    if changes.renamed {
                        summary.push("renamed".to_string());
                    }
                    ui.label(
                        RichText::new(format!("Unsaved · {}", summary.join(" · ")))
                            .small()
                            .color(colors::role(ui, Role::Warn)),
                    );
                }
            }
            if !pane.editing {
                ui.checkbox(&mut pane.fit_width, "Fit width").on_hover_text(
                    "Stretch the dashboard across the pane. Text keeps its size; \
                     editing always uses the saved layout.",
                );
            }
            if bundled {
                ui.weak("Built-in dashboard");
            } else if !pane.editing {
                ui.weak("Enable Edit dashboard to arrange and configure widgets.");
            }
            if let (true, Some(draft)) = (pane.editing, pane.dashboard_draft.as_mut()) {
                ui.menu_button("Manage dashboard", |ui| {
                    let name = ui.text_edit_singleline(&mut draft.name);
                    super::controls::mark_unsaved(ui, name, changes.renamed);
                    // Adding, copying and deleting dashboards act on the saved
                    // Profile, so they wait until this draft is saved or reverted.
                    ui.add_enabled_ui(!dirty, |ui| {
                        if ui
                            .button("New")
                            .on_disabled_hover_text(unsaved_hint)
                            .clicked()
                        {
                            profile.dashboards.push(Dashboard {
                                id: unique_id(),
                                name: "Dashboard".into(),
                                widgets: vec![],
                            });
                            pane.dashboard = profile.dashboards.len() - 1;
                            ui.close();
                        }
                        if ui
                            .button("Duplicate")
                            .on_disabled_hover_text(unsaved_hint)
                            .clicked()
                        {
                            profile.dashboards.push(saved.duplicate());
                            pane.dashboard = profile.dashboards.len() - 1;
                            ui.close();
                        }
                        if profile.dashboards.len() > 1
                            && super::controls::confirm_button(ui, &saved.id, "Delete")
                        {
                            profile.dashboards.remove(pane.dashboard);
                            pane.dashboard = 0;
                            ui.close();
                        }
                        if profile.id == "cnc_motor_controller"
                            && ui.button("Add CNC panels").clicked()
                        {
                            let mut panels = default_profiles().remove(1).dashboards;
                            for panel in &mut panels {
                                panel.id = unique_id();
                            }
                            profile.dashboards.extend(panels);
                            pane.dashboard = profile.dashboards.len() - 3;
                            ui.close();
                        }
                    });
                });
                add_widget_menu(ui, &mut draft.widgets);
            }
        });
    });
    // A structural change above may have selected another dashboard.
    pane.dashboard = pane.dashboard.min(profile.dashboards.len() - 1);
    if pane
        .dashboard_draft
        .as_ref()
        .is_some_and(|d| d.id != profile.dashboards[pane.dashboard].id)
    {
        pane.dashboard_draft = Some(profile.dashboards[pane.dashboard].clone());
        fresh = true;
    }
    // Lend the widgets out (from the draft while editing) so the rest of the
    // Profile stays readable while they are edited, instead of copying the
    // whole Profile every frame.
    let dashboard_id = profile.dashboards[pane.dashboard].id.clone();
    let mut widgets = match pane.dashboard_draft.as_mut() {
        Some(draft) => std::mem::take(&mut draft.widgets),
        None => std::mem::take(&mut profile.dashboards[pane.dashboard].widgets),
    };
    ui.ctx().data_mut(|d| {
        d.insert_temp(
            egui::Id::new(UNSAVED_WIDGETS),
            std::sync::Arc::new(changes.modified.clone()),
        )
    });
    // Keep canvas geometry stable when the editing controls appear or disappear.
    ui.allocate_space(egui::vec2(0., ui.spacing().interact_size.y));
    let drag_key = ui.id().with((&dashboard_id, "dashboard-drag"));
    let previous = ui
        .ctx()
        .data_mut(|data| data.get_temp::<canvas_layout::Drag>(drag_key));
    canvas_layout::with_frame(ui.ctx(), |frame| {
        *frame = canvas_layout::Frame {
            drag: if pane.editing { previous } else { None },
            ..Default::default()
        };
    });
    ui.separator();
    egui::ScrollArea::both()
        .scroll_source(egui::scroll_area::ScrollSource {
            drag: egui::scroll_area::DragScroll::Never,
            ..Default::default()
        })
        .show(ui, |ui| {
            ui.push_id(&dashboard_id, |ui| {
                // Fit width: draw a horizontally stretched layout, then put
                // the saved geometry back exactly, so nothing drifts.
                let mut saved_geometry = vec![];
                if pane.fit_width && !pane.editing {
                    if let Some(factor) = fit_factor(&widgets, ui.available_width()) {
                        stretch(&mut widgets, factor, &mut saved_geometry);
                    }
                }
                render_grid(
                    ui,
                    &mut widgets,
                    pane.editing,
                    session,
                    profile,
                    prefs,
                    0,
                    None,
                );
                if !saved_geometry.is_empty() {
                    unstretch(&mut widgets, &mut saved_geometry.into_iter());
                }
            });
        });
    if let Some((parent, index, widget)) = session.removed_widget.take() {
        let name = if widget.label.is_empty() {
            widget.kind.title().to_string()
        } else {
            widget.label.clone()
        };
        session.removed(
            format!("Removed {name}"),
            Undo::Widget {
                profile: profile.id.clone(),
                dashboard: dashboard_id.clone(),
                parent,
                index,
                widget: Box::new(widget),
            },
        );
    }
    let frame = ui
        .ctx()
        .data_mut(|data| data.get_temp::<canvas_layout::Frame>(egui::Id::new(canvas_layout::FRAME)))
        .unwrap_or_default();
    if let Some((id, parent, before)) = &frame.resize {
        if frame.resize_released {
            if let Some(group) = frame.groups.iter().find(|g| &g.parent == parent) {
                canvas_layout::finish_resize(
                    &mut widgets,
                    id,
                    parent.as_deref(),
                    group.width,
                    *before,
                );
                canvas_edit::snap_widget(&mut widgets, id);
            }
        }
    } else if let Some(drag) = &frame.drag {
        let pointer = ui
            .input(|i| i.pointer.interact_pos())
            .unwrap_or(drag.rect.center());
        let target = canvas_layout::target(&frame, &widgets, pointer);
        let group = frame.groups.iter().find(|g| g.parent == target);
        if let Some(group) = group {
            let plan = canvas_layout::plan(
                &widgets,
                &drag.id,
                target.as_deref(),
                (pointer - group.origin).to_pos2(),
                drag.rect.min - group.origin,
                group.width,
            );
            let painter = ui
                .ctx()
                .layer_painter(egui::LayerId::new(egui::Order::Tooltip, drag_key));
            let color = colors::role(
                ui,
                if plan.valid {
                    Role::Accent
                } else {
                    Role::Error
                },
            );
            if let Some(line) = plan.line {
                painter.line_segment(
                    [
                        group.origin + line[0].to_vec2(),
                        group.origin + line[1].to_vec2(),
                    ],
                    egui::Stroke::new(3_f32, color),
                );
            } else {
                // Empty-space destination: show only the insertion edge, not displaced neighbors.
                let start = group.origin + plan.position;
                painter.line_segment(
                    [start, start + egui::vec2(drag.rect.width(), 0.)],
                    egui::Stroke::new(3_f32, color),
                );
            }
            if !plan.valid {
                painter.text(
                    drag.rect.left_top(),
                    egui::Align2::LEFT_BOTTOM,
                    "No room here",
                    egui::FontId::proportional(13.),
                    color,
                );
            }
            if frame.dropped || !ui.input(|i| i.pointer.primary_down()) {
                if canvas_layout::commit(&mut widgets, &drag.id, target.as_deref(), &plan) {
                    canvas_edit::snap_widget(&mut widgets, &drag.id);
                } else {
                    canvas_layout::restore(&mut widgets, drag);
                }
                ui.ctx()
                    .data_mut(|data| data.remove::<canvas_layout::Drag>(drag_key));
            } else {
                ui.ctx()
                    .data_mut(|data| data.insert_temp(drag_key, drag.clone()));
            }
        }
    } else {
        canvas_layout::settle(&mut widgets, None, None);
    }
    if pane.editing {
        let keyed = edit_keys(ui, session, &dashboard_id, &mut widgets);
        canvas_edit::track(
            ui.ctx(),
            &dashboard_id,
            &widgets,
            keyed || super::edited(ui.ctx()),
        );
    }
    ui.ctx().data_mut(|d| {
        d.remove::<std::sync::Arc<std::collections::HashSet<String>>>(egui::Id::new(
            UNSAVED_WIDGETS,
        ))
    });
    match pane.dashboard_draft.as_mut() {
        Some(draft) => {
            draft.widgets = widgets;
            // Drawing places unplaced widgets and bounds their sizes, as it
            // does outside edit mode; that is not an edit, so a new draft's
            // first layout is also the saved one.
            if fresh {
                profile.dashboards[pane.dashboard] = draft.clone();
            }
        }
        None => profile.dashboards[pane.dashboard].widgets = widgets,
    }
}
/// Temp-data key: ids of the widgets that differ from the saved dashboard.
const UNSAVED_WIDGETS: &str = "dashboard-unsaved-widgets";
/// How a dashboard draft differs from the saved dashboard.
#[derive(Default)]
pub(super) struct Changes {
    /// Widgets that are new, or whose own settings, geometry or container
    /// differ from the saved ones.
    pub(super) modified: std::collections::HashSet<String>,
    /// Saved widgets missing from the draft.
    pub(super) removed: usize,
    pub(super) renamed: bool,
}
pub(super) fn unsaved_changes(saved: &Dashboard, draft: &Dashboard) -> Changes {
    use std::collections::HashMap;
    // Each widget compared without its children (they are compared on their
    // own), together with the container that holds it.
    fn index<'a>(
        widgets: &'a [Widget],
        parent: Option<&'a str>,
        out: &mut HashMap<&'a str, (Option<&'a str>, &'a Widget)>,
    ) {
        for w in widgets {
            out.insert(&w.id, (parent, w));
            index(&w.children, Some(&w.id), out);
        }
    }
    let (mut before, mut after) = (HashMap::new(), HashMap::new());
    index(&saved.widgets, None, &mut before);
    index(&draft.widgets, None, &mut after);
    let own = |w: &Widget| {
        let mut w = w.clone();
        w.children.clear();
        w
    };
    let modified = after
        .iter()
        .filter(|(id, (parent, w))| {
            before
                .get(*id)
                .is_none_or(|(p, s)| p != parent || own(s) != own(w))
        })
        .map(|(id, _)| id.to_string())
        .collect();
    Changes {
        modified,
        removed: before.keys().filter(|id| !after.contains_key(*id)).count(),
        renamed: saved.name != draft.name,
    }
}
/// Whether a Dashboard pane holds edits that are not saved to the Profile.
pub fn unsaved(pane: &Pane, profile: &Profile) -> bool {
    pane.dashboard_draft
        .as_ref()
        .is_some_and(|d| profile.dashboards.iter().find(|s| s.id == d.id) != Some(d))
}
/// Keyboard editing on a dashboard: arrows nudge the selection (a grid step,
/// or one point with Alt), Delete removes it, Esc clears it, Ctrl+Z / Ctrl+Shift+Z
/// (or Ctrl+Y) undo and redo layout changes. Returns whether the layout changed.
fn edit_keys(
    ui: &mut egui::Ui,
    session: &mut Session,
    dashboard: &str,
    widgets: &mut Vec<Widget>,
) -> bool {
    let ctx = ui.ctx().clone();
    let request = egui::Id::new(("layout-step", dashboard));
    if let Some(redo) = ctx.data_mut(|d| d.remove_temp::<bool>(request)) {
        return canvas_edit::step(&ctx, dashboard, widgets, redo);
    }
    if ctx.memory(|m| m.focused().is_some()) {
        return false;
    }
    let (undo, redo) = ctx.input_mut(|i| {
        let redo = i.consume_key(
            egui::Modifiers::COMMAND | egui::Modifiers::SHIFT,
            egui::Key::Z,
        ) || i.consume_key(egui::Modifiers::COMMAND, egui::Key::Y);
        (i.consume_key(egui::Modifiers::COMMAND, egui::Key::Z), redo)
    });
    if undo || redo {
        return canvas_edit::step(&ctx, dashboard, widgets, redo);
    }
    let selected = canvas_edit::selection(&ctx);
    if selected.is_empty() {
        return false;
    }
    let fine = ctx.input(|i| i.modifiers.alt);
    let step = if fine { 1. } else { canvas_edit::GRID };
    let mut delta = egui::Vec2::ZERO;
    let mut delete = false;
    let mut clear = false;
    ctx.input_mut(|i| {
        for (key, d) in [
            (egui::Key::ArrowLeft, egui::vec2(-step, 0.)),
            (egui::Key::ArrowRight, egui::vec2(step, 0.)),
            (egui::Key::ArrowUp, egui::vec2(0., -step)),
            (egui::Key::ArrowDown, egui::vec2(0., step)),
        ] {
            let modifiers = if fine {
                egui::Modifiers::ALT
            } else {
                egui::Modifiers::NONE
            };
            if i.consume_key(modifiers, key) {
                delta += d;
            }
        }
        delete = i.consume_key(egui::Modifiers::NONE, egui::Key::Delete)
            || i.consume_key(egui::Modifiers::NONE, egui::Key::Backspace);
        clear = i.consume_key(egui::Modifiers::NONE, egui::Key::Escape);
    });
    if clear {
        canvas_edit::set_selection(&ctx, Default::default());
        return false;
    }
    if delete {
        let removed = canvas_edit::remove(widgets, &selected);
        canvas_edit::set_selection(&ctx, Default::default());
        if removed > 0 {
            session.toast(
                Role::Info,
                format!(
                    "Removed {removed} widget{}. Ctrl+Z restores.",
                    if removed == 1 { "" } else { "s" }
                ),
            );
        }
        return removed > 0;
    }
    delta != egui::Vec2::ZERO && canvas_edit::nudge(widgets, &selected, delta)
}
/// A widget's Decimal format shows engineering values for scaled entries.
fn shown(format: DisplayFormat, meta: Option<&Metadata>) -> DisplayFormat {
    if format == DisplayFormat::Decimal && meta.and_then(Metadata::scaling).is_some() {
        DisplayFormat::Native
    } else {
        format
    }
}
/// Puts a removed widget back into its container, if the dashboard and
/// container still exist.
pub fn restore(
    profiles: &mut [Profile],
    profile: &str,
    dashboard: &str,
    parent: Option<&str>,
    index: usize,
    widget: Widget,
) -> bool {
    let Some(d) = profiles
        .iter_mut()
        .find(|p| p.id == profile)
        .and_then(|p| p.dashboards.iter_mut().find(|d| d.id == dashboard))
    else {
        return false;
    };
    insert(&mut d.widgets, parent, index, widget)
}
/// Puts a removed widget back at `index` among `parent`'s children (or at the
/// top level); false when that container no longer exists.
pub fn insert(
    widgets: &mut Vec<Widget>,
    parent: Option<&str>,
    index: usize,
    widget: Widget,
) -> bool {
    fn container<'a>(widgets: &'a mut [Widget], id: &str) -> Option<&'a mut Widget> {
        for w in widgets {
            if w.id == id {
                return Some(w);
            }
            if let Some(found) = container(&mut w.children, id) {
                return Some(found);
            }
        }
        None
    }
    let siblings = match parent {
        None => widgets,
        Some(id) => match container(widgets, id) {
            Some(w) => &mut w.children,
            None => return false,
        },
    };
    siblings.insert(index.min(siblings.len()), widget);
    true
}
fn add_widget_menu(ui: &mut egui::Ui, widgets: &mut Vec<Widget>) {
    ui.menu_button("Add widget", |ui| {
        for kind in WidgetKind::ALL {
            if ui.button(kind.title()).clicked() {
                widgets.push(Widget::new(kind));
                ui.close();
            }
        }
    });
}
/// A widget's saved horizontal geometry: position and width.
type Geometry = (Option<[f32; 2]>, f32);

/// How much to stretch placed widgets so they span `available`; `None` when
/// the layout already fits or has nothing placed. Never shrinks a widget
/// below the canvas minimum width.
fn fit_factor(widgets: &[Widget], available: f32) -> Option<f32> {
    fn narrowest(widgets: &[Widget]) -> f32 {
        widgets.iter().fold(f32::INFINITY, |least, w| {
            least.min(w.width).min(narrowest(&w.children))
        })
    }
    let content = widgets
        .iter()
        .filter_map(|w| w.position.map(|p| p[0] + w.width))
        .fold(0_f32, f32::max);
    if content <= 0. {
        return None;
    }
    let least = (120. / narrowest(widgets)).min(1.);
    let factor = ((available - 2.) / content).clamp(least, 3.);
    ((factor - 1.).abs() > 0.01).then_some(factor)
}
/// Scales positions and widths by `factor`, recording the originals in
/// traversal order. A container's children scale to its new inner width.
fn stretch(widgets: &mut [Widget], factor: f32, saved: &mut Vec<Geometry>) {
    for w in widgets {
        saved.push((w.position, w.width));
        let old = w.width;
        if let Some(position) = &mut w.position {
            position[0] *= factor;
        }
        w.width = old * factor;
        if !w.children.is_empty() {
            let padding = w.padding.clamp(6., 32.) * 2.;
            let inner = if old > padding + 1. {
                (w.width - padding) / (old - padding)
            } else {
                factor
            };
            stretch(&mut w.children, inner, saved);
        }
    }
}
/// Restores the geometry [`stretch`] recorded.
fn unstretch(widgets: &mut [Widget], saved: &mut impl Iterator<Item = Geometry>) {
    for w in widgets {
        if let Some((position, width)) = saved.next() {
            // The stretched frame may have placed an unplaced widget; keep
            // its row, and its saved horizontal place.
            w.position = match (position, w.position) {
                (Some(old), Some(now)) => Some([old[0], now[1]]),
                (None, _) => None,
                (old, None) => old,
            };
            w.width = width;
        }
        unstretch(&mut w.children, saved);
    }
}

#[allow(clippy::too_many_arguments)]
fn render_grid(
    ui: &mut egui::Ui,
    widgets: &mut Vec<Widget>,
    editing: bool,
    session: &mut Session,
    profile: &Profile,
    prefs: &Preferences,
    depth: usize,
    parent: Option<&str>,
) {
    if depth > 8 {
        ui.label("Maximum container depth reached");
        return;
    }
    let origin = ui.cursor().min;
    if editing && depth == 0 {
        canvas_edit::draw_grid(ui, origin);
    }
    canvas_layout::with_frame(ui.ctx(), |frame| {
        frame.groups.push(canvas_layout::Group {
            parent: parent.map(str::to_string),
            origin,
            width: ui.available_width().max(120.),
        })
    });
    let available = ui.available_width().max(160.);
    // Only unplaced widgets are packed. Existing coordinates never reflow during edits.
    let mut cursor = egui::Vec2::ZERO;
    let mut row_height = 0_f32;
    for w in widgets.iter_mut() {
        w.width = w.width.clamp(120., 1600.);
        w.height = w.height.clamp(w.kind.min_height(), 1200.);
        if let Some([_, y]) = w.position {
            cursor.y = cursor.y.max(y + w.height + 8.);
            cursor.x = 0.;
            row_height = 0.;
        } else {
            if cursor.x > 0. && cursor.x + w.width > available {
                cursor.x = 0.;
                cursor.y += row_height + 8.;
                row_height = 0.;
            }
            w.position = Some([cursor.x, cursor.y]);
            cursor.x += w.width + 8.;
            row_height = row_height.max(w.height);
        }
    }
    let unsaved_ids = ui
        .ctx()
        .data(|d| {
            d.get_temp::<std::sync::Arc<std::collections::HashSet<String>>>(egui::Id::new(
                UNSAVED_WIDGETS,
            ))
        })
        .unwrap_or_default();
    let active_id = ui.id().with(("active-widget", depth));
    let active = ui.ctx().data_mut(|d| d.get_temp::<String>(active_id));
    let mut order: Vec<_> = (0..widgets.len()).collect();
    order.sort_by_key(|i| active.as_ref() == Some(&widgets[*i].id));
    let neighbor_sizes: Vec<_> = widgets
        .iter()
        .map(|w| (w.id.clone(), egui::vec2(w.width, w.height)))
        .collect();
    let mut remove = None;
    let mut extent = egui::vec2(available, 0.);
    for index in order {
        let w = &mut widgets[index];
        let min_height = w.kind.min_height();
        let id = ui.id().with((&w.id, "canvas"));
        let config_id = id.with("config-open");
        let mut open = editing
            && ui
                .ctx()
                .data_mut(|d| d.get_temp::<bool>(config_id).unwrap_or(false));
        let position = w.position.unwrap();
        let initial = egui::Rect::from_min_size(
            origin + egui::vec2(position[0], position[1]),
            egui::vec2(w.width, w.height),
        );
        if open {
            egui::Window::new(format!("Configure {}", w.kind.title()))
                .id(id.with("configuration"))
                .open(&mut open)
                .default_pos(initial.left_top() + egui::vec2(24., 24.))
                .default_width(320.)
                .max_height(500.)
                .vscroll(true)
                .show(ui.ctx(), |ui| {
                    ui.weak("Changes apply immediately");
                    config(ui, w, profile);
                    ui.separator();
                    if ui.button("Remove widget").clicked() {
                        remove = Some(index);
                    }
                });
        }
        let position = w.position.unwrap();
        let mut rect = egui::Rect::from_min_size(
            origin + egui::vec2(position[0], position[1]),
            egui::vec2(w.width, w.height),
        );
        // Interact before painting so pointer movement is visible in this very frame.
        if editing {
            let title = egui::Rect::from_min_max(
                rect.min + egui::vec2(30., 6.),
                egui::pos2(rect.right() - configure_width(ui) - 8., rect.top() + 26.),
            );
            let drag = ui
                .interact(title, id.with("move"), egui::Sense::click_and_drag())
                .on_hover_cursor(egui::CursorIcon::Grab)
                .on_hover_text("Drag to move · click to select (Ctrl/Shift for several)");
            if drag.clicked() {
                canvas_edit::click(ui.ctx(), &w.id);
            }
            if drag.dragged() {
                ui.ctx()
                    .data_mut(|d| d.insert_temp(active_id, w.id.clone()));
                let delta = drag.drag_delta();
                let next = rect.min - origin + delta;
                rect = egui::Rect::from_min_size(origin + next, rect.size());
                ui.ctx().set_cursor_icon(egui::CursorIcon::Grabbing);
            }
            if drag.dragged() || drag.drag_stopped() {
                canvas_layout::with_frame(ui.ctx(), |frame| {
                    let start = frame
                        .drag
                        .as_ref()
                        .filter(|d| d.id == w.id)
                        .map_or(egui::vec2(position[0], position[1]), |d| d.start);
                    frame.drag = Some(canvas_layout::Drag {
                        id: w.id.clone(),
                        parent: parent.map(str::to_string),
                        rect,
                        start,
                    });
                    frame.dropped = drag.drag_stopped();
                });
            }
            let edges = [
                (
                    egui::Rect::from_min_max(rect.min, egui::pos2(rect.left() + 5., rect.bottom())),
                    0,
                ),
                (
                    egui::Rect::from_min_max(
                        egui::pos2(rect.right() - 5., rect.top()),
                        rect.max - egui::vec2(0., 12.),
                    ),
                    1,
                ),
                (
                    egui::Rect::from_min_max(rect.min, egui::pos2(rect.right(), rect.top() + 5.)),
                    2,
                ),
                (
                    egui::Rect::from_min_max(
                        egui::pos2(rect.left(), rect.bottom() - 5.),
                        rect.max - egui::vec2(12., 0.),
                    ),
                    3,
                ),
                (
                    egui::Rect::from_min_size(
                        rect.right_bottom() - egui::vec2(12., 12.),
                        egui::vec2(12., 12.),
                    ),
                    4,
                ),
            ];
            for (hit, edge) in edges {
                let response = ui
                    .interact(hit, id.with(("resize", edge)), egui::Sense::drag())
                    .on_hover_cursor(match edge {
                        0 | 1 => egui::CursorIcon::ResizeHorizontal,
                        2 | 3 => egui::CursorIcon::ResizeVertical,
                        _ => egui::CursorIcon::ResizeNwSe,
                    });
                if response.dragged() || response.drag_stopped() {
                    let start_id = id.with("resize-before");
                    let before = ui.ctx().data_mut(|data| {
                        let before = *data
                            .get_temp_mut_or_insert_with::<egui::Rect>(start_id, || {
                                initial.translate(-origin.to_vec2())
                            });
                        if response.drag_stopped() {
                            data.remove::<egui::Rect>(start_id);
                        }
                        before
                    });
                    canvas_layout::with_frame(ui.ctx(), |frame| {
                        frame.resize = Some((w.id.clone(), parent.map(str::to_string), before));
                        frame.resize_released = response.drag_stopped();
                    });
                }
                if response.dragged() {
                    ui.ctx()
                        .data_mut(|d| d.insert_temp(active_id, w.id.clone()));
                    let raw_id = id.with("raw-resize");
                    let targets_id = id.with("resize-targets");
                    let targets = ui.ctx().data_mut(|data| {
                        if data.get_temp::<Vec<egui::Vec2>>(targets_id).is_none() {
                            let mut targets: Vec<_> = neighbor_sizes
                                .iter()
                                .filter(|(other, _)| other != &w.id)
                                .map(|(_, size)| *size)
                                .collect();
                            if let Some(content) =
                                data.get_temp::<egui::Vec2>(id.with("content-fit"))
                            {
                                targets.push(content);
                            }
                            data.insert_temp(targets_id, targets);
                        }
                        rect = data.get_temp::<egui::Rect>(raw_id).unwrap_or(rect);
                        data.get_temp::<Vec<egui::Vec2>>(targets_id).unwrap()
                    });
                    let delta = response.drag_delta();
                    match edge {
                        0 => {
                            rect.min.x = (rect.min.x + delta.x)
                                .clamp((rect.max.x - 1600.).max(origin.x), rect.max.x - 120.)
                        }
                        1 => {
                            rect.max.x =
                                (rect.max.x + delta.x).clamp(rect.min.x + 120., rect.min.x + 1600.)
                        }
                        2 => {
                            rect.min.y = (rect.min.y + delta.y)
                                .clamp((rect.max.y - 1200.).max(origin.y), rect.max.y - min_height)
                        }
                        3 => {
                            rect.max.y = (rect.max.y + delta.y)
                                .clamp(rect.min.y + min_height, rect.min.y + 1200.)
                        }
                        _ => {
                            rect.max = rect.min
                                + (rect.size() + delta)
                                    .clamp(egui::vec2(120., min_height), egui::vec2(1600., 1200.));
                        }
                    }
                    ui.ctx().data_mut(|data| data.insert_temp(raw_id, rect));
                    let size = rect.size();
                    let width = canvas_layout::soft_snap(size.x, targets.iter().map(|s| s.x))
                        .clamp(120., 1600.);
                    let height = canvas_layout::soft_snap(size.y, targets.iter().map(|s| s.y))
                        .clamp(min_height, 1200.);
                    match edge {
                        0 => rect.min.x = (rect.max.x - width).max(origin.x),
                        1 => rect.max.x = rect.min.x + width,
                        2 => rect.min.y = (rect.max.y - height).max(origin.y),
                        3 => rect.max.y = rect.min.y + height,
                        _ => rect.max = rect.min + egui::vec2(width, height),
                    }
                }
                if response.drag_stopped() {
                    ui.ctx().data_mut(|data| {
                        data.remove::<egui::Rect>(id.with("raw-resize"));
                        data.remove::<Vec<egui::Vec2>>(id.with("resize-targets"));
                    });
                }
            }
            w.position = Some([rect.left() - origin.x, rect.top() - origin.y]);
            w.width = rect.width();
            w.height = rect.height();
        }
        if w.kind == WidgetKind::Container {
            let body = egui::Rect::from_min_max(
                rect.min + egui::vec2(6., 30.),
                rect.max - egui::vec2(6., 6.),
            )
            .intersect(ui.clip_rect());
            canvas_layout::with_frame(ui.ctx(), |frame| {
                frame.containers.push((w.id.clone(), body, depth))
            });
        }
        ui.ctx().data_mut(|d| d.insert_temp(config_id, open));
        let floating =
            canvas_layout::is_dragging(ui.ctx(), &w.id) && ui.input(|i| i.pointer.primary_down());
        let layer = if floating {
            egui::LayerId::new(egui::Order::Tooltip, id.with("moving-preview"))
        } else {
            ui.layer_id()
        };
        let painter = if floating {
            ui.ctx().layer_painter(layer)
        } else {
            ui.painter().clone()
        };
        // Top-level widgets are raised cards. Inside a container the group
        // is the frame, so nested widgets draw no box of their own. A
        // frameless widget's control or text is its own boundary.
        let palette = super::theme::of(ui);
        let (fill, outline) = if floating {
            (palette.surface, palette.accent)
        } else if w.kind.frameless() || depth > 0 {
            (Color32::TRANSPARENT, Color32::TRANSPARENT)
        } else {
            (palette.raised, palette.ghost)
        };
        painter.rect(
            rect,
            RADIUS_CARD,
            fill,
            egui::Stroke::new(1_f32, outline),
            egui::StrokeKind::Inside,
        );
        // Not yet saved to the Profile: outlined as in the Map Editor. Edit
        // outlines stay inside the widget, where a container's clip cannot
        // cut them off.
        if editing && !floating && unsaved_ids.contains(&w.id) {
            painter.rect_stroke(
                rect,
                RADIUS_CARD,
                egui::Stroke::new(1.5_f32, colors::role(ui, Role::Warn)),
                egui::StrokeKind::Inside,
            );
        }
        // Every widget's content starts the same distance from its left and
        // right edges, card or not, so stacked widgets line up. Borderless
        // widgets have no vertical margin and shrink to one line; a Button
        // or Label fills its box.
        let margin = match w.kind {
            WidgetKind::Container => egui::Vec2::splat(w.padding.clamp(6., 32.)),
            WidgetKind::Button | WidgetKind::Label => egui::Vec2::ZERO,
            kind if kind.frameless() => egui::vec2(WIDGET_INSET, 0.),
            _ => egui::Vec2::splat(WIDGET_INSET),
        };
        let mut child = ui.new_child(
            egui::UiBuilder::new()
                .id_salt(id)
                .layer_id(layer)
                .max_rect(rect.shrink2(margin))
                .layout(egui::Layout::top_down(egui::Align::Min)),
        );
        child.set_clip_rect(rect.shrink2(margin.min(egui::Vec2::splat(5.))).intersect(
            if floating {
                ui.ctx().content_rect()
            } else {
                ui.clip_rect()
            },
        ));
        if (w.text_size - 1.).abs() > f32::EPSILON {
            let scale = w.text_size.clamp(0.5, 4.);
            for font in child.style_mut().text_styles.values_mut() {
                font.size *= scale;
            }
        }
        // The title row holds the label and the reading status. An empty
        // label drops it, unless the reading needs attention.
        let status = if matches!(w.kind, WidgetKind::Button | WidgetKind::Label) {
            None
        } else {
            widget_status(w, session, profile, prefs)
        };
        let titled = !matches!(w.kind, WidgetKind::Button | WidgetKind::Label)
            && (!w.label.trim().is_empty() || status.is_some_and(|(role, _)| role != Role::Ok));
        let title_top = child.cursor().top();
        if titled {
            let aside = status
                .is_some_and(|(role, _)| role == Role::Ok)
                .then(|| title_aside(w, session, profile, prefs))
                .flatten();
            child.horizontal(|ui| {
                // Group titles are semibold; a widget's own title is a quiet
                // caption at any depth.
                let title = if w.kind == WidgetKind::Container {
                    RichText::new(&w.label)
                        .family(egui::FontFamily::Name(super::fonts::SEMIBOLD.into()))
                        .color(palette.text)
                } else {
                    RichText::new(&w.label).small().color(palette.text_weak)
                };
                let caption = |ui: &mut egui::Ui| {
                    let response = ui.add(egui::Label::new(title).selectable(false).truncate());
                    if let Some((_, label)) = status {
                        response.on_hover_text(label);
                    }
                };
                let attention = status.is_some_and(|(role, _)| role != Role::Ok);
                if !attention && aside.is_none() {
                    // An empty right-to-left area would stretch the row.
                    caption(ui);
                    return;
                }
                // The status takes its place at the right first; the title
                // has what is left and shortens rather than run under it.
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    match status {
                        // A healthy reading needs no mark; anything else says why.
                        Some((role, label)) if role != Role::Ok => {
                            // A narrow widget keeps its title and shows the
                            // mark alone; the reason is in the hover text.
                            if ui.available_width() >= 160. {
                                ui.label(
                                    RichText::new(label).small().color(colors::role(ui, role)),
                                );
                            }
                            ui.label(
                                RichText::new(colors::mark(role))
                                    .small()
                                    .color(colors::role(ui, role)),
                            )
                            .on_hover_text(label);
                        }
                        _ => {
                            if let Some(text) = &aside {
                                ui.label(
                                    RichText::new(text)
                                        .small()
                                        .monospace()
                                        .color(palette.text_weak),
                                );
                            }
                        }
                    }
                    ui.with_layout(egui::Layout::left_to_right(egui::Align::Center), caption);
                });
            });
        }
        // The title row as drawn, so the fit records what the box must hold.
        let header = child.cursor().top() - title_top;
        // Overflow stays reachable by scrolling, but idle scroll bars would
        // clutter tightly sized cards.
        child.spacing_mut().scroll.dormant_handle_opacity = 0.;
        child.spacing_mut().scroll.dormant_background_opacity = 0.;
        // A Button fills exactly the widget, so it never scrolls; its fit is
        // one line of button text.
        let room = child.available_size();
        let content_size = if w.kind == WidgetKind::Button {
            render_widget(&mut child, w, editing, session, profile, prefs, depth, room);
            egui::vec2(120., child.spacing().interact_size.y)
        } else {
            egui::ScrollArea::both()
                .id_salt(id.with("content"))
                .scroll_source(egui::scroll_area::ScrollSource {
                    drag: egui::scroll_area::DragScroll::Never,
                    ..Default::default()
                })
                .max_height(child.available_height().max(1.))
                .max_width(child.available_width().max(1.))
                .show(&mut child, |ui| {
                    render_widget(ui, w, editing, session, profile, prefs, depth, room);
                })
                .content_size
        };
        let fit = if w.kind == WidgetKind::Container {
            w.children.iter().fold(egui::vec2(120., 48.), |size, c| {
                let p = c.position.unwrap_or([0., 0.]);
                size.max(egui::vec2(
                    p[0] + c.width + margin.x * 2.,
                    p[1] + c.height + margin.y * 2. + header,
                ))
            })
        } else {
            content_size + margin * 2. + egui::vec2(0., header)
        };
        ui.ctx()
            .data_mut(|data| data.insert_temp(id.with("content-fit"), fit));
        #[cfg(test)]
        fits::record(w, fit);
        if editing {
            let hovered = ui.rect_contains_pointer(rect);
            if canvas_edit::selection(ui.ctx()).contains(&w.id) {
                ui.painter().rect_stroke(
                    rect,
                    4.,
                    egui::Stroke::new(2_f32, colors::role(ui, Role::Accent)),
                    egui::StrokeKind::Inside,
                );
            }
            if hovered || open {
                ui.painter().rect_stroke(
                    rect,
                    6.,
                    egui::Stroke::new(1_f32, colors::role(ui, Role::Accent)),
                    egui::StrokeKind::Inside,
                );
                let remove_rect =
                    egui::Rect::from_min_size(rect.min + egui::vec2(6., 6.), egui::vec2(20., 22.));
                if ui
                    .put(remove_rect, egui::Button::new(super::icons::CLOSE))
                    .on_hover_text("Remove widget")
                    .clicked()
                {
                    remove = Some(index);
                }
                let width = configure_width(ui);
                let button_rect = egui::Rect::from_min_size(
                    egui::pos2(rect.right() - width - 6., rect.top() + 6.),
                    egui::vec2(width, 22.),
                );
                if ui
                    .put(button_rect, egui::Button::new("Configure"))
                    .clicked()
                {
                    ui.ctx().data_mut(|d| d.insert_temp(config_id, true));
                }
                ui.painter().line_segment(
                    [
                        rect.right_bottom() - egui::vec2(12., 4.),
                        rect.right_bottom() - egui::vec2(4., 12.),
                    ],
                    egui::Stroke::new(2_f32, colors::role(ui, Role::Accent)),
                );
            }
        }
        extent = extent.max(rect.max - origin + egui::vec2(8., 8.));
    }
    ui.allocate_space(extent);
    if let Some(i) = remove {
        session.removed_widget = Some((parent.map(str::to_owned), i, widgets.remove(i)));
    }
}
fn binding_picker(
    ui: &mut egui::Ui,
    binding: &mut Option<Binding>,
    profile: &Profile,
    writable: bool,
) {
    let text = binding
        .as_ref()
        .map(|b| format!("{} · {}", b.space.title(), b.name))
        .unwrap_or("Choose binding".into());
    let search_id = ui.id().with("binding-search");
    let mut query = ui
        .ctx()
        .data_mut(|d| d.get_temp::<String>(search_id).unwrap_or_default());
    let open_id = search_id.with("open");
    let was_open = ui
        .ctx()
        .data_mut(|d| d.get_temp::<bool>(open_id).unwrap_or(false));
    let menu = ui.menu_button(text, |ui| {
        ui.set_min_width(320.);
        let search = ui.add(
            egui::TextEdit::singleline(&mut query)
                .hint_text("Search name, address, type or space")
                .desired_width(310.),
        );
        if !was_open {
            search.request_focus();
        }
        if ui.selectable_label(binding.is_none(), "Unbound").clicked() {
            *binding = None;
            ui.close();
        }
        let filter = query.trim().to_lowercase();
        let entries: Vec<_> = Space::ALL
            .into_iter()
            .filter(|s| !writable || *s != Space::SysRegister)
            .flat_map(|s| profile.entries(s).into_iter().map(move |e| (s, e)))
            .filter(|(s, e)| {
                (!writable || e.writable)
                    && format!("{} {} {} {}", e.name, e.address, e.data_type, s.title())
                        .to_lowercase()
                        .contains(&filter)
            })
            .collect();
        ui.weak(format!(
            "{} matches · drag the bottom edge to resize",
            entries.len()
        ));
        egui::Resize::default()
            .id_salt("binding-results-size")
            .resizable([false, true])
            .default_height(260.)
            .min_height(100.)
            .max_height(600.)
            .show(ui, |ui| {
                egui::ScrollArea::vertical()
                    .auto_shrink([false, false])
                    .show_rows(ui, 24., entries.len(), |ui, range| {
                        for (space, entry) in &entries[range] {
                            let selected = binding
                                .as_ref()
                                .is_some_and(|b| b.space == *space && b.name == entry.name);
                            if ui
                                .selectable_label(
                                    selected,
                                    format!(
                                        "{} · {} · {} ({})",
                                        entry.name,
                                        space.title(),
                                        entry.address,
                                        entry.data_type
                                    ),
                                )
                                .clicked()
                            {
                                *binding = Some(Binding::new(*space, entry));
                                ui.close();
                            }
                        }
                    });
            });
    });
    ui.ctx().data_mut(|d| {
        d.insert_temp(search_id, query);
        d.insert_temp(open_id, menu.inner.is_some());
    });
}
/// The unit the map gives a bound entry, if any.
fn map_unit(binding: Option<&Binding>, profile: &Profile) -> Option<String> {
    let b = binding?;
    let e = profile.resolve(b)?;
    profile
        .metadata(b.space, &e.name)
        .map(|m| m.unit.trim().to_string())
        .filter(|u| !u.is_empty())
}
/// Fills the Unit from the map when the entry changes, or empties it when
/// the map gives none. The user may edit it afterwards.
pub(super) fn fill_unit(w: &mut Widget, profile: &Profile) {
    w.unit = map_unit(w.binding.as_ref(), profile).unwrap_or_default();
}
/// A titled group of labelled settings in two aligned columns.
fn section(ui: &mut egui::Ui, title: &str, add: impl FnOnce(&mut egui::Ui)) {
    ui.add_space(6.);
    ui.label(super::theme::caption(ui, title));
    egui::Grid::new(("config-section", title))
        .num_columns(2)
        .spacing([12., 6.])
        .min_col_width(96.)
        .show(ui, add);
}
fn config(ui: &mut egui::Ui, w: &mut Widget, profile: &Profile) {
    let bound = !matches!(
        w.kind,
        WidgetKind::DeviceInfo
            | WidgetKind::Container
            | WidgetKind::DirectionalControl
            | WidgetKind::DataTable
            | WidgetKind::AlarmList
            | WidgetKind::Label
    );
    let sends = matches!(
        w.kind,
        WidgetKind::Button
            | WidgetKind::ValueWrite
            | WidgetKind::Dropdown
            | WidgetKind::DirectionalControl
    );
    section(ui, "General", |ui| {
        if w.kind == WidgetKind::Label {
            ui.label("Text");
            ui.add(
                egui::TextEdit::multiline(&mut w.label)
                    .desired_width(240.)
                    .desired_rows(3),
            );
            ui.end_row();
            ui.label("Alignment");
            super::controls::segmented(
                ui,
                &mut w.align,
                &[
                    (TextAlign::Left, "Left"),
                    (TextAlign::Center, "Centre"),
                    (TextAlign::Right, "Right"),
                ],
            );
            ui.end_row();
            ui.label("Weight");
            super::controls::segmented(ui, &mut w.bold, &[(false, "Regular"), (true, "Semibold")]);
            ui.end_row();
            ui.label("Tone");
            super::controls::segmented(
                ui,
                &mut w.tone,
                &[
                    (TextTone::Normal, "Normal"),
                    (TextTone::Weak, "Weak"),
                    (TextTone::Accent, "Accent"),
                ],
            );
        } else {
            ui.label("Label");
            ui.add(
                egui::TextEdit::singleline(&mut w.label)
                    .hint_text("optional")
                    .desired_width(200.),
            )
            .on_hover_text("Leave empty for no title");
        }
        ui.end_row();
        ui.label("Text size");
        let mut percent = (w.text_size * 100.).round();
        if ui
            .add(
                egui::DragValue::new(&mut percent)
                    .range(50.0..=400.)
                    .speed(1.)
                    .suffix(" %"),
            )
            .changed()
        {
            w.text_size = percent / 100.;
        }
        ui.end_row();
        if matches!(w.kind, WidgetKind::ProgressBar | WidgetKind::ValueWrite) {
            ui.label("Value");
            ui.checkbox(&mut w.show_value, "Show the current value");
            ui.end_row();
        }
        match w.kind {
            WidgetKind::ProgressBar => {
                ui.label("Orientation");
                super::controls::segmented(
                    ui,
                    &mut w.vertical,
                    &[(false, "Horizontal"), (true, "Vertical")],
                );
                ui.end_row();
                ui.label("Limits");
                ui.checkbox(&mut w.show_limits, "Show minimum and maximum");
                ui.end_row();
            }
            WidgetKind::MiniPlot => {
                ui.label("Interval");
                ui.add(
                    egui::DragValue::new(&mut w.poll_ms)
                        .range(50..=5000)
                        .suffix(" ms"),
                );
                ui.end_row();
                ui.label("Time span");
                ui.add(
                    egui::DragValue::new(&mut w.time_span)
                        .range(1.0..=3600.)
                        .suffix(" s"),
                );
                ui.end_row();
            }
            WidgetKind::Container => {
                ui.label("Padding");
                ui.add(
                    egui::DragValue::new(&mut w.padding)
                        .range(0.0..=32.)
                        .suffix(" px"),
                );
                ui.end_row();
                ui.label("Spacing");
                ui.add(
                    egui::DragValue::new(&mut w.spacing)
                        .range(0.0..=32.)
                        .suffix(" px"),
                );
                ui.end_row();
                ui.label("Contents");
                add_widget_menu(ui, &mut w.children);
                ui.end_row();
            }
            WidgetKind::AlarmList => {
                ui.label("Clear alarms");
                ui.checkbox(&mut w.show_inactive, "Show");
                ui.end_row();
                ui.label("Header");
                ui.checkbox(&mut w.show_header, "Name the columns");
                ui.end_row();
            }
            WidgetKind::DataTable => {
                ui.label("Header");
                ui.checkbox(&mut w.show_header, "Name the columns");
                ui.end_row();
            }
            _ => {}
        }
    });
    if bound {
        section(ui, "Value", |ui| {
            ui.label("Entry");
            let before = w.binding.clone();
            binding_picker(
                ui,
                &mut w.binding,
                profile,
                matches!(
                    w.kind,
                    WidgetKind::Button | WidgetKind::Dropdown | WidgetKind::ValueWrite
                ),
            );
            if w.binding != before {
                fill_unit(w, profile);
            }
            ui.end_row();
            ui.label("Display");
            egui::ComboBox::from_id_salt("format")
                .selected_text(w.format.title())
                .show_ui(ui, |ui| {
                    for format in DisplayFormat::ALL {
                        ui.selectable_value(&mut w.format, format, format.title());
                    }
                });
            ui.end_row();
            if w.kind != WidgetKind::Dropdown {
                ui.label("Unit");
                let from_map = map_unit(w.binding.as_ref(), profile);
                let field = ui.add(
                    egui::TextEdit::singleline(&mut w.unit)
                        .hint_text("none")
                        .desired_width(120.),
                );
                match from_map {
                    Some(unit) => field.on_hover_text(format!(
                        "Filled from the map ({unit}) when the entry is chosen; edit it freely"
                    )),
                    None => field.on_hover_text("The map gives no unit for this entry"),
                };
                ui.end_row();
            }
            if w.kind == WidgetKind::StatusMatrix {
                ui.label("Bits");
                super::controls::segmented(
                    ui,
                    &mut w.bit_count,
                    &[(8, "8"), (16, "16"), (32, "32")],
                );
                ui.end_row();
                ui.label("A set bit is");
                super::controls::segmented(
                    ui,
                    &mut w.set_role,
                    &[
                        (Role::Ok, "OK"),
                        (Role::Warn, "Warning"),
                        (Role::Error, "Error"),
                    ],
                );
                ui.end_row();
            }
            if matches!(w.kind, WidgetKind::Gauge | WidgetKind::ProgressBar) {
                ui.label("Range");
                ui.horizontal(|ui| {
                    ui.add(typed(egui::DragValue::new(&mut w.min)).prefix("min "));
                    ui.add(typed(egui::DragValue::new(&mut w.max)).prefix("max "));
                });
                ui.end_row();
            }
            if w.kind == WidgetKind::ValueRead {
                ui.label("Scaling");
                ui.checkbox(&mut w.scaled, "Multiply by a factor")
                    .on_hover_text(
                        "Show value × factor with fixed decimals, e.g. encoder counts as mm",
                    );
                ui.end_row();
            }
            if w.kind == WidgetKind::ValueRead && w.scaled {
                ui.label("Scale factor");
                ui.add(typed(egui::DragValue::new(&mut w.factor)));
                ui.end_row();
                ui.label("Decimals");
                ui.add(egui::DragValue::new(&mut w.decimals).range(0..=9));
                ui.end_row();
                ui.label("Raw value");
                ui.horizontal(|ui| {
                    ui.checkbox(&mut w.show_raw, "Show");
                    ui.add_enabled(
                        w.show_raw,
                        egui::TextEdit::singleline(&mut w.secondary_unit)
                            .hint_text("raw unit")
                            .desired_width(80.),
                    );
                });
                ui.end_row();
            }
        });
    }
    if sends {
        section(ui, "Action", |ui| {
            if w.kind == WidgetKind::Button {
                ui.label("Style");
                super::controls::segmented(
                    ui,
                    &mut w.style,
                    &[
                        (ButtonStyle::Action, "Action"),
                        (ButtonStyle::Neutral, "Neutral"),
                        (ButtonStyle::Danger, "Danger"),
                    ],
                );
                ui.end_row();
                ui.label("Sends");
                let mut command = w.command.is_some();
                super::controls::segmented(
                    ui,
                    &mut command,
                    &[(false, "Write to entry"), (true, "Command")],
                );
                if command {
                    w.command.get_or_insert(0);
                } else {
                    w.command = None;
                }
                ui.end_row();
                if let Some(code) = &mut w.command {
                    ui.label("Command");
                    ui.horizontal(|ui| command_picker(ui, code, profile));
                    ui.end_row();
                }
            }
            if matches!(w.kind, WidgetKind::Button | WidgetKind::DirectionalControl) {
                ui.label(if w.kind == WidgetKind::Button {
                    "Value"
                } else {
                    "Command argument"
                });
                ui.add(egui::TextEdit::singleline(&mut w.value).desired_width(120.));
                ui.end_row();
            }
            ui.label("Confirmation");
            ui.checkbox(&mut w.confirm, "Ask before sending");
            ui.end_row();
        });
    }
    if w.kind == WidgetKind::DirectionalControl {
        ui.add_space(6.);
        ui.label(super::theme::caption(ui, "Directions"));
        let mut remove = None;
        for (i, d) in w.directions.iter_mut().enumerate() {
            ui.push_id(i, |ui| {
                ui.horizontal(|ui| {
                    egui::ComboBox::from_id_salt("direction")
                        .width(110.)
                        .selected_text(format!("{} {}", d.direction.arrow(), d.direction))
                        .show_ui(ui, |ui| {
                            for &direction in Direction::ALL {
                                ui.selectable_value(
                                    &mut d.direction,
                                    direction,
                                    format!("{} {direction}", direction.arrow()),
                                );
                            }
                        });
                    command_picker(ui, &mut d.command, profile);
                    ui.add(
                        egui::TextEdit::singleline(&mut d.label)
                            .hint_text("label")
                            .desired_width(80.),
                    );
                    if ui
                        .small_button(super::icons::CLOSE)
                        .on_hover_text("Remove")
                        .clicked()
                    {
                        remove = Some(i);
                    }
                });
            });
        }
        if let Some(i) = remove {
            w.directions.remove(i);
        }
        if ui.button("Add direction").clicked() {
            w.directions.push(DirectionTarget {
                direction: Direction::Up,
                command: 0,
                label: String::new(),
            });
        }
    }
    if w.kind == WidgetKind::Dropdown {
        ui.add_space(6.);
        ui.label(super::theme::caption(ui, "Options"));
        let mut remove = None;
        for (i, o) in w.options.iter_mut().enumerate() {
            ui.push_id(("option", i), |ui| {
                ui.horizontal(|ui| {
                    ui.add(
                        egui::TextEdit::singleline(&mut o.value)
                            .hint_text("value")
                            .font(egui::TextStyle::Monospace)
                            .desired_width(70.),
                    );
                    ui.add(
                        egui::TextEdit::singleline(&mut o.label)
                            .hint_text("label")
                            .desired_width(140.),
                    );
                    if ui
                        .small_button(super::icons::CLOSE)
                        .on_hover_text("Remove")
                        .clicked()
                    {
                        remove = Some(i);
                    }
                });
            });
        }
        if let Some(i) = remove {
            w.options.remove(i);
        }
        if ui.button("Add option").clicked() {
            w.options.push(ValueLabel {
                value: "0".into(),
                label: "Option".into(),
            });
        }
    }
    if matches!(w.kind, WidgetKind::DataTable | WidgetKind::AlarmList) {
        ui.add_space(6.);
        ui.label(super::theme::caption(ui, "Rows"));
    }
    if matches!(w.kind, WidgetKind::DataTable | WidgetKind::AlarmList) {
        let mut selected = None;
        ui.push_id("row-picker", |ui| {
            binding_picker(ui, &mut selected, profile, false)
        });
        if let Some(b) = selected {
            w.row_styles.insert(
                b.name.clone(),
                RowStyle {
                    label: b.name.clone(),
                    ..Default::default()
                },
            );
            w.rows.push(b);
        }
        let mut remove = None;
        for (i, b) in w.rows.iter().enumerate() {
            ui.push_id(i, |ui| {
                ui.horizontal(|ui| {
                    ui.label(&b.name);
                    if ui.small_button(super::icons::CLOSE).clicked() {
                        remove = Some(i);
                    }
                });
                ui.collapsing("Row display and thresholds", |ui| {
                    let style = w
                        .row_styles
                        .entry(b.name.clone())
                        .or_insert_with(|| RowStyle {
                            label: b.name.clone(),
                            ..Default::default()
                        });
                    ui.text_edit_singleline(&mut style.label);
                    egui::ComboBox::from_id_salt("row-format")
                        .selected_text(style.format.title())
                        .show_ui(ui, |ui| {
                            for format in DisplayFormat::ALL {
                                ui.selectable_value(&mut style.format, format, format.title());
                            }
                        });
                    thresholds_editor(ui, &mut style.thresholds, "Add row condition");
                });
            });
        }
        if let Some(i) = remove {
            w.rows.remove(i);
        }
    }
    if !matches!(
        w.kind,
        WidgetKind::Container | WidgetKind::DeviceInfo | WidgetKind::Label | WidgetKind::Button
    ) {
        ui.add_space(6.);
        egui::CollapsingHeader::new(super::theme::caption(ui, "Thresholds and state labels"))
            .default_open(!w.thresholds.is_empty())
            .show(ui, |ui| {
                thresholds_editor(ui, &mut w.thresholds, "Add threshold");
            });
    }
    ui.add_space(6.);
    egui::CollapsingHeader::new(super::theme::caption(ui, "Size and position")).show(ui, |ui| {
        egui::Grid::new("geometry")
            .num_columns(4)
            .spacing([8., 6.])
            .show(ui, |ui| {
                ui.label("Width");
                ui.add(
                    egui::DragValue::new(&mut w.width)
                        .range(120.0..=1600.)
                        .suffix(" px"),
                );
                ui.label("Height");
                ui.add(
                    egui::DragValue::new(&mut w.height)
                        .range(w.kind.min_height()..=1200.)
                        .suffix(" px"),
                );
                ui.end_row();
                if let Some(position) = &mut w.position {
                    ui.label("X");
                    ui.add(
                        egui::DragValue::new(&mut position[0])
                            .range(0.0..=100000.)
                            .suffix(" px"),
                    );
                    ui.label("Y");
                    ui.add(
                        egui::DragValue::new(&mut position[1])
                            .range(0.0..=100000.)
                            .suffix(" px"),
                    );
                    ui.end_row();
                }
            });
    });
}
/// Edits threshold rules with constrained choices, so a rule can never hold a
/// comparator or colour role that silently fails to apply.
fn thresholds_editor(ui: &mut egui::Ui, thresholds: &mut Vec<Threshold>, add_label: &str) {
    let mut remove = None;
    for (i, t) in thresholds.iter_mut().enumerate() {
        ui.push_id(i, |ui| {
            ui.horizontal(|ui| {
                egui::ComboBox::from_id_salt("op")
                    .width(48.)
                    .selected_text(t.op)
                    .show_ui(ui, |ui| {
                        for &op in Comparator::ALL {
                            ui.selectable_value(&mut t.op, op, op);
                        }
                    });
                ui.add(typed(egui::DragValue::new(&mut t.value)));
                colour_choice(ui, t);
                if ui.small_button(super::icons::CLOSE).on_hover_text("Remove rule").clicked() {
                    remove = Some(i);
                }
            });
            ui.add(egui::TextEdit::singleline(&mut t.label).hint_text("Optional state label (e.g. Over limit)"))
                .on_hover_text("Shown by state LEDs and alarm lists. Numeric widgets take the colour and keep showing the number.");
        });
    }
    if let Some(i) = remove {
        thresholds.remove(i);
    }
    if ui.button(add_label).clicked() {
        thresholds.push(Threshold::new(Comparator::Gt, 0., Role::Warn, ""));
    }
}
/// A swatch for one threshold's colour. It opens the status colours (which
/// follow the theme), a few extra colours, and a picker for any colour.
fn colour_choice(ui: &mut egui::Ui, t: &mut Threshold) {
    let current = colors::threshold(ui, t);
    let name = |t: &Threshold| match t.color {
        None => colors::role_name(t.role).to_string(),
        Some([r, g, b]) => colors::EXTRA
            .iter()
            .find(|(_, c, _)| *c == [r, g, b])
            .map_or(format!("#{r:02x}{g:02x}{b:02x}"), |(n, _, _)| n.to_string()),
    };
    let size = egui::vec2(40., ui.spacing().interact_size.y);
    let response = swatch(ui, current, size, false).on_hover_text(name(t));
    egui::Popup::from_toggle_button_response(&response)
        .close_behavior(egui::PopupCloseBehavior::CloseOnClickOutside)
        .show(|ui| {
            ui.spacing_mut().item_spacing = egui::vec2(6., 6.);
            ui.weak("Status colours follow the theme");
            ui.horizontal(|ui| {
                for role in Role::THRESHOLD {
                    let chosen = t.color.is_none() && t.role == role;
                    if swatch(ui, colors::role(ui, role), egui::vec2(28., 22.), chosen)
                        .on_hover_text(colors::role_name(role))
                        .clicked()
                    {
                        t.role = role;
                        t.color = None;
                    }
                }
            });
            ui.horizontal(|ui| {
                for (label, rgb, _) in colors::EXTRA {
                    if swatch(
                        ui,
                        colors::themed(ui.visuals().dark_mode, rgb),
                        egui::vec2(28., 22.),
                        t.color == Some(rgb),
                    )
                    .on_hover_text(label)
                    .clicked()
                    {
                        t.color = Some(rgb);
                    }
                }
            });
            ui.separator();
            ui.weak("Any colour");
            let mut picked = current;
            if egui::color_picker::color_picker_color32(
                ui,
                &mut picked,
                egui::color_picker::Alpha::Opaque,
            ) {
                t.color = Some([picked.r(), picked.g(), picked.b()]);
            }
        });
}
/// A clickable colour sample, outlined when `chosen`.
fn swatch(ui: &mut egui::Ui, color: Color32, size: egui::Vec2, chosen: bool) -> egui::Response {
    let palette = super::theme::of(ui);
    let (rect, response) = ui.allocate_exact_size(size, egui::Sense::click());
    let stroke = if chosen || response.hovered() {
        egui::Stroke::new(2_f32, palette.accent)
    } else {
        egui::Stroke::new(1_f32, palette.ghost)
    };
    ui.painter()
        .rect(rect.shrink(2.), 3, color, stroke, egui::StrokeKind::Outside);
    response.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, true, "Colour"));
    response
}
/// A number that changes only by typing: thresholds, limits and command
/// codes must not move with an accidental drag.
pub(super) fn typed(value: egui::DragValue<'_>) -> egui::DragValue<'_> {
    value.speed(0.)
}
pub(super) fn review(ui: &mut egui::Ui, b: &mut Binding, profile: &Profile) -> bool {
    if b.matches(profile) {
        return true;
    }
    let palette = super::theme::of(ui);
    ui.horizontal_wrapped(|ui| {
        ui.label(
            RichText::new("▲ Needs review")
                .small()
                .color(colors::role(ui, Role::Warn)),
        );
        ui.label(
            RichText::new(format!("{} was at address {}", b.name, b.address))
                .small()
                .color(palette.text_weak),
        );
    });
    ui.horizontal_wrapped(|ui| {
        if let Some(e) = profile.resolve(b) {
            if ui
                .button(format!("Follow {} to {}", e.name, e.address))
                .on_hover_text("Keep the entry; use its new address")
                .clicked()
            {
                *b = Binding::new(b.space, &e);
            }
        }
        if let Some(e) = profile.entry_at(b.space, b.address) {
            if ui
                .button(format!("Keep address: bind {}", e.name))
                .on_hover_text("Keep the address; use whatever entry is there now")
                .clicked()
            {
                *b = Binding::new(b.space, &e);
            }
        }
    });
    false
}
/// `room` is the space the widget's box offers its content.
#[allow(clippy::too_many_arguments)]
fn render_widget(
    ui: &mut egui::Ui,
    w: &mut Widget,
    editing: bool,
    session: &mut Session,
    profile: &Profile,
    prefs: &Preferences,
    depth: usize,
    room: egui::Vec2,
) {
    let scale = w.text_size.clamp(0.5, 4.);
    if w.kind == WidgetKind::Label {
        let palette = super::theme::of(ui);
        let color = match w.tone {
            TextTone::Normal => palette.text,
            TextTone::Weak => palette.text_weak,
            TextTone::Accent => palette.accent,
        };
        let mut text = RichText::new(&w.label).color(color);
        if w.bold {
            text = text.family(egui::FontFamily::Name(super::fonts::SEMIBOLD.into()));
        }
        let align = match w.align {
            TextAlign::Left => egui::Align::Min,
            TextAlign::Center => egui::Align::Center,
            TextAlign::Right => egui::Align::Max,
        };
        ui.with_layout(
            egui::Layout::top_down(align).with_cross_justify(false),
            |ui| {
                ui.add(
                    egui::Label::new(text)
                        .wrap()
                        .halign(align)
                        .selectable(false),
                );
            },
        );
        return;
    }
    if w.kind == WidgetKind::Container {
        ui.scope(|ui| {
            ui.spacing_mut().item_spacing = egui::vec2(w.spacing, w.spacing);
            render_grid(
                ui,
                &mut w.children,
                editing,
                session,
                profile,
                prefs,
                depth + 1,
                Some(&w.id),
            );
        });
        return;
    }
    if w.kind == WidgetKind::DeviceInfo {
        let palette = super::theme::of(ui);
        let Some(c) = &session.connection else {
            ui.label(RichText::new("Not connected").color(palette.text_weak));
            return;
        };
        let (role, state) = if c.reconnecting {
            (Role::Warn, "Reconnecting")
        } else if session.connected() {
            (Role::Ok, "Connected")
        } else {
            (Role::Idle, "Offline")
        };
        egui::Grid::new("device-info")
            .num_columns(2)
            .spacing([12., 3.])
            .show(ui, |ui| {
                let key = |ui: &mut egui::Ui, text: &str| {
                    ui.label(RichText::new(text).small().color(palette.text_weak));
                };
                key(ui, "State");
                ui.horizontal(|ui| {
                    ui.label(RichText::new(colors::mark(role)).color(colors::role(ui, role)));
                    ui.label(state);
                });
                ui.end_row();
                if let Some(name) = &c.device_name {
                    key(ui, "Device");
                    ui.label(name);
                    ui.end_row();
                }
                key(ui, "Address");
                ui.monospace(format!("{}:{}", c.ip, c.port));
                ui.end_row();
                key(ui, "Control");
                if session.controlled() {
                    ui.label(RichText::new("This session").color(colors::role(ui, Role::Accent)));
                } else {
                    ui.label(
                        RichText::new(super::session::control_interface_name(
                            c.control_state as i32,
                        ))
                        .color(colors::role(ui, Role::Warn)),
                    );
                }
                ui.end_row();
            });
        return;
    }
    if matches!(w.kind, WidgetKind::DataTable | WidgetKind::AlarmList) {
        // Aligned columns: status mark, name, value, unit, and for writable
        // table rows an input with its Write button and outcome.
        let palette = super::theme::of(ui);
        // When every row shares one status, the title says it once and the
        // rows carry only the mark.
        let shared = table_status(w, session, profile, prefs);
        let blocked_reason = blocked(session, editing, true);
        // With every row healthy there is nothing to mark: the column goes.
        let marks = shared.is_none_or(|(role, _)| role != Role::Ok);
        egui::Grid::new(ui.id().with("rows"))
            .num_columns(if marks { 6 } else { 5 })
            .spacing(egui::vec2(6., 4.))
            .show(ui, |ui| {
                if w.show_header {
                    let caption = |ui: &mut egui::Ui, text: &str| {
                        ui.label(RichText::new(text).small().color(palette.text_weak));
                    };
                    if marks {
                        caption(ui, "");
                    }
                    caption(ui, "Name");
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        caption(ui, "Value")
                    });
                    caption(ui, "Unit");
                    ui.end_row();
                }
                for b in &mut w.rows {
                    {
                        if !review(ui, b, profile) {
                            continue;
                        }
                        session.interest(b, profile, prefs.poll_ms);
                        let e = profile.entry_at(b.space, b.address).unwrap();
                        let r = session
                            .readings
                            .get(&(b.space, b.address))
                            .filter(|r| r.valid)
                            .cloned();
                        let meta = profile.metadata(b.space, &e.name);
                        let value = r.as_ref().map(|r| e.engineering(r.value, meta));
                        let style = w.row_styles.get(&b.name);
                        let rules = style
                            .map(|s| s.thresholds.as_slice())
                            .unwrap_or(&w.thresholds);
                        let rule = value.and_then(|v| rules.iter().find(|t| t.matches(v)));
                        if w.kind == WidgetKind::AlarmList
                            && !w.show_inactive
                            && value.is_some()
                            && !rule.is_some_and(|r| r.role == Role::Warn || r.role == Role::Error)
                        {
                            continue;
                        }
                        let color = rule
                            .map(|r| colors::threshold(ui, r))
                            .unwrap_or(palette.text);
                        let (role, label) = colors::reading(
                            session.connected(),
                            session.readings.get(&(b.space, b.address)),
                            Some(prefs.poll_ms),
                        );
                        // A healthy row needs no mark; anything else is marked,
                        // and says why unless the title already did.
                        if marks {
                            ui.horizontal(|ui| {
                                if role != Role::Ok {
                                    ui.label(
                                        RichText::new(colors::mark(role))
                                            .small()
                                            .color(colors::role(ui, role)),
                                    )
                                    .on_hover_text(label);
                                    if shared.is_none() {
                                        ui.label(
                                            RichText::new(label)
                                                .small()
                                                .color(colors::role(ui, role)),
                                        );
                                    }
                                }
                            });
                        }
                        let name = style.map(|s| s.label.as_str()).unwrap_or(&b.name);
                        ui.label(RichText::new(name).color(palette.text_weak));
                        let format = shown(style.map(|s| s.format).unwrap_or(w.format), meta);
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            // An alarm's state label says more than its number.
                            let text = match rule.filter(|r| {
                                w.kind == WidgetKind::AlarmList && !r.label.trim().is_empty()
                            }) {
                                Some(r) => r.label.clone(),
                                None => r
                                    .as_ref()
                                    .map(|r| {
                                        group(prefs, format, format.format_with(&e, r.value, meta))
                                    })
                                    .unwrap_or("—".into()),
                            };
                            ui.label(RichText::new(text).monospace().color(color));
                        });
                        ui.label(
                            RichText::new(meta.map(|m| m.unit.as_str()).unwrap_or_default())
                                .small()
                                .color(palette.text_weak),
                        );
                        if w.kind == WidgetKind::DataTable
                            && e.writable
                            && b.space != Space::SysRegister
                        {
                            let id = ui.id().with(("value", &b.name));
                            let edit_id = id.with("edit");
                            let mut input = ui
                                .ctx()
                                .data_mut(|d| d.get_temp::<String>(id).unwrap_or_default());
                            // The input and Write button appear on the hovered
                            // row, or while a value is being entered; their
                            // cells stay allocated so the columns hold still.
                            let size = egui::vec2(64., ui.spacing().interact_size.y);
                            let row_hovered = ui
                                .ctx()
                                .data_mut(|d| d.get_temp::<bool>(id.with("hovered")))
                                .unwrap_or(false);
                            let focused = ui.memory(|m| m.has_focus(edit_id));
                            let outcome = session.writes.get(&(b.space, b.address)).cloned();
                            let active = row_hovered || focused || !input.is_empty();
                            let mut hovered = false;
                            if active {
                                let edit = ui.add_sized(
                                    size,
                                    egui::TextEdit::singleline(&mut input)
                                        .font(egui::TextStyle::Monospace)
                                        .id(edit_id),
                                );
                                hovered |= edit.hovered();
                                let submit = edit.lost_focus()
                                    && ui.input(|i| i.key_pressed(egui::Key::Enter));
                                let button = ui
                                    .horizontal(|ui| {
                                        ui.spacing_mut().item_spacing.x = 4.;
                                        let button = ui
                                            .add_enabled(
                                                blocked_reason.is_none(),
                                                styled(ui, "Write", ButtonStyle::Action, false),
                                            )
                                            .on_disabled_hover_text(
                                                blocked_reason.unwrap_or_default(),
                                            );
                                        outcome_mark(ui, outcome.as_ref());
                                        button
                                    })
                                    .inner;
                                hovered |= button.hovered();
                                if (button.clicked() || submit) && blocked_reason.is_none() {
                                    session.write_formatted(
                                        b.space, &e, &input, format, meta, w.confirm,
                                    );
                                }
                            } else {
                                let (cell, _) = ui.allocate_exact_size(size, egui::Sense::hover());
                                ui.horizontal(|ui| {
                                    ui.spacing_mut().item_spacing.x = 4.;
                                    let write = egui::vec2(48., size.y);
                                    ui.allocate_exact_size(write, egui::Sense::hover());
                                    outcome_mark(ui, outcome.as_ref());
                                });
                                hovered |= ui.rect_contains_pointer(cell);
                            }
                            ui.ctx().data_mut(|d| d.insert_temp(id, input.clone()));
                            let row_rect = ui.min_rect();
                            let pointer_on_row =
                                ui.input(|i| i.pointer.hover_pos()).is_some_and(|p| {
                                    p.y >= ui.cursor().top()
                                        && p.y <= ui.cursor().top() + size.y
                                        && row_rect.x_range().contains(p.x)
                                });
                            ui.ctx().data_mut(|d| {
                                d.insert_temp(id.with("hovered"), hovered || pointer_on_row)
                            });
                        }
                    }
                    ui.end_row();
                }
            });
        return;
    }
    if w.kind == WidgetKind::DirectionalControl {
        if w.directions.is_empty() {
            ui.label("Configure direction commands");
        }
        // A 3×3 compass: north at the top, the centre left empty. Rows with
        // no direction are left out, so a left/right pair is one row.
        let rows: Vec<usize> = (0..3)
            .filter(|r| w.directions.iter().any(|d| d.direction.cell().1 == *r))
            .collect();
        let gap = 6.;
        let width = ((ui.available_width() - gap * 2.) / 3.).max(36.);
        // A fixed row height: the content scrolls, so the space on offer
        // says nothing about the widget's box.
        let height = (ui.spacing().interact_size.y + 12.) * scale;
        let blocked_reason = blocked(session, editing, true);
        let (area, _) = ui.allocate_exact_size(
            egui::vec2(
                width * 3. + gap * 2.,
                height * rows.len() as f32 + gap * rows.len().saturating_sub(1) as f32,
            ),
            egui::Sense::hover(),
        );
        {
            for d in &w.directions {
                let label = if d.label.is_empty() {
                    d.direction.arrow()
                } else {
                    &d.label
                };
                let (column, row) = d.direction.cell();
                let row = rows.iter().position(|r| *r == row).unwrap_or(0);
                let cell = egui::Rect::from_min_size(
                    area.min
                        + egui::vec2(column as f32 * (width + gap), row as f32 * (height + gap)),
                    egui::vec2(width, height),
                );
                // A child placed on the cell: nothing more is allocated in
                // the widget, which `add_enabled_ui` around `put` would do.
                let mut cell_ui = ui.new_child(egui::UiBuilder::new().max_rect(cell).layout(
                    egui::Layout::centered_and_justified(egui::Direction::LeftToRight),
                ));
                let response = cell_ui
                    .add_enabled(
                        blocked_reason.is_none(),
                        styled(&cell_ui, label, ButtonStyle::Neutral, false),
                    )
                    .on_disabled_hover_text(blocked_reason.unwrap_or_default());
                // At most one jog per direction is in flight. Repeats while the
                // button is held never pile up in the request queue, so
                // releasing it stops the machine after at most one more step.
                let idle = session
                    .commands
                    .get(&d.command)
                    .is_none_or(|o| o.status != OutcomeStatus::Sending);
                let id = ui.id().with(("jog", &d.direction));
                let now = ui.input(|i| i.time);
                let last = ui
                    .ctx()
                    .data_mut(|data| data.get_temp::<f64>(id).unwrap_or(-1.));
                if idle
                    && (response.clicked()
                        || (!w.confirm
                            && response.is_pointer_button_down_on()
                            && now - last > 0.15))
                {
                    match w.value.parse() {
                        Ok(value) => {
                            let info = profile.command(d.command);
                            session.command(d.command, value, info.as_ref(), w.confirm);
                            ui.ctx().data_mut(|data| data.insert_temp(id, now));
                        }
                        Err(_) => session.notice = "Invalid jog command argument".into(),
                    }
                }
            }
            // The last jog's outcome sits in the empty centre of the compass.
            let last = w
                .directions
                .iter()
                .filter_map(|d| session.commands.get(&d.command))
                .max_by(|a, b| a.sent_at.total_cmp(&b.sent_at))
                .cloned();
            if let Some(centre) = rows.iter().position(|r| *r == 1) {
                let cell = egui::Rect::from_min_size(
                    area.min + egui::vec2(width + gap, centre as f32 * (height + gap)),
                    egui::vec2(width, height),
                );
                let mut cell_ui = ui.new_child(egui::UiBuilder::new().max_rect(cell).layout(
                    egui::Layout::centered_and_justified(egui::Direction::LeftToRight),
                ));
                outcome_mark(&mut cell_ui, last.as_ref());
            }
        }
        return;
    }
    if let (WidgetKind::Button, Some(command)) = (w.kind, w.command) {
        let button = styled(ui, &w.label, w.style, true);
        let outcome = session.commands.get(&command).cloned();
        if filled_button(
            ui,
            button,
            blocked(session, editing, true),
            outcome.as_ref(),
        )
        .clicked()
        {
            match w.value.parse() {
                Ok(v) => {
                    let info = profile.command(command);
                    session.command(command, v, info.as_ref(), w.confirm)
                }
                Err(_) => session.notice = "Invalid command value".into(),
            }
        }
        return;
    }
    let Some(binding) = w.binding.as_mut() else {
        ui.weak("Choose an entry in Configure");
        return;
    };
    if !review(ui, binding, profile) {
        return;
    }
    session.interest(
        binding,
        profile,
        if w.kind == WidgetKind::MiniPlot {
            w.poll_ms
        } else {
            prefs.poll_ms
        },
    );
    let e = profile.entry_at(binding.space, binding.address).unwrap();
    let r = session
        .readings
        .get(&(binding.space, binding.address))
        .filter(|r| r.valid);
    let raw = r.map(|r| r.value);
    let meta = profile.metadata(binding.space, &e.name);
    // Engineering units (map metadata scale and offset) for every read-out.
    let value = raw.map(|v| e.engineering(v, meta));
    let rule = value.and_then(|v| w.thresholds.iter().find(|t| t.matches(v)));
    let color = rule
        .map(|r| colors::threshold(ui, r))
        .unwrap_or(ui.visuals().text_color());
    let format = shown(w.format, meta);
    // Inputs and the write path see ungrouped text; read-outs may group.
    let plain = raw
        .map(|v| format.format_with(&e, v, meta))
        .unwrap_or("—".into());
    let text = group(prefs, format, plain.clone());
    let unit = w.unit.trim();
    let blocked_reason = blocked(session, editing, e.writable);
    let outcome = session
        .writes
        .get(&(binding.space, binding.address))
        .cloned();
    match w.kind {
        WidgetKind::ValueRead if w.scaled => {
            // value × factor at fixed decimals, with the raw value under it.
            let scaled = value
                .map(|v| {
                    group(
                        prefs,
                        DisplayFormat::Decimal,
                        format!("{:.*}", w.decimals.min(9), v * w.factor),
                    )
                })
                .unwrap_or("—".into());
            readout(ui, &scaled, unit, color, 40., w.text_size);
            if w.show_raw {
                let palette = super::theme::of(ui);
                ui.label(
                    RichText::new(format!("Raw {text} {}", w.secondary_unit).trim_end())
                        .small()
                        .monospace()
                        .color(palette.text_weak),
                );
            }
        }
        WidgetKind::ValueRead => readout(ui, &text, unit, color, 40., w.text_size),
        WidgetKind::Gauge => {
            if w.max <= w.min {
                ui.colored_label(colors::role(ui, Role::Warn), "Maximum must exceed minimum");
                return;
            }
            let palette = super::theme::of(ui);
            let accent = rule.map_or(palette.accent, |r| colors::threshold(ui, r));
            // The arc is capped in width and centred in the widget.
            let full = ui.available_width();
            let width = full.min(260. * scale);
            let height = (width * 0.58).min(room.y - 4.).max(60.);
            let (rect, response) =
                ui.allocate_exact_size(egui::vec2(full, height), egui::Sense::hover());
            describe(&response, format!("{}: {text} {unit}", w.label));
            let rect = egui::Rect::from_center_size(rect.center(), egui::vec2(width, height));
            let radius = (rect.width() / 2. - 10.)
                .min(rect.height() - 26. * scale)
                .max(18.);
            let center = egui::pos2(rect.center().x, rect.top() + radius + 6.);
            let span = w.max - w.min;
            let fraction_of = |v: f64| ((v - w.min) / span).clamp(0., 1.) as f32;
            let fraction = value.map(fraction_of).unwrap_or(0.);
            let point = |t: f32, r: f32| {
                let angle = std::f32::consts::PI * (1. + t);
                center + egui::vec2(angle.cos(), angle.sin()) * r
            };
            let arc = |from: f32, to: f32, r: f32| -> Vec<egui::Pos2> {
                let steps = ((to - from) * 48.).ceil().max(1.) as usize;
                (0..=steps)
                    .map(|i| point(from + (to - from) * i as f32 / steps as f32, r))
                    .collect()
            };
            let thickness = (radius * 0.16).clamp(6., 14.);
            ui.painter().add(egui::Shape::line(
                arc(0., 1., radius),
                egui::Stroke::new(thickness, palette.track),
            ));
            if value.is_some() && fraction > 0. {
                ui.painter().add(egui::Shape::line(
                    arc(0., fraction, radius),
                    egui::Stroke::new(thickness, accent),
                ));
            }
            // Threshold zones: a thin band outside the arc over each range a
            // comparison covers, and a tick at each threshold value.
            let outer = radius + thickness / 2. + 3.;
            for t in &w.thresholds {
                let at = fraction_of(t.value);
                let zone = match t.op {
                    Comparator::Gt | Comparator::Ge => Some((at, 1.)),
                    Comparator::Lt | Comparator::Le => Some((0., at)),
                    _ => None,
                };
                let tone = colors::threshold(ui, t);
                if let Some((from, to)) = zone.filter(|(a, b)| b > a) {
                    ui.painter().add(egui::Shape::line(
                        arc(from, to, outer),
                        egui::Stroke::new(2. * scale, tone.gamma_multiply(0.7)),
                    ));
                }
                if t.value > w.min && t.value < w.max {
                    ui.painter().line_segment(
                        [
                            point(at, radius - thickness / 2.),
                            point(at, outer + 2. * scale),
                        ],
                        egui::Stroke::new(1.5, tone),
                    );
                }
            }
            let font = |size: f32| egui::FontId::monospace(size);
            ui.painter().text(
                center - egui::vec2(0., radius * 0.18),
                egui::Align2::CENTER_BOTTOM,
                &text,
                font(fitted_size(
                    radius * 1.3,
                    text.chars().count(),
                    12. * scale,
                    30. * scale,
                )),
                if value.is_some() {
                    color
                } else {
                    palette.text_weak
                },
            );
            if !unit.is_empty() {
                ui.painter().text(
                    center - egui::vec2(0., radius * 0.18 - 4.),
                    egui::Align2::CENTER_TOP,
                    unit,
                    egui::FontId::proportional(11. * scale),
                    palette.text_weak,
                );
            }
            let limit = |x: f32, v: f64, align| {
                ui.painter().text(
                    egui::pos2(x, center.y + 4. * scale),
                    align,
                    format_number(v),
                    egui::FontId::monospace(10.5 * scale),
                    palette.text_weak,
                );
            };
            limit(center.x - radius, w.min, egui::Align2::CENTER_TOP);
            limit(center.x + radius, w.max, egui::Align2::CENTER_TOP);
        }
        WidgetKind::ProgressBar => {
            let ratio = value
                .map(|v| {
                    if w.max > w.min {
                        ((v - w.min) / (w.max - w.min)).clamp(0., 1.)
                    } else {
                        0.
                    }
                })
                .unwrap_or(0.) as f32;
            let palette = super::theme::of(ui);
            let fill = rule.map_or(palette.accent, |r| colors::threshold(ui, r));
            // Where each threshold value falls along the bar, 0 to 1.
            let notches: Vec<(f32, Color32)> = w
                .thresholds
                .iter()
                .filter(|t| w.max > w.min && t.value > w.min && t.value < w.max)
                .map(|t| {
                    (
                        ((t.value - w.min) / (w.max - w.min)) as f32,
                        colors::threshold(ui, t),
                    )
                })
                .collect();
            let thickness = 12. * scale;
            if w.vertical {
                ui.horizontal(|ui| {
                    let height = (room.y - 8.).clamp(40., 220.);
                    let (rect, response) =
                        ui.allocate_exact_size(egui::vec2(thickness, height), egui::Sense::hover());
                    describe(&response, format!("{}: {text} {unit}", w.label));
                    ui.painter().rect_filled(rect, RADIUS_CELL, palette.track);
                    let level = egui::Rect::from_min_max(
                        egui::pos2(rect.left(), rect.bottom() - rect.height() * ratio),
                        rect.right_bottom(),
                    );
                    ui.painter().rect_filled(level, RADIUS_CELL, fill);
                    for (at, tone) in &notches {
                        let y = rect.bottom() - rect.height() * at;
                        ui.painter().line_segment(
                            [
                                egui::pos2(rect.left() - 2., y),
                                egui::pos2(rect.right() + 2., y),
                            ],
                            egui::Stroke::new(2., *tone),
                        );
                    }
                    ui.vertical(|ui| {
                        if w.show_limits {
                            limit_text(ui, w.max);
                        }
                        if w.show_value {
                            ui.label(RichText::new(&text).monospace().color(color));
                            ui.label(RichText::new(unit).small().color(palette.text_weak));
                        }
                        if w.show_limits {
                            ui.add_space((ui.available_height() - 18.).max(0.));
                            limit_text(ui, w.min);
                        }
                    });
                });
            } else {
                level_bar(
                    ui,
                    ratio,
                    &text,
                    w.show_value,
                    unit,
                    fill,
                    thickness,
                    &notches,
                );
                if w.show_limits {
                    ui.horizontal(|ui| {
                        limit_text(ui, w.min);
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            limit_text(ui, w.max)
                        });
                    });
                }
            }
        }
        WidgetKind::LedIndicator | WidgetKind::StateLed => {
            // Lit in the colour of the first matching state, dark when none
            // matches. A state without a label shows only the lamp.
            let lit = rule.map_or(colors::role(ui, Role::Ok), |r| colors::threshold(ui, r));
            ui.horizontal(|ui| {
                lamp(
                    ui,
                    raw.map(|_| rule.is_some()),
                    lit,
                    8. * w.text_size.clamp(0.5, 4.),
                    rule.and_then(|r| colors::role_glyph(r.role)),
                );
                if let Some(text) = rule
                    .map(|r| r.label.as_str())
                    .filter(|s| !s.trim().is_empty())
                {
                    ui.label(text);
                }
            });
        }
        WidgetKind::StatusMatrix => {
            let palette = super::theme::of(ui);
            // What a set bit means: lit in that status's colour, with its
            // glyph where the cell is wide enough to carry it.
            let lit = colors::role(ui, w.set_role);
            let glyph = colors::role_glyph(w.set_role);
            let bits = match w.bit_count {
                8 | 16 => w.bit_count,
                _ => 32,
            };
            // Named bits get wider cells so their names fit.
            let named = meta.is_some_and(|m| !m.bits.is_empty());
            let columns = if named { 4. } else { 8. };
            let cell = ((ui.available_width() - (columns - 1.) * 4.) / columns)
                .clamp(16., if named { 120. } else { 34. });
            egui::Grid::new("bits")
                .num_columns(columns as usize)
                .spacing([4., 4.])
                // Columns are exactly one cell wide, not egui's 36 px minimum.
                .min_col_width(cell)
                .show(ui, |ui| {
                    // Most significant bit first, as in a register diagram.
                    for bit in (0..bits).rev() {
                        let on = raw.map(|v| (v as u32) & (1 << bit) != 0);
                        let name = meta.and_then(|m| m.bit_name(bit));
                        let (rect, response) = ui.allocate_exact_size(
                            egui::vec2(cell, 18. * scale),
                            egui::Sense::hover(),
                        );
                        let (fill, text) = match on {
                            Some(true) => (lit.gamma_multiply(0.85), palette.well),
                            Some(false) => (palette.track.gamma_multiply(0.6), palette.text_weak),
                            None => (Color32::TRANSPARENT, palette.text_weak),
                        };
                        ui.painter().rect(
                            rect,
                            RADIUS_CELL,
                            fill,
                            egui::Stroke::new(1_f32, palette.ghost),
                            egui::StrokeKind::Inside,
                        );
                        let label = match name {
                            Some(name) if named => {
                                let fit = ((cell - 6.) / 6.).max(3.) as usize;
                                if name.chars().count() > fit {
                                    format!("{}…", name.chars().take(fit - 1).collect::<String>())
                                } else {
                                    name.to_string()
                                }
                            }
                            // A wide unnamed cell also carries the status glyph.
                            _ => match glyph.filter(|_| on == Some(true) && cell >= 30.) {
                                Some(g) => format!("{g}{bit}"),
                                None => bit.to_string(),
                            },
                        };
                        ui.painter().text(
                            rect.center(),
                            egui::Align2::CENTER_CENTER,
                            label,
                            egui::FontId::monospace(10. * scale),
                            text,
                        );
                        let state = match on {
                            Some(true) => "set",
                            Some(false) => "clear",
                            None => "unknown",
                        };
                        response.widget_info(|| {
                            egui::WidgetInfo::labeled(
                                egui::WidgetType::Label,
                                true,
                                format!("Bit {bit} {}: {state}", name.unwrap_or_default()),
                            )
                        });
                        response.on_hover_text(format!(
                            "Bit {bit}{} (0x{:08X}): {}",
                            name.map(|n| format!(" {n}")).unwrap_or_default(),
                            1u32 << bit,
                            state
                        ));
                        if bit % columns as u8 == 0 {
                            ui.end_row();
                        }
                    }
                });
        }
        WidgetKind::Button => {
            let button = styled(ui, &w.label, w.style, true);
            if filled_button(ui, button, blocked_reason, outcome.as_ref()).clicked() {
                session.write_formatted(
                    binding.space,
                    &e,
                    &w.value,
                    shown(w.format, meta),
                    meta,
                    w.confirm,
                );
            }
        }
        WidgetKind::ValueWrite => {
            let palette = super::theme::of(ui);
            if w.show_value {
                ui.horizontal(|ui| {
                    ui.label(RichText::new(&text).monospace().color(color));
                    if !unit.is_empty() {
                        ui.label(RichText::new(unit).small().color(palette.text_weak));
                    }
                });
            }
            // Right to left: the Write button and outcome keep their size and
            // the input takes what is left, so the row never overflows.
            control_row(ui, |ui| {
                let write = ui
                    .add_enabled(
                        blocked_reason.is_none(),
                        styled(ui, "Write", ButtonStyle::Action, false),
                    )
                    .on_disabled_hover_text(blocked_reason.unwrap_or_default());
                outcome_mark(ui, outcome.as_ref());
                if !unit.is_empty() {
                    ui.label(RichText::new(unit).small().color(palette.text_weak));
                }
                let input = ui.add(
                    egui::TextEdit::singleline(&mut w.value)
                        .font(egui::TextStyle::Monospace)
                        .desired_width(ui.available_width().max(24.)),
                );
                let submit = input.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
                if (write.clicked() || submit) && blocked_reason.is_none() {
                    session.write_formatted(binding.space, &e, &w.value, format, meta, w.confirm);
                }
            });
        }
        WidgetKind::Dropdown => {
            // Options name raw device values, not engineering values.
            let current = raw.map(|v| e.decode(v)).and_then(|v| {
                w.options
                    .iter()
                    .find(|o| o.value.trim().parse::<f64>().ok() == Some(v))
            });
            control_row(ui, |ui| {
                outcome_mark(ui, outcome.as_ref());
                egui::ComboBox::from_id_salt("options")
                    .width(ui.available_width())
                    .selected_text(match current {
                        Some(o) => RichText::new(&o.label).color(color),
                        None if raw.is_some() => RichText::new(&plain).monospace(),
                        None => RichText::new("—").color(super::theme::of(ui).text_weak),
                    })
                    .show_ui(ui, |ui| {
                        if let Some(reason) = blocked_reason {
                            ui.label(
                                RichText::new(reason)
                                    .small()
                                    .color(super::theme::of(ui).text_weak),
                            );
                        }
                        for o in &w.options {
                            let chosen = current.is_some_and(|c| std::ptr::eq(c, o));
                            if ui
                                .add_enabled(
                                    blocked_reason.is_none(),
                                    egui::Button::new(&o.label).selected(chosen),
                                )
                                .on_disabled_hover_text(blocked_reason.unwrap_or_default())
                                .clicked()
                            {
                                session.write(binding.space, &e, &o.value, meta, w.confirm);
                                ui.close();
                            }
                        }
                    });
            });
        }
        WidgetKind::MiniPlot => {
            session.want_history(binding);
            let line = rule.map_or_else(
                || super::theme::trace(ui.visuals().dark_mode, 0).0,
                |r| colors::threshold(ui, r),
            );
            super::theme::plot_tone(ui, |ui| {
                egui_plot::Plot::new("mini-plot")
                    .height((room.y - 4.).max(40.))
                    .show_axes([false, true])
                    // Dragging or scrolling inside a dashboard must move the dashboard.
                    .allow_drag(false)
                    .allow_zoom(false)
                    .allow_scroll(false)
                    .allow_boxed_zoom(false)
                    .allow_double_click_reset(false)
                    .show(ui, |plot| {
                        if let Some(h) = session.histories.get(&(binding.space, binding.address)) {
                            if let Some(last) = h.back() {
                                let points = super::panes::window(
                                    h,
                                    last[0] - w.time_span,
                                    last[0],
                                    super::panes::MAX_TRACE_POINTS,
                                );
                                plot.line(egui_plot::Line::new("", points).color(line));
                            }
                        }
                    })
            });
        }
        _ => {}
    }
}
/// A dashboard button in one of the three styles. Action: accent text;
/// Neutral: normal text; Danger: error text and outline, never a red fill.
fn styled(ui: &egui::Ui, label: &str, style: ButtonStyle, strong: bool) -> egui::Button<'static> {
    let colour = match style {
        ButtonStyle::Action => colors::role(ui, Role::Accent),
        ButtonStyle::Neutral => super::theme::of(ui).text,
        ButtonStyle::Danger => colors::role(ui, Role::Error),
    };
    let mut text = RichText::new(label.to_string()).color(colour);
    if strong {
        text = text.strong();
    }
    let button = egui::Button::new(text);
    if style == ButtonStyle::Danger {
        button.stroke(egui::Stroke::new(1.5, colour))
    } else {
        button
    }
}
/// One row of controls laid out from the right, one control high and as
/// wide as the widget: what is added first keeps its size at the right end.
fn control_row(ui: &mut egui::Ui, add: impl FnOnce(&mut egui::Ui)) {
    let size = egui::vec2(ui.available_width(), ui.spacing().interact_size.y);
    ui.allocate_ui_with_layout(size, egui::Layout::right_to_left(egui::Align::Center), add);
}
/// Why a write or command control cannot be used now, if it cannot.
pub(super) fn blocked(session: &Session, editing: bool, writable: bool) -> Option<&'static str> {
    if editing {
        Some("Leave Edit dashboard to use this control")
    } else if !session.connected() {
        Some("Connect to a device first")
    } else if !session.controlled() {
        Some("Take Control to write or send commands")
    } else if !writable {
        Some("This entry is read-only")
    } else {
        None
    }
}
/// The last write or command outcome as one status glyph in its colour,
/// explained on hover. Nothing is drawn before the first send, and the mark
/// keeps one size, so widgets do not grow while a write is pending.
fn outcome_mark(ui: &mut egui::Ui, outcome: Option<&super::session::WriteOutcome>) {
    let Some(outcome) = outcome else {
        return;
    };
    let role = colors::outcome_role(outcome);
    ui.add(
        egui::Label::new(
            RichText::new(colors::role_glyph(role).unwrap_or(colors::mark(role)))
                .color(colors::role(ui, role)),
        )
        .selectable(false),
    )
    .on_hover_text(outcome.label());
}
/// A dashboard number with digits grouped in threes, when the preference is
/// on and the view is decimal.
fn group(prefs: &Preferences, format: DisplayFormat, text: String) -> String {
    if prefs.group_digits && matches!(format, DisplayFormat::Native | DisplayFormat::Decimal) {
        grouped(&text)
    } else {
        text
    }
}
/// A limit value under a bar: small, weak and monospaced.
fn limit_text(ui: &mut egui::Ui, v: f64) {
    ui.label(
        RichText::new(format_number(v))
            .small()
            .monospace()
            .color(super::theme::of(ui).text_weak),
    );
}
/// The status of a table's rows when they all share one, for the title.
fn table_status(
    w: &Widget,
    session: &Session,
    profile: &Profile,
    prefs: &Preferences,
) -> Option<(Role, &'static str)> {
    let mut statuses = w.rows.iter().filter(|b| b.matches(profile)).map(|b| {
        colors::reading(
            session.connected(),
            session.readings.get(&(b.space, b.address)),
            Some(prefs.poll_ms),
        )
    });
    let first = statuses.next()?;
    statuses.all(|s| s == first).then_some(first)
}
/// Text at the right of a healthy widget's title: a Mini-Plot's latest value.
fn title_aside(
    w: &Widget,
    session: &Session,
    profile: &Profile,
    prefs: &Preferences,
) -> Option<String> {
    if w.kind != WidgetKind::MiniPlot {
        return None;
    }
    let b = w.binding.as_ref().filter(|b| b.matches(profile))?;
    let e = profile.entry_at(b.space, b.address)?;
    let r = session
        .readings
        .get(&(b.space, b.address))
        .filter(|r| r.valid)?;
    let meta = profile.metadata(b.space, &e.name);
    let format = shown(w.format, meta);
    let text = group(prefs, format, format.format_with(&e, r.value, meta));
    Some(if w.unit.trim().is_empty() {
        text
    } else {
        format!("{text} {}", w.unit.trim())
    })
}
/// Chooses a command from the Profile's command list, or any code typed in
/// the field beside it (0–65535).
fn command_picker(ui: &mut egui::Ui, code: &mut u16, profile: &Profile) {
    let commands = profile.commands();
    let selected = commands
        .iter()
        .find(|c| c.code == *code)
        .map_or_else(|| "Custom code".to_string(), |c| c.name.clone());
    egui::ComboBox::from_id_salt("command")
        .width(150.)
        .selected_text(selected)
        .show_ui(ui, |ui| {
            for c in &commands {
                let item = ui.selectable_value(code, c.code, format!("{} · {}", c.name, c.code));
                if !c.description.is_empty() {
                    item.on_hover_text(&c.description);
                }
            }
        });
    ui.add(typed(egui::DragValue::new(code)).range(0..=u16::MAX))
        .on_hover_text("Command code; type any value to send a code not in the list");
}
/// Width of the edit-mode Configure button: its label on one line plus padding.
fn configure_width(ui: &egui::Ui) -> f32 {
    let font = egui::TextStyle::Button.resolve(ui.style());
    let text = ui
        .painter()
        .layout_no_wrap("Configure".into(), font, Color32::PLACEHOLDER)
        .size()
        .x;
    text.ceil() + 2. * ui.spacing().button_padding.x
}
/// A button that fills the widget. Its last outcome is a dot at the right
/// edge, explained on hover, so the button keeps the whole widget area.
fn filled_button(
    ui: &mut egui::Ui,
    button: egui::Button<'_>,
    blocked: Option<&'static str>,
    outcome: Option<&super::session::WriteOutcome>,
) -> egui::Response {
    let size = ui.available_size();
    // The label sits in the middle of the widget, however wide it is.
    let response = ui
        .with_layout(egui::Layout::top_down(egui::Align::Center), |ui| {
            ui.add_enabled(blocked.is_none(), button.min_size(size))
        })
        .inner;
    let Some(outcome) = outcome else {
        return match blocked {
            Some(reason) => response.on_disabled_hover_text(reason),
            None => response,
        };
    };
    let center = response.rect.right_center() - egui::vec2(10., 0.);
    let role = colors::outcome_role(outcome);
    ui.painter().text(
        center,
        egui::Align2::CENTER_CENTER,
        colors::role_glyph(role).unwrap_or("●"),
        egui::FontId::proportional(11.),
        colors::role(ui, role),
    );
    let disabled = match blocked {
        Some(reason) => format!("{reason}\nLast: {}", outcome.label()),
        None => outcome.label().to_string(),
    };
    response
        .on_hover_text(outcome.label())
        .on_disabled_hover_text(disabled)
}
/// The reading status shown in a bound widget's title row.
fn widget_status(
    w: &Widget,
    session: &Session,
    profile: &Profile,
    prefs: &Preferences,
) -> Option<(Role, &'static str)> {
    if matches!(
        w.kind,
        WidgetKind::Container | WidgetKind::DeviceInfo | WidgetKind::DirectionalControl
    ) {
        return None;
    }
    // A table's rows share the title only when they all have one status.
    if matches!(w.kind, WidgetKind::DataTable | WidgetKind::AlarmList) {
        return table_status(w, session, profile, prefs);
    }
    let b = w.binding.as_ref().filter(|b| b.matches(profile))?;
    let interval = if w.kind == WidgetKind::MiniPlot {
        w.poll_ms
    } else {
        prefs.poll_ms
    };
    Some(colors::reading(
        session.connected(),
        session.readings.get(&(b.space, b.address)),
        Some(interval),
    ))
}
/// A font size that fits `chars` monospace characters into `width`, between
/// `min` and `max` points.
fn fitted_size(width: f32, chars: usize, min: f32, max: f32) -> f32 {
    (width / (chars.max(1) as f32 * 0.62)).clamp(min, max)
}
/// A large numeric readout with its unit, sized to the space available and
/// scaled by the widget's text size.
fn readout(ui: &mut egui::Ui, text: &str, unit: &str, color: Color32, max: f32, scale: f32) {
    let scale = scale.clamp(0.5, 4.);
    let palette = super::theme::of(ui);
    let unit_width = if unit.is_empty() {
        0.
    } else {
        unit.len() as f32 * 8. + 8.
    };
    let size = fitted_size(
        ui.available_width() - unit_width,
        text.chars().count(),
        14. * scale,
        (max * scale)
            .min(ui.available_height() * 0.8)
            .max(14. * scale),
    );
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 6.;
        ui.label(RichText::new(text).monospace().size(size).color(color));
        if !unit.is_empty() {
            ui.label(RichText::new(unit).color(palette.text_weak));
        }
    });
}
/// A horizontal level bar: track, fill, threshold notches (position 0–1
/// and colour) and the value with its unit. `show` hides the value text;
/// screen readers still get it.
#[allow(clippy::too_many_arguments)]
fn level_bar(
    ui: &mut egui::Ui,
    ratio: f32,
    text: &str,
    show: bool,
    unit: &str,
    color: Color32,
    thickness: f32,
    notches: &[(f32, Color32)],
) {
    let palette = super::theme::of(ui);
    if show {
        ui.horizontal(|ui| {
            ui.label(RichText::new(text).monospace().color(palette.text));
            if !unit.is_empty() {
                ui.label(RichText::new(unit).small().color(palette.text_weak));
            }
        });
    }
    let (rect, response) = ui.allocate_exact_size(
        egui::vec2(ui.available_width(), thickness),
        egui::Sense::hover(),
    );
    describe(&response, format!("{text} {unit}"));
    ui.painter().rect_filled(rect, RADIUS_CELL, palette.track);
    if ratio > 0. {
        let fill =
            egui::Rect::from_min_size(rect.min, egui::vec2(rect.width() * ratio, rect.height()));
        ui.painter().rect_filled(fill, RADIUS_CELL, color);
    }
    for (at, tone) in notches {
        let x = rect.left() + rect.width() * at;
        ui.painter().line_segment(
            [
                egui::pos2(x, rect.top() - 2.),
                egui::pos2(x, rect.bottom() + 2.),
            ],
            egui::Stroke::new(2., *tone),
        );
    }
}
/// Gives a custom-painted read-out an accessible label for screen readers.
fn describe(response: &egui::Response, label: impl Into<String>) {
    let label = label.into();
    response.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Label, true, label.trim()));
}
/// An indicator lamp: filled when on, a ring when off, dashed when unknown.
/// A round lamp. A lit lamp carries its state's `glyph` when it is large
/// enough, so the state does not rest on colour alone.
fn lamp(
    ui: &mut egui::Ui,
    state: Option<bool>,
    color: Color32,
    radius: f32,
    glyph: Option<&'static str>,
) {
    let palette = super::theme::of(ui);
    let (rect, response) =
        ui.allocate_exact_size(egui::Vec2::splat(radius * 2. + 2.), egui::Sense::hover());
    describe(
        &response,
        match state {
            Some(true) => "Indicator on",
            Some(false) => "Indicator off",
            None => "Indicator unknown",
        },
    );
    let center = rect.center();
    match state {
        Some(true) => {
            ui.painter().circle_filled(center, radius, color);
            if let Some(glyph) = glyph.filter(|_| radius >= 7.) {
                ui.painter().text(
                    center,
                    egui::Align2::CENTER_CENTER,
                    glyph,
                    egui::FontId::proportional(radius * 1.25),
                    palette.well,
                );
            }
        }
        Some(false) => {
            ui.painter().circle(
                center,
                radius,
                palette.track,
                egui::Stroke::new(1.5_f32, palette.text_weak),
            );
        }
        None => {
            ui.painter().circle_stroke(
                center,
                radius,
                egui::Stroke::new(1_f32, palette.ghost_strong),
            );
        }
    }
}

/// What each drawn widget's content measured, for layout tests.
#[cfg(test)]
pub(super) mod fits {
    use super::Widget;
    use eframe::egui;
    use std::cell::RefCell;
    thread_local! {
        static FITS: RefCell<Vec<(String, egui::Vec2, egui::Vec2)>> = const { RefCell::new(vec![]) };
    }
    pub fn record(w: &Widget, fit: egui::Vec2) {
        let name = format!("{:?} \"{}\"", w.kind, w.label);
        FITS.with(|f| {
            f.borrow_mut()
                .push((name, fit, egui::vec2(w.width, w.height)))
        });
    }
    /// Takes the (widget, content size, box size) records since the last call.
    pub fn take() -> Vec<(String, egui::Vec2, egui::Vec2)> {
        FITS.with(|f| std::mem::take(&mut *f.borrow_mut()))
    }
}
