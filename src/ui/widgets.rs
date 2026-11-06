use super::colors;
use super::{session::Session, Pane};
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
        ui.checkbox(&mut pane.editing, "Edit dashboard");
        if pane.editing {
            if profile.id == "cnc_motor_controller" && ui.button("Add CNC panels").clicked() {
                let mut panels = default_profiles().remove(1).dashboards;
                for panel in &mut panels {
                    panel.id = unique_id();
                }
                profile.dashboards.extend(panels);
                pane.dashboard = profile.dashboards.len() - 3;
            }
            if ui.button("New").clicked() {
                profile.dashboards.push(Dashboard {
                    id: unique_id(),
                    name: "Dashboard".into(),
                    widgets: vec![],
                });
                pane.dashboard = profile.dashboards.len() - 1;
            }
            if ui.button("Duplicate").clicked() {
                let mut d = profile.dashboards[pane.dashboard].clone();
                d.id = unique_id();
                d.name.push_str(" Copy");
                profile.dashboards.push(d);
                pane.dashboard = profile.dashboards.len() - 1;
            }
            if profile.dashboards.len() > 1 && ui.button("Delete").clicked() {
                profile.dashboards.remove(pane.dashboard);
                pane.dashboard = 0;
            }
        }
    });
    let snapshot = profile.clone();
    let d = &mut profile.dashboards[pane.dashboard];
    if pane.editing {
        ui.horizontal(|ui| {
            ui.text_edit_singleline(&mut d.name);
            add_widget_menu(ui, &mut d.widgets);
        });
    }
    ui.separator();
    egui::ScrollArea::vertical().show(ui, |ui| {
        render_grid(
            ui,
            &mut d.widgets,
            pane.editing,
            session,
            &snapshot,
            prefs,
            0,
        );
    });
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
fn render_grid(
    ui: &mut egui::Ui,
    widgets: &mut Vec<Widget>,
    editing: bool,
    session: &mut Session,
    profile: &Profile,
    prefs: &Preferences,
    depth: usize,
) {
    if depth > 8 {
        ui.label("Maximum container depth reached");
        return;
    }
    let mut remove = None;
    let mut swap = None;
    let available = ui.available_width();
    let widest = widgets
        .iter()
        .map(|w| w.width.clamp(180., 1600.) + 24.)
        .fold(1_f32, f32::max);
    let columns = (available / widest).floor().max(1.) as usize;
    egui::Grid::new(("widget-grid", depth))
        .num_columns(columns)
        .spacing(egui::vec2(8., 8.))
        .show(ui, |ui| {
            for (index, w) in widgets.iter_mut().enumerate() {
                ui.push_id(w.id.clone(), |ui| {
                    ui.vertical(|ui| {
                        let frame = egui::Frame::new()
                            .fill(ui.visuals().faint_bg_color)
                            .corner_radius(6.)
                            .inner_margin(egui::Margin::same(if w.kind == WidgetKind::Container {
                                w.padding.clamp(0., 32.) as i8
                            } else {
                                6
                            }))
                            .show(ui, |ui| {
                                ui.set_width(
                                    w.width.clamp(180., 1600.).min((available - 24.).max(100.)),
                                );
                                // Controls fit their content; plots retain their configured canvas height.
                                if w.kind == WidgetKind::MiniPlot {
                                    ui.set_min_height(w.height.clamp(80., 1200.));
                                }
                                if editing || w.kind != WidgetKind::Button {
                                    ui.horizontal(|ui| {
                                        ui.label(RichText::new(&w.label).strong());
                                        if editing {
                                            ui.dnd_drag_source(
                                                egui::Id::new((&w.id, "drag")),
                                                index,
                                                |ui| {
                                                    ui.label("≡");
                                                },
                                            );
                                            if ui.small_button("←").clicked() && index > 0 {
                                                swap = Some((index, index - 1));
                                            }
                                            if ui.small_button("→").clicked() {
                                                swap = Some((index, index + 1));
                                            }
                                            if ui.small_button("×").clicked() {
                                                remove = Some(index);
                                            }
                                        }
                                    });
                                }
                                if editing {
                                    ui.collapsing("Configure", |ui| config(ui, w, profile));
                                }
                                render_widget(ui, w, editing, session, profile, prefs, depth);
                            });
                        if editing {
                            if let Some(source) = frame.response.dnd_release_payload::<usize>() {
                                swap = Some((*source, index));
                            }
                        }
                    });
                });
                if (index + 1) % columns == 0 {
                    ui.end_row();
                }
            }
        });
    if let Some(i) = remove {
        widgets.remove(i);
    } else if let Some((a, b)) = swap {
        if b < widgets.len() {
            widgets.swap(a, b);
        }
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
    egui::ComboBox::from_id_salt("binding")
        .selected_text(text)
        .width(250.)
        .show_ui(ui, |ui| {
            if ui.selectable_label(binding.is_none(), "Unbound").clicked() {
                *binding = None;
            }
            for s in Space::ALL {
                if writable && s == Space::SysRegister {
                    continue;
                }
                ui.collapsing(s.title(), |ui| {
                    for e in profile
                        .entries(s)
                        .into_iter()
                        .filter(|e| !writable || e.writable)
                    {
                        if ui
                            .selectable_label(
                                binding
                                    .as_ref()
                                    .is_some_and(|b| b.space == s && b.name == e.name),
                                &e.name,
                            )
                            .clicked()
                        {
                            *binding = Some(Binding::new(s, &e));
                            ui.close_menu();
                        }
                    }
                });
            }
        });
}
fn config(ui: &mut egui::Ui, w: &mut Widget, profile: &Profile) {
    ui.text_edit_singleline(&mut w.label);
    if w.kind == WidgetKind::ProgressBar {
        ui.checkbox(&mut w.vertical, "Vertical");
    }
    if w.kind == WidgetKind::MiniPlot {
        ui.add(egui::Slider::new(&mut w.poll_ms, 50..=5000).text("Interval (ms)"));
        ui.add(egui::Slider::new(&mut w.time_span, 1.0..=3600.).text("Time span (seconds)"));
    }
    if w.kind == WidgetKind::Container {
        ui.add(egui::Slider::new(&mut w.padding, 0.0..=32.).text("Padding"));
        ui.add(egui::Slider::new(&mut w.spacing, 0.0..=32.).text("Spacing"));
    }

    egui::ComboBox::from_id_salt("format")
        .selected_text(w.format.title())
        .show_ui(ui, |ui| {
            for format in DisplayFormat::ALL {
                ui.selectable_value(&mut w.format, format, format.title());
            }
        });
    if w.kind == WidgetKind::LedIndicator {
        ui.label("On value");
        ui.add(egui::DragValue::new(&mut w.on_value));
        ui.text_edit_singleline(&mut w.on_label);
        ui.text_edit_singleline(&mut w.off_label);
    }
    if w.kind == WidgetKind::AlarmList {
        ui.checkbox(&mut w.show_inactive, "Show clear alarms");
    }

    ui.horizontal(|ui| {
        ui.label("Width");
        ui.add(egui::DragValue::new(&mut w.width).range(180.0..=1600.));
        if w.kind == WidgetKind::MiniPlot {
            ui.label("Height");
            ui.add(egui::DragValue::new(&mut w.height).range(80.0..=1200.));
        }
    });
    if !matches!(
        w.kind,
        WidgetKind::DeviceInfo
            | WidgetKind::Container
            | WidgetKind::DirectionalControl
            | WidgetKind::DataTable
            | WidgetKind::AlarmList
    ) {
        binding_picker(
            ui,
            &mut w.binding,
            profile,
            matches!(
                w.kind,
                WidgetKind::Button | WidgetKind::Dropdown | WidgetKind::ValueWrite
            ),
        );
    }
    if matches!(w.kind, WidgetKind::Gauge | WidgetKind::ProgressBar) {
        ui.horizontal(|ui| {
            ui.label("Range");
            ui.add(egui::DragValue::new(&mut w.min));
            ui.add(egui::DragValue::new(&mut w.max));
        });
    }
    if w.kind == WidgetKind::EncoderDisplay {
        ui.add(egui::Slider::new(&mut w.decimals, 0..=9).text("Decimals"));
        ui.checkbox(&mut w.show_raw, "Show raw value");
        ui.text_edit_singleline(&mut w.secondary_unit);
        ui.horizontal(|ui| {
            ui.label("Conversion factor");
            ui.add(egui::DragValue::new(&mut w.factor).speed(0.01));
        });
    }
    ui.horizontal(|ui| {
        ui.label("Unit");
        ui.text_edit_singleline(&mut w.unit);
    });
    if w.kind == WidgetKind::Button {
        let mut command = w.command.is_some();
        ui.checkbox(&mut command, "Command target");
        if command {
            ui.add(egui::DragValue::new(w.command.get_or_insert(0)));
        } else {
            w.command = None;
        }
        ui.label("Value to send");
        ui.text_edit_singleline(&mut w.value);
    }
    if w.kind == WidgetKind::DirectionalControl {
        let mut remove = None;
        for (i, d) in w.directions.iter_mut().enumerate() {
            ui.push_id(i, |ui| {
                ui.horizontal(|ui| {
                    egui::ComboBox::from_id_salt("direction")
                        .selected_text(&d.direction)
                        .show_ui(ui, |ui| {
                            for direction in [
                                "up",
                                "down",
                                "left",
                                "right",
                                "upLeft",
                                "upRight",
                                "downLeft",
                                "downRight",
                            ] {
                                ui.selectable_value(&mut d.direction, direction.into(), direction);
                            }
                        });
                    ui.add(egui::DragValue::new(&mut d.command));
                    ui.text_edit_singleline(&mut d.label);
                    if ui.small_button("×").clicked() {
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
                direction: "up".into(),
                command: 0,
                label: String::new(),
            });
        }
        ui.label("Command argument");
        ui.text_edit_singleline(&mut w.value);
    }
    if matches!(
        w.kind,
        WidgetKind::Button
            | WidgetKind::ValueWrite
            | WidgetKind::Dropdown
            | WidgetKind::DirectionalControl
    ) {
        ui.checkbox(&mut w.confirm, "Confirm before sending");
    }
    if w.kind == WidgetKind::Dropdown {
        let mut remove = None;
        for (i, o) in w.options.iter_mut().enumerate() {
            ui.horizontal(|ui| {
                ui.text_edit_singleline(&mut o.value);
                ui.text_edit_singleline(&mut o.label);
                if ui.small_button("×").clicked() {
                    remove = Some(i);
                }
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
                    if ui.small_button("×").clicked() {
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
                    for rule in &mut style.thresholds {
                        ui.horizontal(|ui| {
                            ui.text_edit_singleline(&mut rule.op);
                            ui.add(egui::DragValue::new(&mut rule.value));
                            ui.text_edit_singleline(&mut rule.role);
                            ui.text_edit_singleline(&mut rule.label);
                        });
                    }
                    if ui.button("Add row condition").clicked() {
                        style.thresholds.push(Threshold {
                            op: ">".into(),
                            value: 0.,
                            role: "warn".into(),
                            label: String::new(),
                        });
                    }
                });
            });
        }
        if let Some(i) = remove {
            w.rows.remove(i);
        }
    }
    ui.collapsing("Thresholds / state labels", |ui| {
        let mut remove = None;
        for (i, t) in w.thresholds.iter_mut().enumerate() {
            ui.push_id(i, |ui| {
                ui.horizontal(|ui| {
                    egui::ComboBox::from_id_salt("op")
                        .selected_text(&t.op)
                        .show_ui(ui, |ui| {
                            for op in ["==", ">", ">=", "<", "<="] {
                                ui.selectable_value(&mut t.op, op.into(), op);
                            }
                        });
                    ui.add(egui::DragValue::new(&mut t.value));
                    egui::ComboBox::from_id_salt("role")
                        .selected_text(&t.role)
                        .show_ui(ui, |ui| {
                            for role in ["ok", "warn", "error", "idle"] {
                                ui.selectable_value(&mut t.role, role.into(), role);
                            }
                        });
                    if ui.small_button("×").clicked() {
                        remove = Some(i);
                    }
                });
                ui.text_edit_singleline(&mut t.label);
            });
        }
        if let Some(i) = remove {
            w.thresholds.remove(i);
        }
        if ui.button("Add threshold").clicked() {
            w.thresholds.push(Threshold {
                op: ">".into(),
                value: 0.,
                role: "warn".into(),
                label: String::new(),
            });
        }
    });
}
pub(super) fn review(ui: &mut egui::Ui, b: &mut Binding, profile: &Profile) -> bool {
    if b.matches(profile) {
        return true;
    }
    ui.colored_label(colors::role(ui, "warn"), "Binding needs review");
    ui.label(format!("{} previously at {}", b.name, b.address));
    if let Some(e) = profile.resolve(b) {
        if ui
            .button(format!("Follow {} to {}", e.name, e.address))
            .clicked()
        {
            *b = Binding::new(b.space, &e);
        }
    }
    if let Some(e) = profile
        .entries(b.space)
        .into_iter()
        .find(|e| e.address == b.address)
    {
        if ui
            .button(format!("Keep address: bind {}", e.name))
            .clicked()
        {
            *b = Binding::new(b.space, &e);
        }
    }
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
        if editing {
            add_widget_menu(ui, &mut w.children);
        }
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
            );
        });
        return;
    }
    if w.kind == WidgetKind::DeviceInfo {
        if let Some(c) = &session.connection {
            ui.heading(c.device_name.as_deref().unwrap_or(&c.ip));
            ui.label(format!("{}:{} {:?}", c.ip, c.port, c.interface_type));
            colors::connection(ui, session);
            ui.label(format!("Control: {}", c.control_state));
        } else {
            ui.label("Offline");
        }
        return;
    }
    if matches!(w.kind, WidgetKind::DataTable | WidgetKind::AlarmList) {
        for b in &mut w.rows {
            ui.push_id(b.name.clone(), |ui| {
                if !review(ui, b, profile) {
                    return;
                }
                session.interest(b, profile, prefs.poll_ms);
                let e = profile
                    .entries(b.space)
                    .into_iter()
                    .find(|e| e.address == b.address)
                    .unwrap();
                let r = session
                    .readings
                    .get(&(b.space, b.address))
                    .filter(|r| r.valid)
                    .cloned();
                let value = r.as_ref().map(|r| e.decode(r.value));
                let style = w.row_styles.get(&b.name);
                let rules = style
                    .map(|s| s.thresholds.as_slice())
                    .unwrap_or(&w.thresholds);
                let rule = value.and_then(|v| rules.iter().find(|t| t.matches(v)));
                if w.kind == WidgetKind::AlarmList
                    && !w.show_inactive
                    && value.is_some()
                    && !rule.is_some_and(|r| r.role == "warn" || r.role == "error")
                {
                    return;
                }
                let color = rule
                    .map(|r| colors::role(ui, &r.role))
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
                                style
                                    .map(|s| s.format)
                                    .unwrap_or(w.format)
                                    .format(&e, r.value)
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
                            .add_enabled(session.controlled(), egui::Button::new("Write"))
                            .clicked()
                        {
                            session.write_formatted(
                                b.space,
                                &e,
                                &input,
                                style.map(|s| s.format).unwrap_or(w.format),
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
                    match d.direction.as_str() {
                        "up" => "↑",
                        "down" => "↓",
                        "left" => "←",
                        "right" => "→",
                        "upLeft" => "↖",
                        "upRight" => "↗",
                        "downLeft" => "↙",
                        _ => "↘",
                    }
                } else {
                    &d.label
                };
                let response = ui.add_enabled(
                    session.connected(),
                    egui::Button::new(label).min_size(egui::vec2(45., 35.)),
                );
                let id = ui.id().with(("jog", &d.direction));
                let now = ui.input(|i| i.time);
                let last = ui
                    .ctx()
                    .data_mut(|data| data.get_temp::<f64>(id).unwrap_or(-1.));
                if response.clicked()
                    || (!w.confirm && response.is_pointer_button_down_on() && now - last > 0.15)
                {
                    match w.value.parse() {
                        Ok(value) => {
                            session.command(d.command, value, w.confirm);
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
                session.controlled(),
                egui::Button::new(
                    RichText::new(&w.label)
                        .strong()
                        .color(colors::role(ui, "accent")),
                )
                .min_size(egui::vec2(ui.available_width(), 30.)),
            )
            .clicked()
        {
            match w.value.parse() {
                Ok(v) => session.command(command, v, w.confirm),
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
    let e = profile
        .entries(binding.space)
        .into_iter()
        .find(|e| e.address == binding.address)
        .unwrap();
    let r = session
        .readings
        .get(&(binding.space, binding.address))
        .filter(|r| r.valid);
    let raw = r.map(|r| r.value);
    let value = raw.map(|v| e.decode(v));
    let rule = value.and_then(|v| w.thresholds.iter().find(|t| t.matches(v)));
    let color = rule
        .map(|r| colors::role(ui, &r.role))
        .unwrap_or(ui.visuals().text_color());
    let text = raw.map(|v| w.format.format(&e, v)).unwrap_or("—".into());
    match w.kind {
        WidgetKind::ValueRead => {
            ui.label(RichText::new(&text).size(32.).monospace().color(color));
            if !w.unit.is_empty() {
                ui.weak(&w.unit);
            }
        }
        WidgetKind::Gauge => {
            if w.max <= w.min {
                ui.colored_label(colors::role(ui, "warn"), "Maximum must exceed minimum");
                return;
            }
            let (rect, _) = ui.allocate_exact_size(
                egui::vec2(w.width.min(280.) - 20., 95.),
                egui::Sense::hover(),
            );
            let center = egui::pos2(rect.center().x, rect.bottom() - 8.);
            let radius = rect.height() - 16.;
            let fraction = value
                .map(|v| ((v - w.min) / (w.max - w.min)).clamp(0., 1.))
                .unwrap_or(0.) as f32;
            let points: Vec<_> = (0..=40)
                .map(|i| {
                    let angle = std::f32::consts::PI * (1. + i as f32 / 40.);
                    center + egui::vec2(angle.cos(), angle.sin()) * radius
                })
                .collect();
            ui.painter().add(egui::Shape::line(
                points,
                egui::Stroke::new(7_f32, ui.visuals().faint_bg_color),
            ));
            let a = std::f32::consts::PI * (1. + fraction);
            ui.painter().line_segment(
                [
                    center,
                    center + egui::vec2(a.cos(), a.sin()) * (radius - 8.),
                ],
                egui::Stroke::new(3_f32, color),
            );
            ui.label(
                RichText::new(format!("{} {}", text, w.unit))
                    .size(24.)
                    .color(color),
            );
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
            if w.vertical {
                let (rect, _) = ui.allocate_exact_size(egui::vec2(32., 110.), egui::Sense::hover());
                ui.painter()
                    .rect_filled(rect, 2., ui.visuals().faint_bg_color);
                let fill = egui::Rect::from_min_max(
                    egui::pos2(rect.left(), rect.bottom() - rect.height() * ratio as f32),
                    rect.right_bottom(),
                );
                ui.painter().rect_filled(fill, 2., color);
                ui.label(format!("{} {}", text, w.unit));
            } else {
                ui.add(
                    egui::ProgressBar::new(ratio as f32)
                        .fill(color)
                        .text(format!("{} {}", text, w.unit)),
                );
            }
        }
        WidgetKind::EncoderDisplay => {
            ui.label(
                RichText::new(
                    value
                        .map(|v| format!("{:.*} {}", w.decimals.min(9), v * w.factor, w.unit))
                        .unwrap_or("—".into()),
                )
                .size(28.)
                .color(color),
            );
            if w.show_raw {
                ui.weak(format!("Raw: {text} {}", w.secondary_unit));
            }
        }
        WidgetKind::LedIndicator | WidgetKind::StateLed => {
            let on = value.is_some_and(|v| v == w.on_value);
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new(if on { "●" } else { "○" })
                        .size(24.)
                        .color(if raw.is_none() { Color32::GRAY } else { color }),
                );
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
            egui::Grid::new("bits").num_columns(8).show(ui, |ui| {
                for bit in 0..32 {
                    let on = raw.is_some_and(|v| (v as u32) & (1 << bit) != 0);
                    ui.colored_label(
                        if on {
                            colors::role(ui, "ok")
                        } else {
                            Color32::GRAY
                        },
                        format!("{bit:02} {}", if on { "●" } else { "○" }),
                    );
                    if bit % 8 == 7 {
                        ui.end_row();
                    }
                }
            });
        }
        WidgetKind::Button => {
            if ui
                .add_enabled(
                    session.controlled() && e.writable,
                    egui::Button::new(
                        RichText::new(&w.label)
                            .strong()
                            .color(colors::role(ui, "accent")),
                    )
                    .min_size(egui::vec2(ui.available_width(), 30.)),
                )
                .clicked()
            {
                session.write_formatted(binding.space, &e, &w.value, w.format, w.confirm);
            }
        }
        WidgetKind::ValueWrite => {
            ui.monospace(&text);
            ui.text_edit_singleline(&mut w.value);
            if ui
                .add_enabled(
                    session.controlled() && e.writable,
                    egui::Button::new("Write"),
                )
                .clicked()
            {
                session.write_formatted(binding.space, &e, &w.value, w.format, w.confirm);
            }
        }
        WidgetKind::Dropdown => {
            ui.monospace(&text);
            egui::ComboBox::from_id_salt("options")
                .selected_text("Select value")
                .show_ui(ui, |ui| {
                    for o in &w.options {
                        if ui
                            .add_enabled(
                                session.controlled() && e.writable,
                                egui::Button::new(&o.label),
                            )
                            .clicked()
                        {
                            session.write(binding.space, &e, &o.value, w.confirm);
                            ui.close_menu();
                        }
                    }
                });
        }
        WidgetKind::MiniPlot => {
            egui_plot::Plot::new("mini-plot")
                .height(110.)
                .show_axes([false, true])
                .show(ui, |plot| {
                    if let Some(h) = session.histories.get(&(binding.space, binding.address)) {
                        let points: Vec<_> = h
                            .iter()
                            .copied()
                            .filter(|v| h.back().is_some_and(|last| v[0] >= last[0] - w.time_span))
                            .collect();
                        plot.line(egui_plot::Line::new(points).color(color));
                    }
                });
        }
        _ => {}
    }
    if let Some(outcome) = session.writes.get(&(binding.space, binding.address)) {
        colors::outcome(ui, outcome);
    }
    let (role, label) = colors::reading(
        session.connected(),
        session.readings.get(&(binding.space, binding.address)),
        Some(if w.kind == WidgetKind::MiniPlot {
            w.poll_ms
        } else {
            prefs.poll_ms
        }),
    );
    ui.colored_label(colors::role(ui, role), RichText::new(label).small());
}
