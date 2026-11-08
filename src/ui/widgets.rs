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
    ui.horizontal_wrapped(|ui| {
        egui::ComboBox::from_id_salt("dashboards")
            .selected_text(&profile.dashboards[pane.dashboard].name)
            .show_ui(ui, |ui| {
                for (i, d) in profile.dashboards.iter().enumerate() {
                    ui.selectable_value(&mut pane.dashboard, i, &d.name);
                }
            });
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.checkbox(&mut pane.editing, "Edit dashboard");
            if pane.editing {
                let dashboard = &profile.dashboards[pane.dashboard].id;
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
            }
            if !pane.editing {
                ui.weak("Enable Edit dashboard to arrange and configure widgets.");
            }
            if pane.editing {
                ui.menu_button("Manage dashboard", |ui| {
                    ui.text_edit_singleline(&mut profile.dashboards[pane.dashboard].name);
                    if ui.button("New").clicked() {
                        profile.dashboards.push(Dashboard {
                            id: unique_id(),
                            name: "Dashboard".into(),
                            widgets: vec![],
                        });
                        pane.dashboard = profile.dashboards.len() - 1;
                        ui.close_menu();
                    }
                    if ui.button("Duplicate").clicked() {
                        let mut d = profile.dashboards[pane.dashboard].clone();
                        d.id = unique_id();
                        d.name.push_str(" Copy");
                        profile.dashboards.push(d);
                        pane.dashboard = profile.dashboards.len() - 1;
                        ui.close_menu();
                    }
                    if profile.dashboards.len() > 1
                        && super::controls::confirm_button(
                            ui,
                            &profile.dashboards[pane.dashboard].id,
                            "Delete",
                        )
                    {
                        profile.dashboards.remove(pane.dashboard);
                        pane.dashboard = 0;
                        ui.close_menu();
                    }
                    if profile.id == "cnc_motor_controller" && ui.button("Add CNC panels").clicked()
                    {
                        let mut panels = default_profiles().remove(1).dashboards;
                        for panel in &mut panels {
                            panel.id = unique_id();
                        }
                        profile.dashboards.extend(panels);
                        pane.dashboard = profile.dashboards.len() - 3;
                        ui.close_menu();
                    }
                });
                add_widget_menu(ui, &mut profile.dashboards[pane.dashboard].widgets);
            }
        });
    });
    // Lend the widgets out so the rest of the Profile stays readable while they
    // are edited, instead of copying the whole Profile every frame.
    let dashboard_id = profile.dashboards[pane.dashboard].id.clone();
    let mut widgets = std::mem::take(&mut profile.dashboards[pane.dashboard].widgets);
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
        .drag_to_scroll(false)
        .show(ui, |ui| {
            ui.push_id(&dashboard_id, |ui| {
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
    profile.dashboards[pane.dashboard].widgets = widgets;
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
    let Some(d) = profiles
        .iter_mut()
        .find(|p| p.id == profile)
        .and_then(|p| p.dashboards.iter_mut().find(|d| d.id == dashboard))
    else {
        return false;
    };
    let siblings = match parent {
        None => &mut d.widgets,
        Some(id) => match container(&mut d.widgets, id) {
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
                ui.close_menu();
            }
        }
    });
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
        w.height = w.height.clamp(48., 1200.);
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
            egui::Window::new(format!("Configure {}", w.label))
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
                egui::pos2(rect.right() - 84., rect.top() + 26.),
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
                                .clamp((rect.max.y - 1200.).max(origin.y), rect.max.y - 48.)
                        }
                        3 => {
                            rect.max.y =
                                (rect.max.y + delta.y).clamp(rect.min.y + 48., rect.min.y + 1200.)
                        }
                        _ => {
                            rect.max = rect.min
                                + (rect.size() + delta)
                                    .clamp(egui::vec2(120., 48.), egui::vec2(1600., 1200.));
                        }
                    }
                    ui.ctx().data_mut(|data| data.insert_temp(raw_id, rect));
                    let size = rect.size();
                    let width = canvas_layout::soft_snap(size.x, targets.iter().map(|s| s.x))
                        .clamp(120., 1600.);
                    let height = canvas_layout::soft_snap(size.y, targets.iter().map(|s| s.y))
                        .clamp(48., 1200.);
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
        // Top-level widgets are raised cards; nested ones are outlined regions
        // of their container, so depth reads through tone rather than boxes.
        let palette = super::theme::of(ui);
        let (fill, outline) = if floating {
            (palette.surface, palette.accent)
        } else if depth == 0 {
            (palette.raised, palette.ghost)
        } else {
            (Color32::TRANSPARENT, palette.ghost)
        };
        painter.rect(
            rect,
            4,
            fill,
            egui::Stroke::new(1_f32, outline),
            egui::StrokeKind::Inside,
        );
        let margin = if w.kind == WidgetKind::Container {
            w.padding.clamp(6., 32.)
        } else {
            6.
        };
        let mut child = ui.new_child(
            egui::UiBuilder::new()
                .id_salt(id)
                .layer_id(layer)
                .max_rect(rect.shrink(margin))
                .layout(egui::Layout::top_down(egui::Align::Min)),
        );
        child.set_clip_rect(rect.shrink(5.).intersect(if floating {
            ui.ctx().screen_rect()
        } else {
            ui.clip_rect()
        }));
        if w.kind != WidgetKind::Button {
            let status = widget_status(w, session, profile, prefs);
            child.horizontal(|ui| {
                let title = if depth == 0 || w.kind == WidgetKind::Container {
                    RichText::new(&w.label)
                        .family(egui::FontFamily::Name(super::fonts::SEMIBOLD.into()))
                        .color(palette.text)
                } else {
                    RichText::new(&w.label).small().color(palette.text_weak)
                };
                ui.add(egui::Label::new(title).selectable(false).truncate());
                if let Some((role, label)) = status {
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        // Healthy readings show only a dot; anything else says why.
                        if role != Role::Ok {
                            ui.label(RichText::new(label).small().color(colors::role(ui, role)));
                        }
                        ui.label(RichText::new("●").small().color(colors::role(ui, role)))
                            .on_hover_text(label);
                    });
                }
            });
        }
        // Overflow stays reachable by scrolling, but idle scroll bars would
        // clutter tightly sized cards.
        child.spacing_mut().scroll.dormant_handle_opacity = 0.;
        child.spacing_mut().scroll.dormant_background_opacity = 0.;
        let content = egui::ScrollArea::both()
            .id_salt(id.with("content"))
            .drag_to_scroll(false)
            .max_height(child.available_height().max(1.))
            .max_width(child.available_width().max(1.))
            .show(&mut child, |ui| {
                render_widget(ui, w, editing, session, profile, prefs, depth);
            });
        let header = if w.kind == WidgetKind::Button {
            0.
        } else {
            24.
        };
        let fit = if w.kind == WidgetKind::Container {
            w.children.iter().fold(egui::vec2(120., 48.), |size, c| {
                let p = c.position.unwrap_or([0., 0.]);
                size.max(egui::vec2(
                    p[0] + c.width + margin * 2.,
                    p[1] + c.height + margin * 2. + header,
                ))
            })
        } else {
            content.content_size + egui::vec2(margin * 2., margin * 2. + header)
        };
        ui.ctx()
            .data_mut(|data| data.insert_temp(id.with("content-fit"), fit));
        if editing {
            let hovered = ui.rect_contains_pointer(rect);
            if canvas_edit::selection(ui.ctx()).contains(&w.id) {
                ui.painter().rect_stroke(
                    rect.expand(1.),
                    6.,
                    egui::Stroke::new(2_f32, colors::role(ui, Role::Accent)),
                    egui::StrokeKind::Outside,
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
                let button_rect = egui::Rect::from_min_size(
                    egui::pos2(rect.right() - 82., rect.top() + 6.),
                    egui::vec2(76., 22.),
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
            ui.close_menu();
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
                                ui.close_menu();
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
    );
    let sends = matches!(
        w.kind,
        WidgetKind::Button
            | WidgetKind::ValueWrite
            | WidgetKind::Dropdown
            | WidgetKind::DirectionalControl
    );
    section(ui, "General", |ui| {
        ui.label("Label");
        ui.add(egui::TextEdit::singleline(&mut w.label).desired_width(200.));
        ui.end_row();
        match w.kind {
            WidgetKind::ProgressBar => {
                ui.label("Orientation");
                super::controls::segmented(
                    ui,
                    &mut w.vertical,
                    &[(false, "Horizontal"), (true, "Vertical")],
                );
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
            }
            _ => {}
        }
    });
    if bound {
        section(ui, "Value", |ui| {
            ui.label("Entry");
            binding_picker(
                ui,
                &mut w.binding,
                profile,
                matches!(
                    w.kind,
                    WidgetKind::Button | WidgetKind::Dropdown | WidgetKind::ValueWrite
                ),
            );
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
            ui.label("Unit");
            ui.add(egui::TextEdit::singleline(&mut w.unit).desired_width(120.));
            ui.end_row();
            if w.kind == WidgetKind::StatusMatrix {
                ui.label("Bits");
                super::controls::segmented(
                    ui,
                    &mut w.bit_count,
                    &[(8, "8"), (16, "16"), (32, "32")],
                );
                ui.end_row();
            }
            if matches!(w.kind, WidgetKind::Gauge | WidgetKind::ProgressBar) {
                ui.label("Range");
                ui.horizontal(|ui| {
                    ui.add(egui::DragValue::new(&mut w.min).prefix("min "));
                    ui.add(egui::DragValue::new(&mut w.max).prefix("max "));
                });
                ui.end_row();
            }
            if w.kind == WidgetKind::EncoderDisplay {
                ui.label("Scale factor");
                ui.add(egui::DragValue::new(&mut w.factor).speed(0.01));
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
            if w.kind == WidgetKind::LedIndicator {
                ui.label("On when value is");
                ui.add(egui::DragValue::new(&mut w.on_value));
                ui.end_row();
                ui.label("On label");
                ui.add(egui::TextEdit::singleline(&mut w.on_label).desired_width(120.));
                ui.end_row();
                ui.label("Off label");
                ui.add(egui::TextEdit::singleline(&mut w.off_label).desired_width(120.));
                ui.end_row();
            }
        });
    }
    if sends {
        section(ui, "Action", |ui| {
            if w.kind == WidgetKind::Button {
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
                    ui.label("Command code");
                    ui.add(egui::DragValue::new(code));
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
                    ui.add(egui::DragValue::new(&mut d.command).prefix("cmd "));
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
    if w.kind != WidgetKind::Container && w.kind != WidgetKind::DeviceInfo {
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
                        .range(48.0..=1200.)
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
                ui.add(egui::DragValue::new(&mut t.value));
                egui::ComboBox::from_id_salt("role")
                    .width(64.)
                    .selected_text(RichText::new(t.role.as_str()).color(colors::role(ui, t.role)))
                    .show_ui(ui, |ui| {
                        for role in Role::THRESHOLD {
                            ui.selectable_value(
                                &mut t.role,
                                role,
                                RichText::new(role.as_str()).color(colors::role(ui, role)),
                            );
                        }
                    });
                if ui.small_button(super::icons::CLOSE).on_hover_text("Remove rule").clicked() {
                    remove = Some(i);
                }
            });
            ui.add(egui::TextEdit::singleline(&mut t.label).hint_text("Optional state label (e.g. Over limit)"))
                .on_hover_text("Shown by state LEDs and alarm lists. Encoder displays use the threshold color and keep showing the numeric value.");
        });
    }
    if let Some(i) = remove {
        thresholds.remove(i);
    }
    if ui.button(add_label).clicked() {
        thresholds.push(Threshold {
            op: Comparator::Gt,
            value: 0.,
            role: Role::Warn,
            label: String::new(),
        });
    }
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
fn render_widget(
    ui: &mut egui::Ui,
    w: &mut Widget,
    editing: bool,
    session: &mut Session,
    profile: &Profile,
    prefs: &Preferences,
    depth: usize,
) {
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
                    ui.label(RichText::new("●").color(colors::role(ui, role)));
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
        for b in &mut w.rows {
            ui.push_id(b.name.clone(), |ui| {
                if !review(ui, b, profile) {
                    return;
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
                    return;
                }
                let color = rule
                    .map(|r| colors::role(ui, r.role))
                    .unwrap_or(ui.visuals().text_color());
                ui.horizontal(|ui| {
                    let (role, label) = colors::reading(
                        session.connected(),
                        session.readings.get(&(b.space, b.address)),
                        Some(prefs.poll_ms),
                    );
                    colors::badge(ui, role, label);
                    ui.colored_label(color, style.map(|s| s.label.as_str()).unwrap_or(&b.name));
                    ui.monospace(
                        r.as_ref()
                            .map(|r| {
                                shown(style.map(|s| s.format).unwrap_or(w.format), meta)
                                    .format_with(&e, r.value, meta)
                            })
                            .unwrap_or("—".into()),
                    );
                    if w.kind == WidgetKind::DataTable
                        && e.writable
                        && b.space != Space::SysRegister
                    {
                        let id = ui.id().with("value");
                        let mut input = ui
                            .ctx()
                            .data_mut(|d| d.get_temp::<String>(id).unwrap_or_default());
                        ui.add(egui::TextEdit::singleline(&mut input).desired_width(80.));
                        ui.ctx().data_mut(|d| d.insert_temp(id, input.clone()));
                        if ui
                            .add_enabled(
                                session.controlled() && !editing,
                                egui::Button::new("Write"),
                            )
                            .clicked()
                        {
                            let meta = profile.metadata(b.space, &e.name);
                            session.write_formatted(
                                b.space,
                                &e,
                                &input,
                                shown(style.map(|s| s.format).unwrap_or(w.format), meta),
                                meta,
                                w.confirm,
                            );
                        }
                    }
                });
            });
        }
        return;
    }
    if w.kind == WidgetKind::DirectionalControl {
        if w.directions.is_empty() {
            ui.label("Configure direction commands");
        }
        ui.horizontal_wrapped(|ui| {
            for d in &w.directions {
                let label = if d.label.is_empty() {
                    d.direction.arrow()
                } else {
                    &d.label
                };
                let response = ui.add_enabled(
                    session.controlled() && !editing,
                    egui::Button::new(label).min_size(egui::vec2(45., 35.)),
                );
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
        });
        return;
    }
    if let (WidgetKind::Button, Some(command)) = (w.kind, w.command) {
        if ui
            .add_enabled(
                session.controlled() && !editing,
                egui::Button::new(RichText::new(&w.label).strong().color(colors::role(
                    ui,
                    w.thresholds.first().map_or(Role::Accent, |t| t.role),
                )))
                .min_size(egui::vec2(ui.available_width(), 30.)),
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
        if let Some(outcome) = session.commands.get(&command) {
            colors::outcome(ui, outcome);
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
        .map(|r| colors::role(ui, r.role))
        .unwrap_or(ui.visuals().text_color());
    let text = raw
        .map(|v| shown(w.format, meta).format_with(&e, v, meta))
        .unwrap_or("—".into());
    match w.kind {
        WidgetKind::ValueRead => readout(ui, &text, &w.unit, color, 40.),
        WidgetKind::Gauge => {
            if w.max <= w.min {
                ui.colored_label(colors::role(ui, Role::Warn), "Maximum must exceed minimum");
                return;
            }
            let palette = super::theme::of(ui);
            let accent = rule.map_or(palette.accent, |r| colors::role(ui, r.role));
            let width = ui.available_width().min(260.);
            let height = (width * 0.58).min(ui.available_height() - 4.).max(60.);
            let (rect, response) =
                ui.allocate_exact_size(egui::vec2(width, height), egui::Sense::hover());
            describe(&response, format!("{}: {text} {}", w.label, w.unit));
            let radius = (rect.width() / 2. - 10.).min(rect.height() - 26.).max(18.);
            let center = egui::pos2(rect.center().x, rect.top() + radius + 6.);
            let fraction = value
                .map(|v| ((v - w.min) / (w.max - w.min)).clamp(0., 1.))
                .unwrap_or(0.) as f32;
            let arc = |from: f32, to: f32| -> Vec<egui::Pos2> {
                let steps = ((to - from) * 48.).ceil().max(1.) as usize;
                (0..=steps)
                    .map(|i| {
                        let t = from + (to - from) * i as f32 / steps as f32;
                        let angle = std::f32::consts::PI * (1. + t);
                        center + egui::vec2(angle.cos(), angle.sin()) * radius
                    })
                    .collect()
            };
            let thickness = (radius * 0.16).clamp(6., 14.);
            ui.painter().add(egui::Shape::line(
                arc(0., 1.),
                egui::Stroke::new(thickness, palette.well),
            ));
            if value.is_some() && fraction > 0. {
                ui.painter().add(egui::Shape::line(
                    arc(0., fraction),
                    egui::Stroke::new(thickness, accent),
                ));
            }
            let font = |size: f32| egui::FontId::monospace(size);
            ui.painter().text(
                center - egui::vec2(0., radius * 0.18),
                egui::Align2::CENTER_BOTTOM,
                &text,
                font(fitted_size(radius * 1.3, text.chars().count(), 12., 30.)),
                if value.is_some() {
                    color
                } else {
                    palette.text_weak
                },
            );
            if !w.unit.is_empty() {
                ui.painter().text(
                    center - egui::vec2(0., radius * 0.18 - 4.),
                    egui::Align2::CENTER_TOP,
                    &w.unit,
                    egui::FontId::proportional(11.),
                    palette.text_weak,
                );
            }
            let limit = |x: f32, v: f64, align| {
                ui.painter().text(
                    egui::pos2(x, center.y + 4.),
                    align,
                    format!("{v}"),
                    egui::FontId::monospace(10.5),
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
                .unwrap_or(0.);
            let palette = super::theme::of(ui);
            let fill = rule.map_or(palette.accent, |r| colors::role(ui, r.role));
            if w.vertical {
                ui.horizontal(|ui| {
                    let height = (ui.available_height() - 8.).clamp(40., 220.);
                    let (rect, response) =
                        ui.allocate_exact_size(egui::vec2(14., height), egui::Sense::hover());
                    describe(&response, format!("{}: {text} {}", w.label, w.unit));
                    ui.painter().rect_filled(rect, 2, palette.well);
                    let level = egui::Rect::from_min_max(
                        egui::pos2(rect.left(), rect.bottom() - rect.height() * ratio as f32),
                        rect.right_bottom(),
                    );
                    ui.painter().rect_filled(level, 2, fill);
                    ui.vertical(|ui| {
                        ui.label(RichText::new(&text).monospace().color(color));
                        ui.label(RichText::new(&w.unit).small().color(palette.text_weak));
                    });
                });
            } else {
                level_bar(ui, ratio as f32, &text, &w.unit, fill);
            }
        }
        WidgetKind::EncoderDisplay => {
            let scaled = value
                .map(|v| format!("{:.*}", w.decimals.min(9), v * w.factor))
                .unwrap_or("—".into());
            readout(ui, &scaled, &w.unit, color, 34.);
            if w.show_raw {
                ui.weak(format!("Raw: {text} {}", w.secondary_unit));
            }
        }
        WidgetKind::LedIndicator | WidgetKind::StateLed => {
            // A State LED lights in the colour of its matching state; an LED
            // indicator lights when the value equals its on value.
            let on = if w.kind == WidgetKind::StateLed && rule.is_some() {
                true
            } else {
                value.is_some_and(|v| v == w.on_value)
            };
            let lit = rule.map_or(colors::role(ui, Role::Ok), |r| colors::role(ui, r.role));
            ui.horizontal(|ui| {
                lamp(ui, raw.map(|_| on), lit, 8.);
                ui.label(
                    rule.map(|r| r.label.clone())
                        .filter(|s| !s.is_empty())
                        .unwrap_or(
                            if raw.is_none() {
                                "Waiting"
                            } else if on {
                                &w.on_label
                            } else {
                                &w.off_label
                            }
                            .into(),
                        ),
                );
            });
        }
        WidgetKind::StatusMatrix => {
            let palette = super::theme::of(ui);
            let lit = colors::role(ui, Role::Ok);
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
                .show(ui, |ui| {
                    // Most significant bit first, as in a register diagram.
                    for bit in (0..bits).rev() {
                        let on = raw.map(|v| (v as u32) & (1 << bit) != 0);
                        let name = meta.and_then(|m| m.bit_name(bit));
                        let (rect, response) =
                            ui.allocate_exact_size(egui::vec2(cell, 18.), egui::Sense::hover());
                        let (fill, text) = match on {
                            Some(true) => (lit.gamma_multiply(0.85), palette.well),
                            Some(false) => (palette.well, palette.text_weak),
                            None => (Color32::TRANSPARENT, palette.text_weak),
                        };
                        ui.painter().rect(
                            rect,
                            2,
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
                            _ => bit.to_string(),
                        };
                        ui.painter().text(
                            rect.center(),
                            egui::Align2::CENTER_CENTER,
                            label,
                            egui::FontId::monospace(10.),
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
            if ui
                .add_enabled(
                    session.controlled() && !editing && e.writable,
                    egui::Button::new(
                        RichText::new(&w.label)
                            .strong()
                            .color(colors::role(ui, Role::Accent)),
                    )
                    .min_size(egui::vec2(ui.available_width(), 30.)),
                )
                .clicked()
            {
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
            ui.label(RichText::new(&text).monospace().color(color));
            ui.horizontal(|ui| {
                let enabled = session.controlled() && !editing && e.writable;
                let input = ui.add(
                    egui::TextEdit::singleline(&mut w.value)
                        .font(egui::TextStyle::Monospace)
                        .desired_width((ui.available_width() - 60.).max(40.)),
                );
                let submit = input.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
                if (ui
                    .add_enabled(enabled, egui::Button::new("Write"))
                    .clicked()
                    || submit)
                    && enabled
                {
                    session.write_formatted(
                        binding.space,
                        &e,
                        &w.value,
                        shown(w.format, meta),
                        meta,
                        w.confirm,
                    );
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
            egui::ComboBox::from_id_salt("options")
                .width(ui.available_width().min(220.))
                .selected_text(match current {
                    Some(o) => RichText::new(&o.label).color(color),
                    None if raw.is_some() => RichText::new(&text).monospace(),
                    None => RichText::new("—").color(super::theme::of(ui).text_weak),
                })
                .show_ui(ui, |ui| {
                    for o in &w.options {
                        let chosen = current.is_some_and(|c| std::ptr::eq(c, o));
                        if ui
                            .add_enabled(
                                session.controlled() && !editing && e.writable,
                                egui::Button::new(&o.label).selected(chosen),
                            )
                            .clicked()
                        {
                            session.write(binding.space, &e, &o.value, meta, w.confirm);
                            ui.close_menu();
                        }
                    }
                });
        }
        WidgetKind::MiniPlot => {
            session.want_history(binding);
            super::theme::plot_tone(ui, |ui| {
                egui_plot::Plot::new("mini-plot")
                    .height((w.height - 70.).max(40.))
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
                                plot.line(egui_plot::Line::new(points).color(color));
                            }
                        }
                    })
            });
        }
        _ => {}
    }
    if let Some(outcome) = session.writes.get(&(binding.space, binding.address)) {
        ui.horizontal(|ui| colors::outcome_inline(ui, outcome));
    }
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
        WidgetKind::Container
            | WidgetKind::DeviceInfo
            | WidgetKind::DirectionalControl
            | WidgetKind::DataTable
            | WidgetKind::AlarmList
    ) {
        return None;
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
/// A large numeric readout with its unit, sized to the space available.
fn readout(ui: &mut egui::Ui, text: &str, unit: &str, color: Color32, max: f32) {
    let palette = super::theme::of(ui);
    let unit_width = if unit.is_empty() {
        0.
    } else {
        unit.len() as f32 * 8. + 8.
    };
    let size = fitted_size(
        ui.available_width() - unit_width,
        text.chars().count(),
        14.,
        max.min(ui.available_height() * 0.8).max(14.),
    );
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 6.;
        ui.label(RichText::new(text).monospace().size(size).color(color));
        if !unit.is_empty() {
            ui.label(RichText::new(unit).color(palette.text_weak));
        }
    });
}
/// A horizontal level bar: track, fill and the value with its unit.
fn level_bar(ui: &mut egui::Ui, ratio: f32, text: &str, unit: &str, color: Color32) {
    let palette = super::theme::of(ui);
    ui.horizontal(|ui| {
        ui.label(RichText::new(text).monospace().color(palette.text));
        if !unit.is_empty() {
            ui.label(RichText::new(unit).small().color(palette.text_weak));
        }
    });
    let (rect, response) =
        ui.allocate_exact_size(egui::vec2(ui.available_width(), 8.), egui::Sense::hover());
    describe(&response, format!("{text} {unit}"));
    ui.painter().rect_filled(rect, 2, palette.well);
    if ratio > 0. {
        let fill =
            egui::Rect::from_min_size(rect.min, egui::vec2(rect.width() * ratio, rect.height()));
        ui.painter().rect_filled(fill, 2, color);
    }
}
/// Gives a custom-painted read-out an accessible label for screen readers.
fn describe(response: &egui::Response, label: impl Into<String>) {
    let label = label.into();
    response.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Label, true, label.trim()));
}
/// An indicator lamp: filled when on, a ring when off, dashed when unknown.
fn lamp(ui: &mut egui::Ui, state: Option<bool>, color: Color32, radius: f32) {
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
        }
        Some(false) => {
            ui.painter().circle(
                center,
                radius,
                palette.well,
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
