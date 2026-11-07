use super::{clock, colors, controls, theme};
use super::{
    session::{ImportTarget, Session},
    widgets, Pane, PaneKind,
};
use crate::model::Role;
use crate::{model::*, types::*};
use eframe::egui::{self, Color32, RichText};
use egui_dock::{NodeIndex, SurfaceIndex, TabViewer};

pub struct Viewer<'a> {
    pub session: &'a mut Session,
    pub profile: &'a mut Profile,
    pub prefs: &'a Preferences,
    pub series: &'a mut Vec<PlotSeries>,
    pub moved: &'a mut Vec<super::PaneMove>,
    pub added: &'a mut Vec<super::PaneRequest>,
    pub window_id: &'a str,
    pub destinations: &'a [(String, String)],
}
impl TabViewer for Viewer<'_> {
    type Tab = Pane;
    fn title(&mut self, p: &mut Pane) -> egui::WidgetText {
        p.kind.title().into()
    }
    fn id(&mut self, p: &mut Pane) -> egui::Id {
        egui::Id::new(&p.id)
    }
    fn ui(&mut self, ui: &mut egui::Ui, p: &mut Pane) {
        ui.push_id(p.id.clone(), |ui| self.content(ui, p));
    }
    fn context_menu(&mut self, ui: &mut egui::Ui, p: &mut Pane, _s: SurfaceIndex, _n: NodeIndex) {
        if ui.button("Move to new native window").clicked() {
            self.moved.push(super::PaneMove {
                source: self.window_id.into(),
                target: None,
                pane: p.clone(),
            });
            ui.close_menu();
        }
        ui.menu_button("Move to window", |ui| {
            for (id, title) in self
                .destinations
                .iter()
                .filter(|(id, _)| id != self.window_id)
            {
                if ui.button(title).clicked() {
                    self.moved.push(super::PaneMove {
                        source: self.window_id.into(),
                        target: Some(id.clone()),
                        pane: p.clone(),
                    });
                    ui.close_menu();
                }
            }
        });
        if ui.button("Focus pane").clicked() {
            p.focus = true;
            ui.close_menu();
        }
        if !p.kind.singleton() && ui.button("Duplicate pane").clicked() {
            let mut copy = p.clone();
            copy.id = unique_id();
            self.added.push(super::PaneRequest::Open(Box::new(copy)));
            ui.close_menu();
        }
    }
    fn on_close(&mut self, p: &mut Pane) -> bool {
        if p.kind == PaneKind::MapEditor
            && p.draft
                .as_ref()
                .is_some_and(|d| d.maps_differ(self.profile))
        {
            self.session.notice =
                "Save or Revert the Map Editor changes before closing the pane".into();
            false
        } else {
            true
        }
    }
    fn scroll_bars(&self, _: &Pane) -> [bool; 2] {
        [false, false]
    }
}
impl Viewer<'_> {
    fn content(&mut self, ui: &mut egui::Ui, p: &mut Pane) {
        match p.kind {
            PaneKind::Overview => self.overview(ui),
            PaneKind::Registers => self.entries(ui, p, Space::Register),
            PaneKind::Parameters => self.entries(ui, p, Space::Parameter),
            PaneKind::System => self.entries(ui, p, Space::SysRegister),
            PaneKind::Commands => self.commands(ui, p),
            PaneKind::Inspector => self.inspector(ui, p),
            PaneKind::Log => self.logs(ui, p),
            PaneKind::Plot => self.plot(ui, p),
            PaneKind::Dashboard => {
                widgets::dashboard(ui, p, self.session, self.profile, self.prefs)
            }
            PaneKind::MapEditor => self.editor(ui, p),
        }
    }
    fn overview(&mut self, ui: &mut egui::Ui) {
        let palette = theme::of(ui);
        egui::ScrollArea::vertical().show(ui, |ui| {
            ui.label(theme::caption(ui, "Device"));
            let device = self
                .session
                .connection
                .as_ref()
                .and_then(|c| self.session.devices.iter().find(|d| d.ip_address == c.ip));
            egui::Grid::new("overview-device")
                .num_columns(2)
                .spacing([16., 5.])
                .show(ui, |ui| {
                    let (role, state) = match &self.session.connection {
                        Some(c) if c.reconnecting => (Role::Warn, "Reconnecting"),
                        _ if self.session.busy => (Role::Info, "Connecting"),
                        Some(_) if self.session.connected() => (Role::Ok, "Connected"),
                        _ => (Role::Idle, "Not connected"),
                    };
                    key(ui, "State");
                    ui.horizontal(|ui| {
                        ui.label(RichText::new("●").color(colors::role(ui, role)));
                        ui.label(state);
                    });
                    ui.end_row();
                    if let Some(c) = &self.session.connection {
                        if let Some(name) = c.device_name.as_ref().or(device.map(|d| &d.board_name))
                        {
                            key(ui, "Name");
                            ui.label(name);
                            ui.end_row();
                        }
                        key(ui, "Address");
                        ui.monospace(format!("{}:{}", c.ip, c.port));
                        ui.end_row();
                        key(ui, "Transport");
                        ui.label(format!("{:?}", c.interface_type).to_uppercase());
                        ui.end_row();
                        key(ui, "Control");
                        if self.session.controlled() {
                            ui.label(
                                RichText::new("Held by this session")
                                    .color(colors::role(ui, Role::Accent)),
                            );
                        } else {
                            ui.label(
                                RichText::new(format!(
                                    "Held by {}",
                                    super::session::control_interface_name(c.control_state as i32)
                                ))
                                .color(colors::role(ui, Role::Warn)),
                            );
                        }
                        ui.end_row();
                    }
                    if let Some(d) = device {
                        key(ui, "Board");
                        ui.label(self.profile.board_type_name(d.board_type));
                        ui.end_row();
                        key(ui, "Firmware");
                        ui.monospace(format!("0x{:04X}", d.firmware_version));
                        ui.end_row();
                        key(ui, "Device ID");
                        ui.monospace(d.device_id.to_string());
                        ui.end_row();
                        key(ui, "MAC");
                        ui.monospace(&d.mac_address);
                        ui.end_row();
                    }
                });
            if self.session.connection.is_none() {
                ui.label(
                    RichText::new("Open the device menu in the toolbar to scan or connect.")
                        .color(palette.text_weak),
                );
            }
            ui.add_space(10.);
            ui.label(theme::caption(ui, "System registers"));
            let parsed = self.profile.parsed(Space::SysRegister);
            egui::Grid::new("overview-system")
                .num_columns(2)
                .spacing([16., 5.])
                .show(ui, |ui| {
                    for e in parsed.entries.iter().take(8) {
                        self.session.interest(
                            &Binding::new(Space::SysRegister, e),
                            self.profile,
                            1000,
                        );
                        key(ui, &e.name);
                        let value = self
                            .session
                            .readings
                            .get(&(Space::SysRegister, e.address))
                            .filter(|r| r.valid)
                            .map_or("—".into(), |r| e.format(r.value));
                        ui.monospace(value);
                        ui.end_row();
                    }
                });
            ui.add_space(10.);
            ui.label(theme::caption(ui, "Profile"));
            egui::Grid::new("overview-profile")
                .num_columns(2)
                .spacing([16., 5.])
                .show(ui, |ui| {
                    key(ui, "Name");
                    ui.label(&self.profile.name);
                    ui.end_row();
                    for s in Space::ALL {
                        key(ui, s.title());
                        ui.monospace(self.profile.parsed(s).entries.len().to_string());
                        ui.end_row();
                    }
                });
            ui.add_space(10.);
            ui.label(theme::caption(ui, "Recent activity"));
            let dark = ui.visuals().dark_mode;
            for l in self.session.logs.iter().rev().take(6) {
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new(clock::time_of_day(l.timestamp))
                            .monospace()
                            .small()
                            .color(palette.text_weak),
                    );
                    ui.label(RichText::new("●").small().color(log_color(dark, &l.level)));
                    ui.add(egui::Label::new(&l.message).truncate());
                });
            }
        });
    }
    fn entries(&mut self, ui: &mut egui::Ui, p: &mut Pane, s: Space) {
        let palette = theme::of(ui);
        let search = p.search.trim().to_lowercase();
        let parsed = self.profile.parsed(s);
        let entries: Vec<&Entry> = parsed
            .entries
            .iter()
            .filter(|e| {
                search.is_empty()
                    || e.name.to_lowercase().contains(&search)
                    || e.address.to_string() == search
            })
            .collect();
        ui.horizontal(|ui| {
            ui.add(
                egui::TextEdit::singleline(&mut p.search)
                    .hint_text("Filter by name or address")
                    .desired_width(200.),
            );
            ui.separator();
            ui.checkbox(&mut p.auto, "Live")
                .on_hover_text("Poll every listed entry at this interval");
            ui.add_enabled(
                p.auto,
                egui::DragValue::new(&mut p.interval)
                    .range(50..=10000)
                    .suffix(" ms"),
            );
            ui.separator();
            controls::segmented(
                ui,
                &mut p.format,
                &[
                    (DisplayFormat::Decimal, "DEC"),
                    (DisplayFormat::Hexadecimal, "HEX"),
                    (DisplayFormat::Binary, "BIN"),
                ],
            );
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if ui.button("Export CSV").clicked() {
                    let mut text = "address,name,type,value,valid\n".to_string();
                    for e in &entries {
                        let r = self.session.readings.get(&(s, e.address));
                        text.push_str(&format!(
                            "{},\"{}\",{},\"{}\",{}\n",
                            e.address,
                            e.name,
                            e.data_type,
                            r.map(|r| e.format(r.value)).unwrap_or_default(),
                            r.is_some_and(|r| r.valid)
                        ));
                    }
                    self.session.export(text, "entries.csv", "csv");
                }
                if ui
                    .add_enabled(self.session.connected(), egui::Button::new("Read all"))
                    .on_hover_text("Read every listed entry once")
                    .clicked()
                {
                    for e in &entries {
                        self.session.read(s, e);
                    }
                }
                ui.label(
                    RichText::new(format!("{} entries", entries.len()))
                        .small()
                        .color(palette.text_weak),
                );
            });
        });
        if p.auto {
            for e in &entries {
                self.session
                    .interest(&Binding::new(s, e), self.profile, p.interval);
            }
        }
        ui.add_space(4.);
        if entries.is_empty() {
            ui.label(
                RichText::new(if parsed.entries.is_empty() {
                    "This Profile defines no entries here. Add them in the Map Editor."
                } else {
                    "No entries match the filter."
                })
                .color(palette.text_weak),
            );
            return;
        }

        // In-place editing: the row being edited and its text, per pane.
        let edit_id = ui.id().with((&p.id, "editing"));
        let mut editing: Option<(u16, String)> = ui.ctx().data_mut(|d| d.get_temp(edit_id));
        let controlled = self.session.connected() && self.session.controlled();
        let connected = self.session.connected();
        let row_height = 24.;
        let mut clicked = None;
        let mut actions: Vec<RowAction> = vec![];
        egui_extras::TableBuilder::new(ui)
            .id_salt((&p.id, "entries"))
            .striped(true)
            .resizable(true)
            .sense(egui::Sense::click())
            .cell_layout(egui::Layout::left_to_right(egui::Align::Center))
            .column(egui_extras::Column::exact(52.))
            .column(egui_extras::Column::initial(230.).at_least(120.).clip(true))
            .column(egui_extras::Column::exact(70.))
            .column(egui_extras::Column::initial(150.).at_least(90.).clip(true))
            .column(egui_extras::Column::initial(84.).at_least(36.).clip(true))
            .column(egui_extras::Column::initial(130.).at_least(90.))
            .column(egui_extras::Column::remainder().at_least(120.))
            .header(22., |mut header| {
                for (title, right) in [
                    ("Addr", true),
                    ("Name", false),
                    ("Type", false),
                    ("Value", true),
                    ("Unit", false),
                    ("Status", false),
                    ("", false),
                ] {
                    header.col(|ui| {
                        let text = theme::caption(ui, title);
                        if right {
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    ui.label(text);
                                },
                            );
                        } else {
                            ui.label(text);
                        }
                    });
                }
            })
            .body(|body| {
                body.rows(row_height, entries.len(), |mut row| {
                    let e = entries[row.index()];
                    let selected = self
                        .session
                        .selection
                        .as_ref()
                        .is_some_and(|(ss, ee)| *ss == s && ee.address == e.address);
                    row.set_selected(selected);
                    let reading = self.session.readings.get(&(s, e.address));
                    let writable = e.writable && s != Space::SysRegister;
                    let is_editing = editing.as_ref().is_some_and(|(a, _)| *a == e.address);
                    row.col(|ui| {
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.label(
                                RichText::new(e.address.to_string())
                                    .monospace()
                                    .color(palette.text_weak),
                            );
                        });
                    });
                    row.col(|ui| {
                        ui.label(RichText::new(&e.name).color(palette.text));
                    });
                    row.col(|ui| {
                        ui.label(
                            RichText::new(e.data_type.as_str())
                                .small()
                                .color(palette.text_weak),
                        );
                    });
                    row.col(|ui| {
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if let Some((_, text)) = editing.as_mut().filter(|_| is_editing) {
                                let edit = ui.add(
                                    egui::TextEdit::singleline(text)
                                        .font(egui::TextStyle::Monospace)
                                        .horizontal_align(egui::Align::Max)
                                        .desired_width(f32::INFINITY),
                                );
                                if !edit.has_focus() && !edit.lost_focus() {
                                    edit.request_focus();
                                }
                                if ui.input(|i| i.key_pressed(egui::Key::Escape)) {
                                    actions.push(RowAction::Cancel);
                                } else if edit.lost_focus() {
                                    if ui.input(|i| i.key_pressed(egui::Key::Enter)) {
                                        actions.push(RowAction::Write(e.clone(), text.clone()));
                                    } else {
                                        actions.push(RowAction::Cancel);
                                    }
                                }
                            } else {
                                let text = match reading {
                                    Some(r) if r.valid => p.format.format(e, r.value),
                                    Some(_) => "error".into(),
                                    None => "—".into(),
                                };
                                let color = match reading {
                                    Some(r) if !r.valid => colors::role(ui, Role::Error),
                                    Some(_) => palette.text,
                                    None => palette.text_weak,
                                };
                                let value = ui.add(
                                    egui::Label::new(RichText::new(text).monospace().color(color))
                                        .sense(egui::Sense::click()),
                                );
                                if writable && controlled && value.double_clicked() {
                                    actions.push(RowAction::Edit(
                                        e.address,
                                        reading
                                            .filter(|r| r.valid)
                                            .map(|r| p.format.format(e, r.value))
                                            .unwrap_or_default(),
                                    ));
                                }
                            }
                        });
                    });
                    row.col(|ui| {
                        if let Some(m) = self.profile.metadata(s, &e.name) {
                            ui.label(RichText::new(&m.unit).color(palette.text_weak));
                        }
                    });
                    row.col(|ui| {
                        if let Some(outcome) = self.session.writes.get(&(s, e.address)) {
                            colors::outcome_inline(ui, outcome);
                        } else {
                            let (role, label) =
                                colors::reading(connected, reading, p.auto.then_some(p.interval));
                            ui.label(RichText::new("●").small().color(colors::role(ui, role)));
                            ui.label(RichText::new(label).small().color(palette.text_weak));
                        }
                    });
                    row.col(|ui| {
                        let hovered =
                            ui.rect_contains_pointer(ui.max_rect().expand2(egui::vec2(2000., 0.)));
                        if !(hovered || selected || is_editing) {
                            return;
                        }
                        if is_editing {
                            if let Some((_, text)) = &editing {
                                if ui.add(controls::primary(ui, "Write")).clicked() {
                                    actions.push(RowAction::Write(e.clone(), text.clone()));
                                }
                            }
                            if ui.small_button("Cancel").clicked() {
                                actions.push(RowAction::Cancel);
                            }
                            return;
                        }
                        if ui
                            .add_enabled(connected, egui::Button::new("Read").small())
                            .clicked()
                        {
                            actions.push(RowAction::Read(e.clone()));
                        }
                        if ui.small_button("Plot").clicked() {
                            actions.push(RowAction::Plot(e.clone()));
                        }
                        if writable
                            && ui
                                .add_enabled(controlled, egui::Button::new("Edit").small())
                                .on_hover_text("Write a new value (or double-click the value)")
                                .on_disabled_hover_text("Take Control to write")
                                .clicked()
                        {
                            actions.push(RowAction::Edit(
                                e.address,
                                reading
                                    .filter(|r| r.valid)
                                    .map(|r| p.format.format(e, r.value))
                                    .unwrap_or_default(),
                            ));
                        }
                    });
                    if row.response().clicked() {
                        clicked = Some(e.clone());
                    }
                });
            });
        for action in actions {
            match action {
                RowAction::Read(e) => self.session.read(s, &e),
                RowAction::Plot(e) => self.add_series(s, &e),
                RowAction::Edit(address, text) => editing = Some((address, text)),
                RowAction::Cancel => editing = None,
                RowAction::Write(e, text) => {
                    self.session.write_formatted(s, &e, &text, p.format, false);
                    editing = None;
                }
            }
        }
        if let Some(e) = clicked {
            self.session.read(s, &e);
            self.session.selection = Some((s, e));
        }
        ui.ctx().data_mut(|d| match editing {
            Some(editing) => d.insert_temp(edit_id, editing),
            None => d.remove::<(u16, String)>(edit_id),
        });
    }
    fn add_series(&mut self, s: Space, e: &Entry) {
        let binding = Binding::new(s, e);
        let id = if let Some(series) = self.series.iter().find(|series| series.binding == binding) {
            series.id.clone()
        } else {
            let id = unique_id();
            self.series.push(PlotSeries {
                id: id.clone(),
                binding,
                enabled: true,
            });
            id
        };
        self.added.push(super::PaneRequest::Plot(id));
    }
    fn commands(&mut self, ui: &mut egui::Ui, p: &mut Pane) {
        let palette = theme::of(ui);
        let controlled = self.session.controlled();
        ui.horizontal(|ui| {
            ui.add(
                egui::TextEdit::singleline(&mut p.search)
                    .hint_text("Filter by name or code")
                    .desired_width(200.),
            );
            ui.separator();
            ui.label("Argument");
            ui.add(
                egui::TextEdit::singleline(&mut p.input)
                    .font(egui::TextStyle::Monospace)
                    .desired_width(90.),
            )
            .on_hover_text("Signed 32-bit value sent with each command");
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if ui
                    .add_enabled(controlled, egui::Button::new("Send code"))
                    .on_disabled_hover_text("Take Control to send commands")
                    .clicked()
                {
                    if p.address >= 65000 {
                        self.session.notice =
                            "Codes 65000 and above are library commands; use the list".into();
                    } else if let Ok(value) = p.input.trim().parse() {
                        self.session.command(p.address, value, true);
                    } else {
                        self.session.notice = "The argument must be a signed 32-bit integer".into();
                    }
                }
                ui.add(egui::DragValue::new(&mut p.address).range(0..=64999));
                ui.label(RichText::new("Other code").color(palette.text_weak));
            });
        });
        ui.add_space(4.);
        let search = p.search.trim().to_lowercase();
        let commands: Vec<SysCommand> = self
            .profile
            .commands()
            .into_iter()
            .filter(|c| {
                search.is_empty()
                    || c.name.to_lowercase().contains(&search)
                    || c.code.to_string().contains(&search)
            })
            .collect();
        let mut send = None;
        egui_extras::TableBuilder::new(ui)
            .id_salt((&p.id, "commands"))
            .striped(true)
            .resizable(true)
            .cell_layout(egui::Layout::left_to_right(egui::Align::Center))
            .column(egui_extras::Column::exact(60.))
            .column(egui_extras::Column::initial(200.).at_least(120.).clip(true))
            .column(egui_extras::Column::initial(260.).at_least(80.).clip(true))
            .column(egui_extras::Column::initial(110.).at_least(80.))
            .column(egui_extras::Column::remainder().at_least(60.))
            .header(22., |mut header| {
                for title in ["Code", "Command", "Description", "Result", ""] {
                    header.col(|ui| {
                        ui.label(theme::caption(ui, title));
                    });
                }
            })
            .body(|body| {
                body.rows(26., commands.len(), |mut row| {
                    let c = &commands[row.index()];
                    let library = (65000..=65002).contains(&c.code);
                    row.col(|ui| {
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.label(
                                RichText::new(c.code.to_string())
                                    .monospace()
                                    .color(palette.text_weak),
                            );
                        });
                    });
                    row.col(|ui| {
                        ui.label(&c.name);
                        if library {
                            ui.label(RichText::new("library").small().color(palette.text_weak));
                        }
                    });
                    row.col(|ui| {
                        ui.label(RichText::new(&c.description).color(palette.text_weak));
                    });
                    row.col(|ui| {
                        if let Some(outcome) = self.session.commands.get(&c.code) {
                            colors::outcome_inline(ui, outcome);
                        }
                    });
                    row.col(|ui| {
                        if ui
                            .add_enabled(controlled, egui::Button::new("Send").small())
                            .on_disabled_hover_text("Take Control to send commands")
                            .clicked()
                        {
                            send = Some(c.code);
                        }
                    });
                });
            });
        if let Some(code) = send {
            match p.input.trim().parse::<i32>() {
                Ok(v) => self.session.command(code, v, true),
                Err(_) => {
                    self.session.notice = "The argument must be a signed 32-bit integer".into()
                }
            }
        }
    }
    fn inspector(&mut self, ui: &mut egui::Ui, p: &mut Pane) {
        let palette = theme::of(ui);
        egui::ScrollArea::vertical().show(ui, |ui| {
            if let Some((s, e)) = self.session.selection.clone() {
                self.inspect(ui, p, s, &e);
            } else {
                ui.label(
                    RichText::new("Select an entry in a data pane to inspect it.")
                        .color(palette.text_weak),
                );
            }
            ui.add_space(10.);
            egui::CollapsingHeader::new(theme::caption(ui, "Read any address")).show(ui, |ui| {
                ui.horizontal(|ui| {
                    egui::ComboBox::from_id_salt("rawspace")
                        .selected_text(p.space.title())
                        .show_ui(ui, |ui| {
                            for s in Space::ALL {
                                ui.selectable_value(&mut p.space, s, s.title());
                            }
                        });
                    ui.add(egui::DragValue::new(&mut p.address).prefix("address "));
                    if ui
                        .add_enabled(self.session.connected(), egui::Button::new("Read"))
                        .clicked()
                    {
                        let e = self.profile.entry_at(p.space, p.address).unwrap_or(Entry {
                            address: p.address,
                            name: format!("ADDRESS_{}", p.address),
                            data_type: DataType::Int32,
                            writable: false,
                            array_size: None,
                        });
                        self.session.selection = Some((p.space, e));
                        self.session.raw_read(p.space, p.address);
                    }
                });
            });
        });
    }
    fn inspect(&mut self, ui: &mut egui::Ui, p: &mut Pane, s: Space, e: &Entry) {
        let palette = theme::of(ui);
        let writable = e.writable && s != Space::SysRegister;
        ui.label(
            RichText::new(&e.name)
                .family(egui::FontFamily::Name(super::fonts::SEMIBOLD.into()))
                .size(15.),
        );
        ui.label(theme::caption(
            ui,
            &format!(
                "{} · address {} · {} · {}",
                s.title(),
                e.address,
                e.data_type,
                if writable { "read/write" } else { "read-only" }
            ),
        ));
        self.session
            .interest(&Binding::new(s, e), self.profile, 250);
        let reading = self.session.readings.get(&(s, e.address)).cloned();
        let unit = self
            .profile
            .metadata(s, &e.name)
            .map(|m| m.unit.clone())
            .unwrap_or_default();
        ui.add_space(6.);
        // A value list from the metadata names the current value, if it matches.
        let state = reading.as_ref().filter(|r| r.valid).and_then(|r| {
            self.profile.metadata(s, &e.name).and_then(|m| {
                m.value_list
                    .iter()
                    .find(|v| v.value.trim().parse::<f64>().ok() == Some(e.decode(r.value)))
                    .map(|v| v.label.clone())
            })
        });
        ui.horizontal(|ui| {
            let text = reading
                .as_ref()
                .filter(|r| r.valid)
                .map_or("—".into(), |r| e.format(r.value));
            ui.label(RichText::new(text).monospace().size(26.));
            if !unit.is_empty() {
                ui.label(RichText::new(&unit).color(palette.text_weak));
            }
            if let Some(state) = state {
                ui.label(RichText::new(state).color(palette.accent));
            }
        });
        let (role, label) = colors::reading(self.session.connected(), reading.as_ref(), Some(250));
        ui.horizontal(|ui| {
            ui.label(RichText::new("●").small().color(colors::role(ui, role)));
            ui.label(RichText::new(label).small().color(palette.text_weak));
            if let Some(r) = &reading {
                ui.label(
                    RichText::new(clock::time_of_day(r.timestamp))
                        .small()
                        .monospace()
                        .color(palette.text_weak),
                );
            }
        });
        if let Some(r) = reading.filter(|r| r.valid) {
            ui.add_space(8.);
            ui.label(theme::caption(ui, "Decoded"));
            let bits = format!("{:032b}", r.value as u32);
            let grouped = bits
                .as_bytes()
                .chunks(4)
                .map(|c| std::str::from_utf8(c).unwrap_or_default())
                .collect::<Vec<_>>()
                .join(" ");
            egui::Grid::new("inspector-decoded")
                .num_columns(2)
                .spacing([16., 4.])
                .show(ui, |ui| {
                    for (name, value) in [
                        ("Signed", r.value.to_string()),
                        ("Unsigned", (r.value as u32).to_string()),
                        ("Hex", format!("0x{:08X}", r.value as u32)),
                        ("Float", format_float(f32::from_bits(r.value as u32))),
                        ("Binary", grouped),
                    ] {
                        key(ui, name);
                        ui.add(egui::Label::new(RichText::new(value).monospace()).selectable(true));
                        ui.end_row();
                    }
                });
        }
        if let Some(m) = self.profile.metadata(s, &e.name).cloned() {
            if !m.description.is_empty() || !m.value_list.is_empty() {
                ui.add_space(8.);
                ui.label(theme::caption(ui, "Description"));
                if !m.description.is_empty() {
                    ui.label(&m.description);
                }
                egui::Grid::new("inspector-values")
                    .num_columns(2)
                    .spacing([16., 4.])
                    .show(ui, |ui| {
                        for v in &m.value_list {
                            ui.monospace(&v.value);
                            ui.label(&v.label);
                            ui.end_row();
                        }
                    });
            }
        }
        ui.add_space(8.);
        ui.horizontal(|ui| {
            if ui.button("Add to Plot").clicked() {
                self.add_series(s, e);
            }
            if ui
                .add_enabled(self.session.connected(), egui::Button::new("Read"))
                .clicked()
            {
                self.session.read(s, e);
            }
        });
        if writable {
            ui.add_space(6.);
            ui.label(theme::caption(ui, "Write"));
            ui.horizontal(|ui| {
                let input = ui.add(
                    egui::TextEdit::singleline(&mut p.input)
                        .font(egui::TextStyle::Monospace)
                        .desired_width(140.),
                );
                let submit = input.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
                let controlled = self.session.controlled();
                if ui
                    .add_enabled(controlled, controls::primary(ui, "Write"))
                    .on_disabled_hover_text("Take Control to write")
                    .clicked()
                    || (submit && controlled)
                {
                    self.session.write(s, e, &p.input, false);
                }
                if let Some(outcome) = self.session.writes.get(&(s, e.address)) {
                    colors::outcome_inline(ui, outcome);
                }
            });
        }
    }
    fn logs(&mut self, ui: &mut egui::Ui, p: &mut Pane) {
        let palette = theme::of(ui);
        ui.horizontal(|ui| {
            ui.add(
                egui::TextEdit::singleline(&mut p.search)
                    .hint_text("Filter messages")
                    .desired_width(220.),
            );
            controls::segmented(
                ui,
                &mut p.min_level,
                &[(0, "All"), (1, "Warnings"), (2, "Errors")],
            );
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if ui.button("Export").clicked() {
                    let text = self
                        .session
                        .logs
                        .iter()
                        .map(|l| {
                            format!(
                                "{}\t{:?}\t{:?}\t{}",
                                clock::full(l.timestamp),
                                l.level,
                                l.category,
                                l.message
                            )
                        })
                        .collect::<Vec<_>>()
                        .join("\n");
                    self.session.export(text, "activity.txt", "txt");
                }
                if controls::confirm_button(ui, ("clear-log", &p.id), "Clear") {
                    self.session.logs.clear();
                }
                ui.label(
                    RichText::new(format!("{} entries", self.session.logs.len()))
                        .small()
                        .color(palette.text_weak),
                );
            });
        });
        ui.add_space(4.);
        let severity = |level: &LogLevel| match level {
            LogLevel::Error => 2,
            LogLevel::Warning => 1,
            _ => 0,
        };
        let query = p.search.trim().to_lowercase();
        let rows: Vec<&LogEntry> = self
            .session
            .logs
            .iter()
            .filter(|l| severity(&l.level) >= p.min_level)
            .filter(|l| {
                query.is_empty()
                    || contains_ignore_case(&l.message, &query)
                    || l.packet_data
                        .as_ref()
                        .is_some_and(|d| contains_ignore_case(&d.analysis, &query))
            })
            .collect();
        if rows.is_empty() {
            ui.label(RichText::new("No activity to show.").color(palette.text_weak));
            return;
        }
        // One line per entry so only visible rows are laid out, however long
        // the log grows; packet details stay on the same line.
        let dark = ui.visuals().dark_mode;
        egui_extras::TableBuilder::new(ui)
            .id_salt((&p.id, "log"))
            .striped(true)
            .stick_to_bottom(true)
            .cell_layout(egui::Layout::left_to_right(egui::Align::Center))
            .column(egui_extras::Column::exact(96.))
            .column(egui_extras::Column::exact(78.))
            .column(egui_extras::Column::initial(92.).clip(true))
            .column(egui_extras::Column::remainder().clip(true))
            .header(22., |mut header| {
                for title in ["Time", "Level", "Source", "Message"] {
                    header.col(|ui| {
                        ui.label(theme::caption(ui, title));
                    });
                }
            })
            .body(|body| {
                body.rows(22., rows.len(), |mut row| {
                    let l = rows[row.index()];
                    let color = log_color(dark, &l.level);
                    row.col(|ui| {
                        ui.label(
                            RichText::new(clock::time_of_day(l.timestamp))
                                .monospace()
                                .color(palette.text_weak),
                        )
                        .on_hover_text(clock::full(l.timestamp));
                    });
                    row.col(|ui| {
                        ui.label(RichText::new("●").small().color(color));
                        ui.label(RichText::new(log_level_name(&l.level)).small().color(color));
                    });
                    row.col(|ui| {
                        ui.label(
                            RichText::new(log_category_name(&l.category))
                                .small()
                                .color(palette.text_weak),
                        );
                    });
                    row.col(|ui| {
                        let message = ui.label(RichText::new(&l.message).color(palette.text));
                        if let Some(packet) = &l.packet_data {
                            message.on_hover_text(format!(
                                "{}\n{}\n→ {}",
                                packet.hex_data, packet.analysis, packet.destination
                            ));
                            ui.label(
                                RichText::new(&packet.hex_data)
                                    .monospace()
                                    .color(palette.text_weak),
                            );
                        }
                    });
                });
            });
    }
    fn plot(&mut self, ui: &mut egui::Ui, p: &mut Pane) {
        ui.horizontal(|ui| {
            ui.checkbox(&mut p.auto, "Follow live");
            // Pausing freezes this pane's view; recording continues.
            let mut paused = p.frozen.is_some();
            if ui
                .checkbox(&mut paused, "Pause")
                .on_hover_text("Freeze this plot. Data keeps recording.")
                .changed()
            {
                p.frozen = paused.then(|| crate::communicator::now_ms() / 1000.);
            }
            if ui.button("Clear data").clicked() {
                self.session.histories.clear();
            }
            if ui.button("Export CSV").clicked() {
                let mut csv = "series,time,value\n".to_string();
                for s in self.series.iter().filter(|s| p.plot_series.contains(&s.id)) {
                    if let Some(h) = self
                        .session
                        .histories
                        .get(&(s.binding.space, s.binding.address))
                    {
                        for point in h {
                            csv.push_str(&format!(
                                "\"{}\",{:.3},{}\n",
                                s.binding.name, point[0], point[1]
                            ));
                        }
                    }
                }
                self.session.export(csv, "plot.csv", "csv");
            }
        });
        let mut remove = None;
        ui.horizontal_wrapped(|ui| {
            for (i, s) in self.series.iter_mut().enumerate() {
                let mut selected = p.plot_series.contains(&s.id);
                if ui.checkbox(&mut selected, &s.binding.name).changed() {
                    if selected {
                        p.plot_series.push(s.id.clone());
                    } else {
                        p.plot_series.retain(|id| id != &s.id);
                    }
                }
                if !s.binding.matches(self.profile) {
                    ui.colored_label(colors::role(ui, Role::Warn), "Needs review");
                    if let Some(e) = self.profile.resolve(&s.binding) {
                        if ui.small_button("Follow entry").clicked() {
                            s.binding = Binding::new(s.binding.space, &e);
                        }
                    }
                }
                if ui
                    .small_button("×")
                    .on_hover_text("Delete this trace from every Plot")
                    .clicked()
                {
                    remove = Some(i);
                }
            }
        });
        if let Some(i) = remove {
            self.series.remove(i);
        }
        if self.series.is_empty() {
            ui.label("Click Plot beside an entry to add a trace.");
        }
        let span = self.prefs.time_span;
        let traces: Vec<(String, Vec<[f64; 2]>)> = self
            .series
            .iter()
            .filter(|s| p.plot_series.contains(&s.id) && s.binding.matches(self.profile))
            .filter_map(|s| {
                let h = self
                    .session
                    .histories
                    .get(&(s.binding.space, s.binding.address))?;
                let end = p.frozen.or_else(|| h.back().map(|last| last[0]))?;
                Some((
                    s.binding.name.clone(),
                    window(h, end - span, end, MAX_TRACE_POINTS),
                ))
            })
            .collect();
        if traces.iter().all(|(_, points)| points.is_empty()) {
            ui.add_space(24.);
            ui.vertical_centered(|ui| {
                ui.label(
                    RichText::new(if p.plot_series.is_empty() {
                        "Tick a trace above, or choose Plot on an entry."
                    } else if self.session.connected() {
                        "Waiting for samples…"
                    } else {
                        "Connect to a device to record samples."
                    })
                    .color(theme::of(ui).text_weak),
                );
            });
            return;
        }
        let newest = traces
            .iter()
            .filter_map(|(_, points)| points.last().map(|p| p[0]))
            .fold(f64::NEG_INFINITY, f64::max);
        let mut plot = egui_plot::Plot::new((&p.id, "chart"))
            .legend(egui_plot::Legend::default())
            .height((ui.available_height() - 8.).max(100.))
            .x_axis_formatter(|mark, _| clock::short_time(mark.value * 1000.))
            .label_formatter(|name, point| {
                let time = clock::time_of_day(point.x * 1000.);
                if name.is_empty() {
                    format!("{time}\n{:.6}", point.y)
                } else {
                    format!("{name}\n{time}\n{:.6}", point.y)
                }
            });
        plot = plot.allow_zoom(true).allow_drag(true);
        theme::plot_tone(ui, |ui| {
            plot.show(ui, |plot_ui| {
                if p.auto && newest.is_finite() {
                    // Follow the newest sample and fit Y to what is visible.
                    let (low, high) = traces
                        .iter()
                        .flat_map(|(_, points)| points.iter().map(|p| p[1]))
                        .fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), v| {
                            (lo.min(v), hi.max(v))
                        });
                    let pad = if high > low {
                        (high - low) * 0.08
                    } else if high != 0. {
                        high.abs() * 0.1
                    } else {
                        1.
                    };
                    plot_ui.set_plot_bounds(egui_plot::PlotBounds::from_min_max(
                        [newest - span, low - pad],
                        [newest, high + pad],
                    ));
                }
                for (name, points) in traces {
                    plot_ui.line(egui_plot::Line::new(points).name(name));
                }
            })
        });
    }
    fn editor(&mut self, ui: &mut egui::Ui, p: &mut Pane) {
        if p.draft.as_ref().is_none_or(|d| d.id != self.profile.id) {
            p.draft = Some(self.profile.clone());
            p.map_rows.clear();
        }
        let draft = p.draft.as_mut().unwrap();
        let dirty = draft.maps_differ(self.profile);
        ui.horizontal(|ui| {
            controls::segmented(
                ui,
                &mut p.map_space,
                &[
                    (Space::Register, "Registers"),
                    (Space::Parameter, "Parameters"),
                    (Space::SysRegister, "System Registers"),
                ],
            );
            ui.separator();
            controls::segmented(
                ui,
                &mut p.editing,
                &[(false, "Maps"), (true, "Commands / Metadata")],
            );
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                let save = if dirty {
                    ui.add(controls::primary(ui, "Save Profile"))
                } else {
                    ui.button("Save Profile")
                };
                if save.clicked() {
                    let errors: Vec<_> = Space::ALL
                        .into_iter()
                        .flat_map(|s| parse_map(draft.map(s), s).err().unwrap_or_default())
                        .collect();
                    if errors.is_empty() {
                        self.profile.apply_map_draft(draft);
                        self.session.confirm = None;
                        self.session.readings.clear();
                        self.session.histories.clear();
                        self.session.toast(
                            Role::Info,
                            "Profile saved. Review affected bindings before using them.",
                        );
                    } else {
                        self.session.notice = errors.join(" · ");
                    }
                }
                if ui.add_enabled(dirty, egui::Button::new("Revert")).clicked() {
                    *draft = self.profile.clone();
                    p.map_rows.clear();
                }
                if dirty {
                    ui.label(
                        RichText::new("● Unsaved changes")
                            .small()
                            .color(colors::role(ui, Role::Warn)),
                    );
                }
            });
        });
        ui.add_space(4.);
        if p.map_space == Space::SysRegister {
            ui.label("System registers are preset by the datastream library and cannot be edited.");
            egui::ScrollArea::both()
                .id_salt("system-map-reference")
                .show(ui, |ui| {
                    egui::Grid::new("system-map-reference-table")
                        .striped(true)
                        .show(ui, |ui| {
                            for heading in ["Address", "Name", "Type", "Access"] {
                                ui.strong(heading);
                            }
                            ui.end_row();
                            for entry in self.profile.entries(Space::SysRegister) {
                                ui.monospace(entry.address.to_string());
                                ui.label(&entry.name);
                                ui.monospace(entry.data_type.as_str());
                                ui.weak("Read-only");
                                ui.end_row();
                            }
                        });
                });
            return;
        }
        if p.editing {
            egui::ScrollArea::vertical().show(ui, |ui| {
                ui.collapsing("Board type definitions", |ui| {
                    ui.add(
                        egui::TextEdit::multiline(&mut draft.board_types_map)
                            .code_editor()
                            .desired_rows(8),
                    );
                });
                ui.label("Profile commands");
                let target = ImportTarget::CommandMap { pane: p.id.clone() };
                if let Some(import) = self.session.take_import(&target) {
                    match import.and_then(|text| crate::map_files::parse_commands(&text)) {
                        Ok(mut commands) => {
                            commands.extend(
                                draft
                                    .sys_commands
                                    .iter()
                                    .filter(|c| (65000..=65002).contains(&c.code))
                                    .cloned(),
                            );
                            draft.sys_commands = commands;
                        }
                        Err(error) => self.session.notice = error,
                    }
                }
                ui.horizontal(|ui| {
                    if ui.button("Import command map").clicked() {
                        self.session
                            .pick_file(target.clone(), "Command map", &["map", "txt"]);
                    }
                    if ui.button("Export command map").clicked() {
                        self.session.export(
                            crate::map_files::commands_map(&draft.sys_commands),
                            "commands.map",
                            "map",
                        );
                    }
                    if ui.button("Export command header").clicked() {
                        self.session.export(
                            crate::map_files::commands_header(&draft.sys_commands),
                            "ds_sys_commands.h",
                            "h",
                        );
                    }
                });
                let mut remove = None;
                for (i, c) in draft
                    .sys_commands
                    .iter_mut()
                    .enumerate()
                    .filter(|(_, c)| !(65000..=65002).contains(&c.code))
                {
                    ui.horizontal(|ui| {
                        ui.add(egui::DragValue::new(&mut c.code));
                        ui.text_edit_singleline(&mut c.name);
                        ui.text_edit_singleline(&mut c.description);
                        if ui.small_button("×").clicked() {
                            remove = Some(i);
                        }
                    });
                }
                if let Some(i) = remove {
                    draft.sys_commands.remove(i);
                }
                if ui.button("Add command").clicked() {
                    draft.sys_commands.push(SysCommand {
                        code: 100,
                        name: "NEW_COMMAND".into(),
                        description: String::new(),
                    });
                }
                ui.separator();
                ui.label("Entry metadata");
                let entries = draft.entries(p.map_space);
                let meta = match p.map_space {
                    Space::Register => &mut draft.registers_metadata,
                    Space::Parameter => &mut draft.parameters_metadata,
                    Space::SysRegister => {
                        ui.label("System metadata is defined by the protocol.");
                        return;
                    }
                };
                for e in entries
                    .iter()
                    .filter(|e| !e.name.contains('[') || e.name.ends_with("[0]"))
                {
                    let name = e.name.split('[').next().unwrap_or(&e.name).to_string();
                    ui.collapsing(&name, |ui| {
                        // Edit a copy: expanding a section must not create an
                        // empty entry, which would mark the draft as changed.
                        let mut edited = meta.get(&name).cloned().unwrap_or_default();
                        let m = &mut edited;
                        ui.label("Description");
                        ui.text_edit_multiline(&mut m.description);
                        ui.label("Unit");
                        ui.text_edit_singleline(&mut m.unit);
                        let mut remove = None;
                        for (i, v) in m.value_list.iter_mut().enumerate() {
                            ui.horizontal(|ui| {
                                ui.text_edit_singleline(&mut v.value);
                                ui.text_edit_singleline(&mut v.label);
                                if ui.small_button("×").clicked() {
                                    remove = Some(i);
                                }
                            });
                        }
                        if let Some(i) = remove {
                            m.value_list.remove(i);
                        }
                        if ui.button("Add value label").clicked() {
                            m.value_list.push(ValueLabel {
                                value: "0".into(),
                                label: "State".into(),
                            });
                        }
                        if edited == Metadata::default() {
                            meta.remove(&name);
                        } else if meta.get(&name) != Some(&edited) {
                            meta.insert(name.clone(), edited);
                        }
                    });
                }
            });
            return;
        }
        if let std::collections::btree_map::Entry::Vacant(entry) = p.map_rows.entry(p.map_space) {
            match super::map_table::rows(draft.map(p.map_space), p.map_space) {
                Ok(rows) => {
                    entry.insert(rows);
                }
                Err(errors) => {
                    for error in errors {
                        ui.colored_label(colors::role(ui, Role::Error), error);
                    }
                    return;
                }
            }
        }
        super::map_table::show(
            ui,
            p.map_rows.get_mut(&p.map_space).unwrap(),
            draft,
            p.map_space,
            self.session,
            &p.id,
        );
    }
}
/// Case-insensitive substring test; `needle` must already be lowercase.
/// Avoids allocating a lowercase copy of every log line on every frame.
fn contains_ignore_case(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() {
        true
    } else if needle.is_ascii() {
        haystack
            .as_bytes()
            .windows(needle.len())
            .any(|w| w.eq_ignore_ascii_case(needle.as_bytes()))
    } else {
        haystack.to_lowercase().contains(needle)
    }
}

