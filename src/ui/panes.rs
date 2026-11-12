use super::{clock, colors, controls, theme};
use super::{
    session::{ImportTarget, Session},
    widgets, Pane, PaneKind,
};
use crate::model::Role;
use crate::{model::*, types::*};
use eframe::egui::{self, Color32, RichText};
use egui_dock::{tab_viewer::OnCloseResponse, TabViewer};
use std::collections::{BTreeMap, VecDeque};
use std::sync::Arc;

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
    fn context_menu(&mut self, ui: &mut egui::Ui, p: &mut Pane, _path: egui_dock::NodePath) {
        if ui.button("Move to new native window").clicked() {
            self.moved.push(super::PaneMove {
                source: self.window_id.into(),
                target: None,
                pane: p.clone(),
            });
            ui.close();
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
                    ui.close();
                }
            }
        });
        if ui.button("Focus pane").clicked() {
            p.focus = true;
            ui.close();
        }
        if !p.kind.singleton() && ui.button("Duplicate pane").clicked() {
            let mut copy = p.clone();
            copy.id = unique_id();
            self.added.push(super::PaneRequest::Open(Box::new(copy)));
            ui.close();
        }
    }
    fn on_close(&mut self, p: &mut Pane) -> OnCloseResponse {
        if p.kind == PaneKind::Dashboard && widgets::unsaved(p, self.profile) {
            self.session.notice =
                "Save or Revert the dashboard changes before closing the pane".into();
            return OnCloseResponse::Ignore;
        }
        if p.kind == PaneKind::MapEditor
            && p.draft
                .as_ref()
                .is_some_and(|d| d.maps_differ(self.profile))
        {
            self.session.notice =
                "Save or Revert the Map Editor changes before closing the pane".into();
            OnCloseResponse::Ignore
        } else {
            OnCloseResponse::Close
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
                        ui.label(RichText::new(colors::mark(role)).color(colors::role(ui, role)));
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
            let field = ui.add(
                egui::TextEdit::singleline(&mut p.search)
                    .hint_text("Filter by name or address  /")
                    .desired_width(200.),
            );
            take_search_focus(&field);
            ui.separator();
            ui.checkbox(&mut p.auto, "Live")
                .on_hover_text("Poll the entries in view at this interval");
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
                    (DisplayFormat::Native, "DEFAULT"),
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
                            "{},{},{},{},{}\n",
                            e.address,
                            csv_cell(&e.name),
                            e.data_type,
                            csv_cell(&r.map(|r| e.format(r.value)).unwrap_or_default()),
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

        // In-place editing, per pane: values typed but not yet sent, by
        // address, and the field to focus this frame. A value stays pending
        // (outlined) when its field loses focus, until it is sent or discarded.
        let edit_id = ui.id().with((&p.id, "editing"));
        let (mut pending, mut focus): (BTreeMap<u16, String>, Option<u16>) = ui
            .ctx()
            .data_mut(|d| d.get_temp(edit_id))
            .unwrap_or_default();
        let controlled = self.session.connected() && self.session.controlled();
        let connected = self.session.connected();
        let row_height = 24.;
        let mut clicked = None;
        let mut actions: Vec<RowAction> = vec![];
        // Live polls only the rows in view, so a long map costs no more
        // device traffic than a short one.
        let mut visible = vec![];
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
                    visible.push(row.index());
                    let e = entries[row.index()];
                    let selected = self
                        .session
                        .selection
                        .as_ref()
                        .is_some_and(|(ss, ee)| *ss == s && ee.address == e.address);
                    row.set_selected(selected);
                    let reading = self.session.readings.get(&(s, e.address));
                    let writable = e.writable && s != Space::SysRegister;
                    let is_editing = pending.contains_key(&e.address);
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
                            if let Some(text) = pending.get_mut(&e.address) {
                                let edit = ui.add(
                                    egui::TextEdit::singleline(text)
                                        .font(egui::TextStyle::Monospace)
                                        .horizontal_align(egui::Align::Max)
                                        .desired_width(f32::INFINITY),
                                );
                                if focus == Some(e.address) {
                                    edit.request_focus();
                                    focus = None;
                                }
                                let typing = edit.has_focus() || edit.lost_focus();
                                if typing && ui.input(|i| i.key_pressed(egui::Key::Escape)) {
                                    actions.push(RowAction::Cancel(e.address));
                                } else if edit.lost_focus()
                                    && ui.input(|i| i.key_pressed(egui::Key::Enter))
                                {
                                    actions.push(RowAction::Write(e.clone(), text.clone()));
                                }
                                controls::mark_unsaved(ui, edit, true).on_hover_text(
                                    "Not sent. Enter or Write sends it; Esc discards it.",
                                );
                            } else {
                                let text = match reading {
                                    Some(r) if r.valid => p.format.format_with(
                                        e,
                                        r.value,
                                        self.profile.metadata(s, &e.name),
                                    ),
                                    Some(_) => "refused".into(),
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
                                            .map(|r| {
                                                p.format.format_with(
                                                    e,
                                                    r.value,
                                                    self.profile.metadata(s, &e.name),
                                                )
                                            })
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
                            ui.label(
                                RichText::new(colors::mark(role))
                                    .small()
                                    .color(colors::role(ui, role)),
                            );
                            ui.label(RichText::new(label).small().color(palette.text_weak));
                        }
                    });
                    row.col(|ui| {
                        let hovered =
                            ui.rect_contains_pointer(ui.max_rect().expand2(egui::vec2(2000., 0.)));
                        if !(hovered || selected || is_editing) {
                            return;
                        }
                        if let Some(text) = pending.get(&e.address) {
                            if ui
                                .add_enabled(controlled, controls::primary(ui, "Write"))
                                .on_disabled_hover_text("Take Control to write")
                                .clicked()
                            {
                                actions.push(RowAction::Write(e.clone(), text.clone()));
                            }
                            if ui.small_button("Discard").clicked() {
                                actions.push(RowAction::Cancel(e.address));
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
                                    .map(|r| {
                                        p.format.format_with(
                                            e,
                                            r.value,
                                            self.profile.metadata(s, &e.name),
                                        )
                                    })
                                    .unwrap_or_default(),
                            ));
                        }
                    });
                    let response = row.response();
                    let i = row.index();
                    if s == Space::Register && i > 0 && e.writable && !entries[i - 1].writable {
                        let rect = response.rect;
                        let painter = egui::Painter::new(
                            response.ctx.clone(),
                            response.layer_id,
                            rect.expand(1.),
                        );
                        controls::access_boundary(&painter, &palette, rect.x_range(), rect.top());
                    }
                    if response.clicked() {
                        clicked = Some(e.clone());
                    }
                });
            });
        // A new connection reads the rows in view once, so the table is not
        // a column of "Unread" until Live or Read all is found.
        let epoch_id = ui.id().with((&p.id, "read-epoch"));
        let seen = ui.ctx().data(|d| d.get_temp::<u64>(epoch_id));
        if connected && seen != Some(self.session.connection_epoch) {
            ui.ctx()
                .data_mut(|d| d.insert_temp(epoch_id, self.session.connection_epoch));
            if !p.auto {
                for &i in &visible {
                    self.session.read(s, entries[i]);
                }
            }
        }
        if p.auto {
            for i in visible {
                self.session
                    .interest(&Binding::new(s, entries[i]), self.profile, p.interval);
            }
        }
        for action in actions {
            match action {
                RowAction::Read(e) => self.session.read(s, &e),
                RowAction::Plot(e) => self.add_series(s, &e),
                RowAction::Edit(address, text) => {
                    pending.insert(address, text);
                    focus = Some(address);
                }
                RowAction::Cancel(address) => {
                    pending.remove(&address);
                }
                RowAction::Write(e, text) => {
                    let meta = self.profile.metadata(s, &e.name);
                    // A refused value stays pending, with the reason shown.
                    if self
                        .session
                        .write_formatted(s, &e, &text, p.format, meta, false)
                    {
                        pending.remove(&e.address);
                    }
                }
            }
        }
        if let Some(e) = clicked {
            self.session.read(s, &e);
            self.session.selection = Some((s, e));
        }
        ui.ctx().data_mut(|d| {
            if pending.is_empty() {
                d.remove::<(BTreeMap<u16, String>, Option<u16>)>(edit_id);
            } else {
                d.insert_temp(edit_id, (pending, focus));
            }
        });
    }
    /// Plots a recording: its samples become histories, each track becomes a
    /// trace in this pane, and the view freezes at the recording's end.
    fn replay(&mut self, p: &mut Pane, text: &str) {
        let tracks = self.session.replay(text, self.prefs);
        let mut end = f64::NEG_INFINITY;
        for (s, address, name) in tracks {
            let parsed = self.profile.parsed(s);
            let entry = parsed
                .named(&name)
                .or_else(|| parsed.at(address))
                .filter(|e| e.address == address)
                .cloned();
            let Some(e) = entry else {
                self.session.notice = format!("{name} is not in this Profile's maps; not plotted");
                continue;
            };
            if let Some(last) = self
                .session
                .histories
                .get(&(s, address))
                .and_then(|h| h.back())
            {
                end = end.max(last[0]);
            }
            let binding = Binding::new(s, &e);
            let id = match self.series.iter().find(|series| series.binding == binding) {
                Some(series) => series.id.clone(),
                None => {
                    let id = unique_id();
                    self.series.push(PlotSeries {
                        id: id.clone(),
                        binding,
                        enabled: true,
                    });
                    id
                }
            };
            if !p.plot_series.contains(&id) {
                p.plot_series.push(id);
            }
        }
        if end.is_finite() {
            p.frozen = Some(end);
            p.auto = false;
        }
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
                        let info = self.profile.command(p.address);
                        self.session.command(p.address, value, info.as_ref(), true);
                    } else {
                        self.session.notice = "The argument must be a signed 32-bit integer".into();
                    }
                }
                ui.add(
                    super::widgets::typed(egui::DragValue::new(&mut p.address)).range(0..=64999),
                );
                ui.label(RichText::new("Other code").color(palette.text_weak));
            });
        });
        ui.add_space(4.);
        let search = p.search.trim().to_lowercase();
        let mut commands: Vec<SysCommand> = self
            .profile
            .commands()
            .into_iter()
            .filter(|c| {
                search.is_empty()
                    || c.name.to_lowercase().contains(&search)
                    || c.code.to_string().contains(&search)
            })
            .collect();
        // The Profile's own commands come first; the library's flash and
        // reset commands sit below them, away from everyday use.
        commands.sort_by_key(|c| (65000..=65002).contains(&c.code));
        let argument = p.input.trim().to_string();
        let warn = colors::role(ui, Role::Warn);
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
                        if c.critical {
                            ui.label(RichText::new(super::icons::WARNING).color(warn))
                                .on_hover_text("Critical: asks for press-and-hold before sending");
                        }
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
                        let label = if c.critical {
                            RichText::new("Send").color(warn)
                        } else {
                            RichText::new("Send")
                        };
                        if ui
                            .add_enabled(controlled, egui::Button::new(label).small())
                            .on_hover_text(format!("Send {} with argument {argument}", c.name))
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
                Ok(v) => {
                    let info = self.profile.command(code);
                    self.session.command(code, v, info.as_ref(), true)
                }
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
                    ui.add(
                        super::widgets::typed(egui::DragValue::new(&mut p.address))
                            .prefix("address "),
                    );
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
                .map_or("—".into(), |r| {
                    DisplayFormat::Native.format_with(e, r.value, self.profile.metadata(s, &e.name))
                });
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
            ui.label(
                RichText::new(colors::mark(role))
                    .small()
                    .color(colors::role(ui, role)),
            );
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
                    let meta = self.profile.metadata(s, &e.name);
                    if let Some((scale, offset)) = meta.and_then(Metadata::scaling) {
                        key(ui, "Raw");
                        ui.monospace(e.format(r.value));
                        ui.end_row();
                        key(ui, "Scaling");
                        ui.monospace(format!(
                            "× {} + {}",
                            format_number(scale),
                            format_number(offset)
                        ));
                        ui.end_row();
                    }
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
                    let meta = self.profile.metadata(s, &e.name);
                    self.session.write(s, e, &p.input, meta, false);
                }
                if let Some(outcome) = self.session.writes.get(&(s, e.address)) {
                    colors::outcome_inline(ui, outcome);
                }
            });
        }
    }
    fn logs(&mut self, ui: &mut egui::Ui, p: &mut Pane) {
        let palette = theme::of(ui);
        let frozen_id = egui::Id::new((&p.id, "log-frozen"));
        let frozen = ui.data(|d| d.get_temp::<Arc<VecDeque<LogEntry>>>(frozen_id));
        ui.horizontal(|ui| {
            let field = ui.add(
                egui::TextEdit::singleline(&mut p.search)
                    .hint_text("Filter messages  /")
                    .desired_width(220.),
            );
            take_search_focus(&field);
            controls::segmented(
                ui,
                &mut p.min_level,
                &[(0, "All"), (1, "Warnings"), (2, "Errors")],
            );
            egui::ComboBox::from_id_salt((&p.id, "source"))
                .width(110.)
                .selected_text(match p.log_source {
                    0 => "All sources",
                    n => LOG_SOURCES
                        .get(n as usize - 1)
                        .map_or("All sources", |(_, name)| *name),
                })
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut p.log_source, 0, "All sources");
                    for (i, (_, name)) in LOG_SOURCES.iter().enumerate() {
                        ui.selectable_value(&mut p.log_source, i as u8 + 1, *name);
                    }
                });
            // Pausing keeps the entries shown at that moment; new activity is
            // still collected and appears when the pause is released.
            let mut paused = frozen.is_some();
            if ui
                .toggle_value(&mut paused, "Pause")
                .on_hover_text("Stop adding new entries to this view")
                .changed()
            {
                ui.data_mut(|d| {
                    if paused {
                        d.insert_temp(frozen_id, Arc::new(self.session.logs.clone()));
                    } else {
                        d.remove_temp::<Arc<VecDeque<LogEntry>>>(frozen_id);
                    }
                });
            }
            if let Some(frozen) = &frozen {
                let since = frozen.back().map_or(f64::NEG_INFINITY, |l| l.timestamp);
                let new = self
                    .session
                    .logs
                    .iter()
                    .rev()
                    .take_while(|l| l.timestamp > since)
                    .count();
                ui.label(
                    RichText::new(format!("Paused · {new} new"))
                        .small()
                        .color(colors::role(ui, Role::Warn)),
                );
            }
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
        let shown = frozen.as_deref().unwrap_or(&self.session.logs);
        let rows: Vec<&LogEntry> = shown
            .iter()
            .filter(|l| severity(&l.level) >= p.min_level)
            .filter(|l| p.log_source == 0 || source_index(&l.category) + 1 == p.log_source as usize)
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
        // A selected packet opens the inspector: bytes and decoded fields.
        let selected_id = egui::Id::new((&p.id, "log-selected"));
        let selected = ui.data(|d| d.get_temp::<(f64, String)>(selected_id));
        if let Some(packet) = selected.as_ref().and_then(|(time, message)| {
            rows.iter()
                .find(|l| l.timestamp == *time && &l.message == message)
                .and_then(|l| l.packet_data.as_ref())
        }) {
            if packet_inspector(ui, packet) {
                ui.data_mut(|d| d.remove_temp::<(f64, String)>(selected_id));
            }
            ui.add_space(6.);
        }
        // One line per entry so only visible rows are laid out, however long
        // the log grows; packet details stay on the same line.
        let dark = ui.visuals().dark_mode;
        let mut clicked = None;
        egui_extras::TableBuilder::new(ui)
            .id_salt((&p.id, "log"))
            .striped(true)
            .sense(egui::Sense::click())
            .stick_to_bottom(frozen.is_none())
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
                    row.set_selected(
                        selected
                            .as_ref()
                            .is_some_and(|(t, m)| *t == l.timestamp && m == &l.message),
                    );
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
                    if row.response().clicked() && l.packet_data.is_some() {
                        clicked = Some((l.timestamp, l.message.clone()));
                    }
                });
            });
        if let Some(selection) = clicked {
            ui.data_mut(|d| d.insert_temp(selected_id, selection));
        }
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
            if ui
                .button("Clear data")
                .on_hover_text("Remove every plot's samples; the notice offers Undo")
                .clicked()
            {
                self.session.clear_histories();
            }
            egui::ComboBox::from_id_salt((&p.id, "window"))
                .selected_text(if p.plot_span > 0. {
                    span_label(p.plot_span)
                } else {
                    format!("Window: {}", span_label(self.prefs.time_span))
                })
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut p.plot_span, 0., "Preferences default");
                    for seconds in [10., 30., 60., 300., 900., 3600.] {
                        ui.selectable_value(&mut p.plot_span, seconds, span_label(seconds));
                    }
                })
                .response
                .on_hover_text("How much time this plot shows");
            ui.checkbox(&mut p.normalise, "Normalise").on_hover_text(
                "Draw each trace as 0–100 % of its own range, so values of very different \
                 size share the plot. The read-out still shows real values.",
            );
            ui.separator();
            let recording = self.session.recording.as_ref().map(|r| {
                let seconds = (crate::communicator::now_ms() - r.started) / 1000.;
                format!("Stop · {} samples · {:.0} s", r.samples, seconds)
            });
            let record = match &recording {
                Some(text) => ui.add(
                    egui::Button::new(
                        RichText::new(format!("● {text}")).color(colors::role(ui, Role::Error)),
                    )
                    .selected(true),
                ),
                None => ui.button("● Record"),
            };
            if record
                .on_hover_text("Record every reading to a CSV file for later replay")
                .clicked()
            {
                self.session.toggle_recording();
            }
            if recording.is_some() {
                ui.ctx()
                    .request_repaint_after(std::time::Duration::from_secs(1));
            }
            let replay = ImportTarget::Recording { pane: p.id.clone() };
            if ui
                .button("Replay…")
                .on_hover_text("Load a recording into this plot")
                .clicked()
            {
                self.session
                    .pick_file(replay.clone(), "DSHub recording", &["csv"]);
            }
            if let Some(import) = self.session.take_import(&replay) {
                match import {
                    Ok(text) => self.replay(p, &text),
                    Err(e) => self.session.notice = e,
                }
            }
            if ui
                .button("Export PNG")
                .on_hover_text("Save an image of this plot")
                .clicked()
            {
                ui.ctx()
                    .data_mut(|d| d.insert_temp(egui::Id::new((&p.id, "png")), true));
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
                                "{},{:.3},{}\n",
                                csv_cell(&s.binding.name),
                                point[0],
                                point[1]
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
                    .small_button(super::icons::CLOSE)
                    .on_hover_text("Delete this trace from every Plot")
                    .clicked()
                {
                    remove = Some(i);
                }
            }
        });
        if let Some(index) = remove {
            let series = self.series.remove(index);
            self.session.removed(
                format!("Removed trace {}", series.binding.name),
                super::session::Undo::Trace { index, series },
            );
        }
        if self.series.is_empty() {
            ui.label("Click Plot beside an entry to add a trace.");
        }
        let span = if p.plot_span > 0. {
            p.plot_span
        } else {
            self.prefs.time_span
        };
        let mut traces: Vec<(String, Vec<[f64; 2]>)> = self
            .series
            .iter()
            .filter(|s| p.plot_series.contains(&s.id) && s.binding.matches(self.profile))
            .filter_map(|s| {
                let h = self
                    .session
                    .histories
                    .get(&(s.binding.space, s.binding.address))?;
                let end = p.frozen.or_else(|| h.back().map(|last| last[0]))?;
                let mut points = window(h, end - span, end, MAX_TRACE_POINTS);
                // Plot in engineering units, as tables and widgets show them.
                if let Some((scale, offset)) = self
                    .profile
                    .metadata(s.binding.space, &s.binding.name)
                    .and_then(Metadata::scaling)
                {
                    for point in &mut points {
                        point[1] = point[1] * scale + offset;
                    }
                }
                Some((s.binding.name.clone(), points))
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
        // Normalised: each trace becomes a percentage of its own range. The
        // (minimum, range) pairs turn read-out values back into real ones.
        let ranges: Vec<Option<(f64, f64)>> = traces
            .iter_mut()
            .map(|(_, points)| {
                if !p.normalise || points.is_empty() {
                    return None;
                }
                let (low, high) = points
                    .iter()
                    .fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), p| {
                        (lo.min(p[1]), hi.max(p[1]))
                    });
                let range = if high > low { high - low } else { 1. };
                for point in points.iter_mut() {
                    point[1] = (point[1] - low) / range * 100.;
                }
                Some((low, range))
            })
            .collect();
        let newest = traces
            .iter()
            .filter_map(|(_, points)| points.last().map(|p| p[0]))
            .fold(f64::NEG_INFINITY, f64::max);
        let mut plot = egui_plot::Plot::new((&p.id, "chart"))
            .legend(egui_plot::Legend::default())
            .height((ui.available_height() - 8.).max(100.))
            .x_axis_formatter(|mark, _| clock::short_time(mark.value * 1000.))
            // The crosshair read-out below lists every trace at once.
            .label_formatter(|_| None)
            .show_x(false)
            .show_y(false);
        plot = plot.allow_zoom(true).allow_drag(true);
        let crosshair = theme::of(ui).text_weak.gamma_multiply(0.6);
        let response = theme::plot_tone(ui, |ui| {
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
                // Crosshair: each trace's sample nearest the pointer's time.
                // It is painted over the plot afterwards, not added as a plot
                // item, so it never takes part in automatic bounds.
                let readout: Vec<(String, [f64; 2])> = plot_ui
                    .pointer_coordinate()
                    .map(|pointer| {
                        traces
                            .iter()
                            .zip(&ranges)
                            .filter_map(|((name, points), range)| {
                                nearest(points, pointer.x).map(|mut point| {
                                    if let Some((low, range)) = range {
                                        point[1] = point[1] / 100. * range + low;
                                    }
                                    (name.clone(), point)
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                let time = plot_ui.pointer_coordinate().map(|pointer| pointer.x);
                let dark = plot_ui.ctx().global_style().visuals.dark_mode;
                for (index, (name, points)) in traces.into_iter().enumerate() {
                    // Theme colours, and dashes past the fourth trace, so
                    // traces are told apart without relying on hue alone.
                    let (colour, dashed) = theme::trace(dark, index);
                    let mut line = egui_plot::Line::new(name, points).color(colour);
                    if dashed {
                        line = line.style(egui_plot::LineStyle::dashed_dense());
                    }
                    plot_ui.line(line);
                }
                (time, readout)
            })
        });
        let rect = response.response.rect;
        let pointer = ui
            .ctx()
            .pointer_hover_pos()
            .filter(|pos| rect.contains(*pos));
        if let (Some(pos), (Some(time), readout)) = (pointer, &response.inner) {
            ui.painter_at(rect)
                .vline(pos.x, rect.y_range(), egui::Stroke::new(1_f32, crosshair));
            // Shown directly rather than as a hover tooltip, which egui hides
            // while the pointer moves.
            let time = clock::time_of_day(time * 1000.);
            egui::Tooltip::always_open(
                ui.ctx().clone(),
                ui.layer_id(),
                egui::Id::new((&p.id, "crosshair")),
                egui::PopupAnchor::Pointer,
            )
            .show(|ui| {
                ui.label(RichText::new(time).color(theme::of(ui).text_weak));
                egui::Grid::new("crosshair")
                    .num_columns(2)
                    .spacing([16., 2.])
                    .show(ui, |ui| {
                        for (name, point) in readout {
                            ui.label(name);
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    ui.monospace(format_float(point[1] as f32));
                                },
                            );
                            ui.end_row();
                        }
                    });
            });
        }
        let png = egui::Id::new((&p.id, "png"));
        if ui.ctx().data_mut(|d| d.remove_temp::<bool>(png)).is_some() {
            ui.ctx()
                .send_viewport_cmd(egui::ViewportCommand::Screenshot(egui::UserData::new(
                    PlotShot(response.response.rect),
                )));
        }
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
                if save.clicked() || (dirty && super::save_requested(ui.ctx())) {
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
        // Fields that differ from the saved Profile are outlined until saved.
        let saved = &*self.profile;
        if p.editing {
            egui::ScrollArea::vertical().show(ui, |ui| {
                let boards_changed = draft.board_types_map != saved.board_types_map;
                let boards = ui.collapsing("Board type definitions", |ui| {
                    let field = ui.add(
                        egui::TextEdit::multiline(&mut draft.board_types_map)
                            .code_editor()
                            .desired_rows(8),
                    );
                    controls::mark_unsaved(ui, field, boards_changed);
                });
                controls::mark_unsaved(ui, boards.header_response, boards_changed);
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
                    let before = saved.sys_commands.iter().find(|s| s.code == c.code);
                    let differs = |f: &dyn Fn(&SysCommand) -> bool| before.is_none_or(f);
                    ui.horizontal(|ui| {
                        let code = ui.add(super::widgets::typed(egui::DragValue::new(&mut c.code)));
                        controls::mark_unsaved(ui, code, before.is_none());
                        let name = ui.text_edit_singleline(&mut c.name);
                        controls::mark_unsaved(ui, name, differs(&|s| s.name != c.name));
                        let description = ui.text_edit_singleline(&mut c.description);
                        controls::mark_unsaved(
                            ui,
                            description,
                            differs(&|s| s.description != c.description),
                        );
                        let critical = ui.checkbox(&mut c.critical, "Critical").on_hover_text(
                            "Always confirm, with a press-and-hold, wherever this command is sent",
                        );
                        controls::mark_unsaved(
                            ui,
                            critical,
                            differs(&|s| s.critical != c.critical),
                        );
                        if ui.small_button(super::icons::CLOSE).clicked() {
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
                        critical: false,
                    });
                }
                ui.separator();
                ui.label("Entry metadata");
                let entries = draft.entries(p.map_space);
                let (meta, saved_meta) = match p.map_space {
                    Space::Register => (&mut draft.registers_metadata, &saved.registers_metadata),
                    Space::Parameter => {
                        (&mut draft.parameters_metadata, &saved.parameters_metadata)
                    }
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
                    let before = saved_meta.get(&name).cloned().unwrap_or_default();
                    let section_changed = meta.get(&name).cloned().unwrap_or_default() != before;
                    let section = ui.collapsing(&name, |ui| {
                        // Edit a copy: expanding a section must not create an
                        // empty entry, which would mark the draft as changed.
                        let mut edited = meta.get(&name).cloned().unwrap_or_default();
                        let m = &mut edited;
                        ui.label("Description");
                        let description = ui.text_edit_multiline(&mut m.description);
                        controls::mark_unsaved(
                            ui,
                            description,
                            m.description != before.description,
                        );
                        ui.label("Unit");
                        let unit = ui.text_edit_singleline(&mut m.unit);
                        controls::mark_unsaved(ui, unit, m.unit != before.unit);
                        egui::Grid::new("engineering")
                            .num_columns(2)
                            .show(ui, |ui| {
                                for (label, hint, field, was) in [
                                    (
                                        "Scale",
                                        "Engineering value = value × scale + offset",
                                        &mut m.scale,
                                        before.scale,
                                    ),
                                    (
                                        "Offset",
                                        "Added after scaling",
                                        &mut m.offset,
                                        before.offset,
                                    ),
                                    (
                                        "Minimum",
                                        "Writes below this engineering value are refused",
                                        &mut m.min,
                                        before.min,
                                    ),
                                    (
                                        "Maximum",
                                        "Writes above this engineering value are refused",
                                        &mut m.max,
                                        before.max,
                                    ),
                                ] {
                                    ui.label(label).on_hover_text(hint);
                                    let response = optional_number(ui, label, field);
                                    controls::mark_unsaved(ui, response, *field != was);
                                    ui.end_row();
                                }
                            });
                        let mut remove = None;
                        for (i, v) in m.value_list.iter_mut().enumerate() {
                            let was = before.value_list.get(i);
                            ui.horizontal(|ui| {
                                let value = ui.text_edit_singleline(&mut v.value);
                                controls::mark_unsaved(
                                    ui,
                                    value,
                                    was.is_none_or(|w| w.value != v.value),
                                );
                                let label = ui.text_edit_singleline(&mut v.label);
                                controls::mark_unsaved(
                                    ui,
                                    label,
                                    was.is_none_or(|w| w.label != v.label),
                                );
                                if ui.small_button(super::icons::CLOSE).clicked() {
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
                        // Bit names label Status Matrix cells.
                        let mut remove = None;
                        for (i, b) in m.bits.iter_mut().enumerate() {
                            let was = before.bits.get(i);
                            ui.horizontal(|ui| {
                                let bit = ui.add(
                                    egui::DragValue::new(&mut b.bit)
                                        .range(0..=31)
                                        .prefix("bit "),
                                );
                                controls::mark_unsaved(ui, bit, was.is_none_or(|w| w.bit != b.bit));
                                let label = ui.text_edit_singleline(&mut b.label);
                                controls::mark_unsaved(
                                    ui,
                                    label,
                                    was.is_none_or(|w| w.label != b.label),
                                );
                                if ui.small_button(super::icons::CLOSE).clicked() {
                                    remove = Some(i);
                                }
                            });
                        }
                        if let Some(i) = remove {
                            m.bits.remove(i);
                        }
                        if ui.button("Add bit name").clicked() {
                            let bit = (0..32)
                                .find(|n| !m.bits.iter().any(|b| b.bit == *n))
                                .unwrap_or(0);
                            m.bits.push(BitLabel {
                                bit,
                                label: format!("BIT_{bit}"),
                            });
                        }
                        if edited == Metadata::default() {
                            meta.remove(&name);
                        } else if meta.get(&name) != Some(&edited) {
                            meta.insert(name.clone(), edited);
                        }
                    });
                    controls::mark_unsaved(ui, section.header_response, section_changed);
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
            self.profile,
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
/// A number field that may be left empty (`None`).
fn optional_number(ui: &mut egui::Ui, salt: &str, value: &mut Option<f64>) -> egui::Response {
    let id = ui.id().with(salt);
    let mut text = ui
        .data(|d| d.get_temp::<String>(id))
        .unwrap_or_else(|| value.map(format_number).unwrap_or_default());
    let response = ui.add(
        egui::TextEdit::singleline(&mut text)
            .hint_text("none")
            .desired_width(120.),
    );
    if response.changed() {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            *value = None;
        } else if let Ok(v) = trimmed.parse::<f64>() {
            *value = v.is_finite().then_some(v);
        }
    }
    if response.has_focus() {
        ui.data_mut(|d| d.insert_temp(id, text));
    } else {
        ui.data_mut(|d| d.remove_temp::<String>(id));
    }
    response
}

/// The screen area of a plot whose image was requested with Export PNG.
#[derive(Clone, Copy)]
struct PlotShot(egui::Rect);

/// Saves the plot images requested in this viewport once its screenshot
/// arrives. Call once per frame in every viewport.
pub fn save_plot_shots(ctx: &egui::Context, session: &Session) {
    let shots: Vec<_> = ctx.input(|i| {
        i.events
            .iter()
            .filter_map(|e| match e {
                egui::Event::Screenshot {
                    image, user_data, ..
                } => user_data
                    .data
                    .as_ref()
                    .and_then(|d| d.downcast_ref::<PlotShot>())
                    .map(|shot| (shot.0, image.clone(), i.pixels_per_point)),
                _ => None,
            })
            .collect()
    });
    for (rect, image, scale) in shots {
        let region = image.region(&rect, Some(scale));
        let bytes: Vec<u8> = region.pixels.iter().flat_map(|p| p.to_array()).collect();
        let mut png = vec![];
        let encoded = image::codecs::png::PngEncoder::new(&mut png);
        if image::ImageEncoder::write_image(
            encoded,
            &bytes,
            region.width() as u32,
            region.height() as u32,
            image::ExtendedColorType::Rgba8,
        )
        .is_ok()
        {
            session.export(png, "plot.png", "png");
        }
    }
}

/// The sample nearest `x` in a time-sorted trace.
fn nearest(points: &[[f64; 2]], x: f64) -> Option<[f64; 2]> {
    let i = points.partition_point(|p| p[0] < x);
    [i.checked_sub(1), Some(i)]
        .into_iter()
        .flatten()
        .filter_map(|i| points.get(i).copied())
        .min_by(|a, b| (a[0] - x).abs().total_cmp(&(b[0] - x).abs()))
}

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

/// A text cell for a CSV export: quoted, with embedded quotes doubled. Text
/// a spreadsheet would run as a formula is prefixed with an apostrophe;
/// plain numbers, including negative ones, are left alone.
pub(super) fn csv_cell(text: &str) -> String {
    let formula = text.starts_with(['=', '+', '-', '@']) && text.parse::<f64>().is_err();
    format!(
        "\"{}{}\"",
        if formula { "'" } else { "" },
        text.replace('"', "\"\"")
    )
}

/// A time window as "30 s", "5 min" or "1 h".
fn span_label(seconds: f64) -> String {
    if seconds >= 3600. {
        format!("{:.0} h", seconds / 3600.)
    } else if seconds >= 60. {
        format!("{:.0} min", seconds / 60.)
    } else {
        format!("{seconds:.0} s")
    }
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
    Cancel(u16),
    Write(Entry, String),
}

/// Focuses `field` if `/` was pressed this frame and no other field took it.
fn take_search_focus(field: &egui::Response) {
    let key = egui::Id::new(super::FOCUS_SEARCH);
    if field.ctx.data_mut(|d| d.remove_temp::<bool>(key)).is_some() {
        field.request_focus();
    }
}
/// Activity log sources, in filter order.
pub const LOG_SOURCES: [(LogCategory, &str); 6] = [
    (LogCategory::Connection, "Connection"),
    (LogCategory::Register, "Register"),
    (LogCategory::Parameter, "Parameter"),
    (LogCategory::AutoRefresh, "Polling"),
    (LogCategory::Plotting, "Plot"),
    (LogCategory::Packet, "Packet"),
];
fn source_index(category: &LogCategory) -> usize {
    LOG_SOURCES
        .iter()
        .position(|(c, _)| std::mem::discriminant(c) == std::mem::discriminant(category))
        .unwrap_or(0)
}
/// The fields of an 8-byte frame (PROTOCOL.md): requests carry type,
/// address and value; responses carry status, address and value.
pub fn packet_fields(bytes: &[u8], request: bool) -> Vec<(&'static str, String, String)> {
    if bytes.len() != 8 {
        return vec![];
    }
    let hex = |range: std::ops::Range<usize>| {
        bytes[range]
            .iter()
            .map(|b| format!("{b:02X}"))
            .collect::<Vec<_>>()
            .join(" ")
    };
    let u16_at = |i: usize| u16::from_le_bytes([bytes[i], bytes[i + 1]]);
    let value = i32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
    let first = if request {
        ("Type", hex(0..2), u16_at(0).to_string())
    } else {
        let status = u16_at(0) as i16;
        (
            "Status",
            hex(0..2),
            format!("{status} ({})", crate::communicator::status_name(status)),
        )
    };
    vec![
        first,
        ("Address", hex(2..4), u16_at(2).to_string()),
        (
            "Value",
            hex(4..8),
            format!(
                "{value} · 0x{:08X} · {}",
                value as u32,
                format_float(f32::from_bits(value as u32))
            ),
        ),
    ]
}
/// The packet inspector; returns true when closed.
fn packet_inspector(ui: &mut egui::Ui, packet: &crate::types::PacketInfo) -> bool {
    let palette = theme::of(ui);
    let bytes: Vec<u8> = packet
        .hex_data
        .split_whitespace()
        .filter_map(|b| u8::from_str_radix(b, 16).ok())
        .collect();
    let mut close = false;
    egui::Frame::new()
        .fill(palette.raised)
        .corner_radius(3)
        .inner_margin(egui::Margin::same(8))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(theme::caption(ui, &format!("{} packet", packet.direction)));
                ui.label(
                    RichText::new(format!(
                        "{} → {}{}",
                        packet.interface,
                        packet.destination,
                        packet
                            .response_time
                            .map(|t| format!(" · {t} ms"))
                            .unwrap_or_default()
                    ))
                    .small()
                    .color(palette.text_weak),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    close = ui
                        .small_button(super::icons::CLOSE)
                        .on_hover_text("Close inspector")
                        .clicked();
                });
            });
            egui::Grid::new("packet-fields")
                .num_columns(3)
                .spacing([16., 4.])
                .show(ui, |ui| {
                    for (name, hex, decoded) in packet_fields(&bytes, packet.direction == "TX") {
                        key(ui, name);
                        ui.monospace(hex);
                        ui.add(
                            egui::Label::new(RichText::new(decoded).monospace()).selectable(true),
                        );
                        ui.end_row();
                    }
                });
            if !packet.analysis.is_empty() {
                ui.label(
                    RichText::new(&packet.analysis)
                        .small()
                        .color(palette.text_weak),
                );
            }
        });
    close
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

#[cfg(test)]
mod crosshair_tests {
    use super::{csv_cell, nearest};

    #[test]
    fn csv_cells_are_quoted_and_never_formulas() {
        assert_eq!(csv_cell("SPEED"), "\"SPEED\"");
        assert_eq!(csv_cell("a \"b\""), "\"a \"\"b\"\"\"");
        assert_eq!(csv_cell("=SUM(A1)"), "\"'=SUM(A1)\"");
        assert_eq!(csv_cell("-12.5"), "\"-12.5\"", "a negative number is data");
    }

    #[test]
    fn crosshair_picks_the_sample_closest_in_time() {
        let points = [[1., 10.], [2., 20.], [4., 40.]];
        assert_eq!(nearest(&points, 2.9), Some([2., 20.]));
        assert_eq!(nearest(&points, 3.1), Some([4., 40.]));
        assert_eq!(nearest(&points, 0.), Some([1., 10.]));
        assert_eq!(nearest(&points, 9.), Some([4., 40.]));
        assert_eq!(nearest(&[], 1.), None);
    }
}

#[cfg(test)]
mod packet_tests {
    #[test]
    fn packet_fields_decode_requests_and_responses() {
        let request = [0x02, 0x00, 0x05, 0x00, 0x2A, 0x00, 0x00, 0x00];
        let fields = super::packet_fields(&request, true);
        assert_eq!(fields[0], ("Type", "02 00".into(), "2".into()));
        assert_eq!(fields[1].2, "5");
        assert!(fields[2].2.starts_with("42 · 0x0000002A"));
        let refused = [0xFE, 0xFF, 0x05, 0x00, 0, 0, 0, 0];
        assert!(super::packet_fields(&refused, false)[0]
            .2
            .starts_with("-2 ("));
        assert!(super::packet_fields(&request[..4], true).is_empty());
    }
}
