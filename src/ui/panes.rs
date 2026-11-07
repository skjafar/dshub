use super::colors;
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
        ui.heading("Device overview");
        ui.separator();
        if let Some(c) = &self.session.connection {
            ui.label(RichText::new(c.device_name.as_deref().unwrap_or(&c.ip)).size(24.));
            ui.label(format!("{}:{} · {:?}", c.ip, c.port, c.interface_type));
            colors::connection(ui, self.session);
            ui.label(format!("Control interface: {}", c.control_state));
            if let Some(device) = self.session.devices.iter().find(|d| d.ip_address == c.ip) {
                ui.label(&device.board_name);
                ui.label(self.profile.board_type_name(device.board_type));
                ui.label(format!(
                    "Firmware: 0x{:04X} · Device ID: {}",
                    device.firmware_version, device.device_id
                ));
                ui.monospace(&device.mac_address);
            }
        } else {
            colors::connection(ui, self.session);
            ui.label("Use Scan or enter an IP address above.");
        }
        ui.separator();
        ui.label(format!("Profile: {}", self.profile.name));
        for s in Space::ALL {
            ui.label(format!(
                "{}: {} entries",
                s.title(),
                self.profile.parsed(s).entries.len()
            ));
        }
        for address in [0, 1, 2, 3] {
            if let Some(e) = self.profile.entry_at(Space::SysRegister, address) {
                self.session
                    .interest(&Binding::new(Space::SysRegister, &e), self.profile, 1000);
                if let Some(r) = self
                    .session
                    .readings
                    .get(&(Space::SysRegister, address))
                    .filter(|r| r.valid)
                {
                    ui.label(format!("{}: {}", e.name, e.format(r.value)));
                }
            }
        }
        ui.separator();
        ui.label(RichText::new("Recent activity").strong());
        for l in self.session.logs.iter().rev().take(8) {
            ui.colored_label(log_color(ui, &l.level), &l.message);
        }
    }
    fn entries(&mut self, ui: &mut egui::Ui, p: &mut Pane, s: Space) {
        ui.horizontal(|ui| {
            ui.label(RichText::new(s.title()).strong());
            ui.add(
                egui::TextEdit::singleline(&mut p.search)
                    .hint_text("Search name or address")
                    .desired_width(180.),
            );
            ui.checkbox(&mut p.auto, "Live");
            ui.add(
                egui::DragValue::new(&mut p.interval)
                    .range(50..=10000)
                    .suffix(" ms"),
            );
        });
        ui.horizontal(|ui| {
            for format in DisplayFormat::ALL {
                ui.selectable_value(&mut p.format, format, format.title());
            }
        });
        let search = p.search.to_lowercase();
        let entries: Vec<_> = self
            .profile
            .entries(s)
            .into_iter()
            .filter(|e| e.name.to_lowercase().contains(&search) || e.address.to_string() == search)
            .collect();
        ui.horizontal(|ui| {
            ui.label(format!("{} entries", entries.len()));
            if ui
                .add_enabled(self.session.connected(), egui::Button::new("Read visible"))
                .clicked()
            {
                for e in &entries {
                    self.session.read(s, e);
                }
            }
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
        });
        if p.auto {
            for e in &entries {
                self.session
                    .interest(&Binding::new(s, e), self.profile, p.interval);
            }
        }
        ui.separator();
        egui::ScrollArea::both().id_salt("entries").show_rows(
            ui,
            24.,
            entries.len(),
            |ui, range| {
                for e in &entries[range] {
                    ui.horizontal(|ui| {
                        ui.monospace(format!("{:5}", e.address));
                        let selected = self
                            .session
                            .selection
                            .as_ref()
                            .is_some_and(|(ss, ee)| *ss == s && ee.address == e.address);
                        if ui
                            .add_sized([235., 22.], egui::Button::new(&e.name).selected(selected))
                            .clicked()
                        {
                            self.session.selection = Some((s, e.clone()));
                            self.session.read(s, e);
                        }
                        ui.add_sized(
                            [70., 22.],
                            egui::Label::new(RichText::new(e.data_type.as_str()).weak()),
                        );
                        let reading = self.session.readings.get(&(s, e.address));
                        let (role, status) = colors::reading(
                            self.session.connected(),
                            reading,
                            p.auto.then_some(p.interval),
                        );
                        let text = match reading {
                            Some(r) if r.valid => p.format.format(e, r.value),
                            Some(_) => "Error".into(),
                            None => "—".into(),
                        };
                        ui.add_sized(
                            [100., 22.],
                            egui::Label::new(
                                RichText::new(text)
                                    .monospace()
                                    .color(colors::role(ui, role)),
                            ),
                        );
                        ui.add_sized(
                            [105., 22.],
                            egui::Label::new(
                                RichText::new(status).small().color(colors::role(ui, role)),
                            ),
                        );
                        if ui
                            .add_enabled(self.session.connected(), egui::Button::new("Read"))
                            .clicked()
                        {
                            self.session.read(s, e);
                        }
                        if ui.button("Plot").clicked() {
                            self.add_series(s, e);
                        }
                        if e.writable && s != Space::SysRegister {
                            let key = egui::Id::new((&p.id, e.address, "write"));
                            let mut text = ui
                                .ctx()
                                .data_mut(|d| d.get_temp::<String>(key).unwrap_or_default());
                            ui.add(
                                egui::TextEdit::singleline(&mut text)
                                    .desired_width(90.)
                                    .hint_text("New value"),
                            );
                            ui.ctx().data_mut(|d| d.insert_temp(key, text.clone()));
                            if ui
                                .add_enabled(self.session.controlled(), egui::Button::new("Write"))
                                .clicked()
                            {
                                self.session.write_formatted(s, e, &text, p.format, false);
                            }
                        } else {
                            ui.weak("Read-only");
                        }
                        if let Some(outcome) = self.session.writes.get(&(s, e.address)) {
                            colors::outcome(ui, outcome);
                        }
                    });
                }
            },
        );
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
        ui.heading("Commands");
        ui.horizontal(|ui| {
            ui.label("Argument");
            ui.text_edit_singleline(&mut p.input);
            ui.label("Filter");
            ui.text_edit_singleline(&mut p.search);
        });
        ui.separator();
        let commands = self.profile.commands();
        egui::ScrollArea::vertical().show(ui, |ui| {
            for c in commands.iter().filter(|c| {
                c.name.to_lowercase().contains(&p.search.to_lowercase())
                    || c.code.to_string().contains(&p.search)
            }) {
                ui.horizontal(|ui| {
                    ui.monospace(c.code.to_string());
                    ui.label(&c.name).on_hover_text(&c.description);
                    if let Some(outcome) = self.session.commands.get(&c.code) {
                        colors::outcome(ui, outcome);
                    }
                    if ui
                        .add_enabled(self.session.controlled(), egui::Button::new("Send"))
                        .clicked()
                    {
                        match p.input.parse::<i32>() {
                            Ok(v) => self.session.command(c.code, v, true),
                            Err(_) => {
                                self.session.notice =
                                    "Command argument must be a signed 32-bit integer".into()
                            }
                        }
                    }
                });
            }
        });
        ui.separator();
        ui.horizontal(|ui| {
            ui.label("Custom command code");
            ui.add(egui::DragValue::new(&mut p.address).range(0..=64999));
            if ui
                .add_enabled(self.session.controlled(), egui::Button::new("Send custom"))
                .clicked()
            {
                if p.address >= 65000 {
                    self.session.notice =
                        "Codes 65000 and above are library commands; use the list above".into();
                } else if let Ok(value) = p.input.parse() {
                    self.session.command(p.address, value, true);
                } else {
                    self.session.notice = "Invalid command argument".into();
                }
            }
        });
    }
    fn inspector(&mut self, ui: &mut egui::Ui, p: &mut Pane) {
        ui.heading("Inspector");
        ui.collapsing("Read an arbitrary address", |ui| {
            egui::ComboBox::from_id_salt("rawspace")
                .selected_text(p.space.title())
                .show_ui(ui, |ui| {
                    for s in Space::ALL {
                        ui.selectable_value(&mut p.space, s, s.title());
                    }
                });
            ui.add(egui::DragValue::new(&mut p.address));
            if ui
                .add_enabled(self.session.connected(), egui::Button::new("Read address"))
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
        let Some((s, e)) = self.session.selection.clone() else {
            ui.label("Select an entry in any data pane.");
            return;
        };
        ui.separator();
        ui.heading(&e.name);
        ui.label(format!(
            "{} · address {} · {}",
            s.title(),
            e.address,
            e.data_type
        ));
        ui.label(if e.writable {
            "Read / Write"
        } else {
            "Read-only"
        });
        self.session
            .interest(&Binding::new(s, &e), self.profile, 250);
        if let Some(r) = self.session.readings.get(&(s, e.address)) {
            let (role, label) = colors::reading(self.session.connected(), Some(r), Some(250));
            colors::badge(ui, role, label);
            ui.monospace(format!(
                "Signed:   {}\nUnsigned: {}\nHex:      0x{:08X}\nFloat:    {}\nBinary:   {:032b}",
                r.value,
                r.value as u32,
                r.value as u32,
                f32::from_bits(r.value as u32),
                r.value as u32
            ));
        }
        if let Some(m) = self.profile.metadata(s, &e.name) {
            ui.label(&m.description);
            ui.label(format!("Unit: {}", m.unit));
            for v in &m.value_list {
                ui.label(format!("{} = {}", v.value, v.label));
            }
        }
        if ui.button("Add to Plot").clicked() {
            self.add_series(s, &e);
        }
        if e.writable && s != Space::SysRegister {
            ui.horizontal(|ui| {
                ui.text_edit_singleline(&mut p.input);
                if ui
                    .add_enabled(self.session.controlled(), egui::Button::new("Write"))
                    .clicked()
                {
                    self.session.write(s, &e, &p.input, false);
                }
            });
        }
    }
    fn logs(&mut self, ui: &mut egui::Ui, p: &mut Pane) {
        ui.horizontal(|ui| {
            ui.heading("Activity");
            ui.text_edit_singleline(&mut p.search);
            if ui.button("Clear").clicked() {
                self.session.logs.clear();
            }
            if ui.button("Export").clicked() {
                let text = self
                    .session
                    .logs
                    .iter()
                    .map(|l| {
                        format!(
                            "{:.0}\t{:?}\t{:?}\t{}",
                            l.timestamp, l.level, l.category, l.message
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                self.session.export(text, "activity.txt", "txt");
            }
        });
        // One line per entry so only visible rows are laid out, however long
        // the log grows; packet details stay on the same line.
        let query = p.search.trim().to_lowercase();
        let rows: Vec<&LogEntry> = self
            .session
            .logs
            .iter()
            .filter(|l| {
                query.is_empty()
                    || contains_ignore_case(&l.message, &query)
                    || l.packet_data
                        .as_ref()
                        .is_some_and(|d| contains_ignore_case(&d.analysis, &query))
            })
            .collect();
        let row_height = ui.text_style_height(&egui::TextStyle::Monospace) + 4.;
        egui::ScrollArea::both()
            .stick_to_bottom(true)
            .auto_shrink([false, false])
            .show_rows(ui, row_height, rows.len(), |ui, range| {
                for l in &rows[range] {
                    ui.horizontal(|ui| {
                        ui.monospace(format!("{:.3}", l.timestamp / 1000.));
                        ui.colored_label(log_color(ui, &l.level), &l.message);
                        if let Some(packet) = &l.packet_data {
                            ui.add(
                                egui::Label::new(
                                    RichText::new(format!(
                                        "{}  {}  → {}",
                                        packet.hex_data, packet.analysis, packet.destination
                                    ))
                                    .monospace()
                                    .weak(),
                                )
                                .truncate(),
                            );
                        }
                    });
                }
            });
    }
    fn plot(&mut self, ui: &mut egui::Ui, p: &mut Pane) {
        ui.horizontal(|ui| {
            ui.heading("Live Plot");
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
        let newest = traces
            .iter()
            .filter_map(|(_, points)| points.last().map(|p| p[0]))
            .fold(f64::NEG_INFINITY, f64::max);
        let mut plot = egui_plot::Plot::new((&p.id, "chart"))
            .legend(egui_plot::Legend::default())
            .height((ui.available_height() - 8.).max(100.))
            .x_axis_label("Unix time (seconds)")
            .y_axis_label("Value");
        plot = plot.allow_zoom(true).allow_drag(true);
        plot.show(ui, |plot_ui| {
            if p.auto && newest.is_finite() {
                // Follow the newest sample and fit Y to what is visible.
                let (low, high) = traces
                    .iter()
                    .flat_map(|(_, points)| points.iter().map(|p| p[1]))
                    .fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), v| {
                        (lo.min(v), hi.max(v))
                    });
                let pad = ((high - low) * 0.05).max(1e-9);
                plot_ui.set_plot_bounds(egui_plot::PlotBounds::from_min_max(
                    [newest - span, low - pad],
                    [newest, high + pad],
                ));
            }
            for (name, points) in traces {
                plot_ui.line(egui_plot::Line::new(points).name(name));
            }
        });
    }
    fn editor(&mut self, ui: &mut egui::Ui, p: &mut Pane) {
        if p.draft.as_ref().is_none_or(|d| d.id != self.profile.id) {
            p.draft = Some(self.profile.clone());
            p.map_rows.clear();
        }
        let draft = p.draft.as_mut().unwrap();
        ui.horizontal(|ui| {
            ui.heading("Map Editor");
            if ui.button("Save Profile").clicked() {
                let errors: Vec<_> = Space::ALL
                    .into_iter()
                    .flat_map(|s| parse_map(draft.map(s), s).err().unwrap_or_default())
                    .collect();
                if errors.is_empty() {
                    self.profile.apply_map_draft(draft);
                    self.session.confirm = None;
                    self.session.readings.clear();
                    self.session.histories.clear();
                    self.session.notice =
                        "Profile saved. Review affected bindings before using them.".into();
                } else {
                    self.session.notice = errors.join(" · ");
                }
            }
            if ui.button("Revert").clicked() {
                *draft = self.profile.clone();
                p.map_rows.clear();
            }
        });
        ui.horizontal(|ui| {
            for s in Space::ALL {
                ui.selectable_value(&mut p.map_space, s, s.title());
            }
            ui.selectable_value(&mut p.editing, false, "Maps");
            ui.selectable_value(&mut p.editing, true, "Commands / Metadata");
        });
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

pub fn log_color(ui: &egui::Ui, l: &LogLevel) -> Color32 {
    colors::role(
        ui,
        match l {
            LogLevel::Error => Role::Error,
            LogLevel::Warning => Role::Warn,
            LogLevel::Success => Role::Ok,
            LogLevel::Packet => Role::Info,
            _ => Role::Idle,
        },
    )
}