/// Upper bound on points drawn per trace; more cannot be told apart on screen.
pub(super) const MAX_TRACE_POINTS: usize = 2000;

/// The samples of a time-sorted history within `from..=to`, thinned to at most
/// `max` points. Thinning keeps each bucket's minimum and maximum, so spikes
/// stay visible.
pub(super) fn window(
    h: &std::collections::VecDeque<[f64; 2]>,
    from: f64,
    to: f64,
    max: usize,
) -> Vec<[f64; 2]> {
    let start = h.partition_point(|p| p[0] < from);
    let end = h.partition_point(|p| p[0] <= to);
    let n = end.saturating_sub(start);
    if n <= max {
        return h.range(start..end).copied().collect();
    }
    let bucket = n.div_ceil(max / 2);
    let points: Vec<_> = h.range(start..end).copied().collect();
    let mut out = Vec::with_capacity(max + 2);
    for chunk in points.chunks(bucket) {
        let (mut lo, mut hi) = (0, 0);
        for (i, p) in chunk.iter().enumerate() {
            if p[1] < chunk[lo][1] {
                lo = i;
            }
            if p[1] > chunk[hi][1] {
                hi = i;
            }
        }
        out.push(chunk[lo.min(hi)]);
        if lo != hi {
            out.push(chunk[lo.max(hi)]);
        }
    }
    out
}

/// A key in a key/value grid.
fn key(ui: &mut egui::Ui, text: &str) {
    ui.label(RichText::new(text).color(theme::of(ui).text_weak));
}

/// What a table row asked for this frame, applied after the table is drawn.
enum RowAction {
    Read(Entry),
    Plot(Entry),
    Edit(u16, String),
    Cancel,
    Write(Entry, String),
}

fn log_level_name(level: &LogLevel) -> &'static str {
    match level {
        LogLevel::Error => "Error",
        LogLevel::Warning => "Warning",
        LogLevel::Success => "OK",
        LogLevel::Packet => "Packet",
        LogLevel::Info => "Info",
    }
}
fn log_category_name(category: &LogCategory) -> &'static str {
    match category {
        LogCategory::Connection => "Connection",
        LogCategory::Register => "Register",
        LogCategory::Parameter => "Parameter",
        LogCategory::Packet => "Packet",
        LogCategory::AutoRefresh => "Polling",
        LogCategory::Plotting => "Plot",
    }
}
pub fn log_color(dark: bool, l: &LogLevel) -> Color32 {
    colors::rgb(
        dark,
        match l {
            LogLevel::Error => Role::Error,
            LogLevel::Warning => Role::Warn,
            LogLevel::Success => Role::Ok,
            LogLevel::Packet => Role::Info,
            _ => Role::Idle,
        },
    )
}
