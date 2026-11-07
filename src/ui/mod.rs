mod canvas_layout;
mod colors;
mod controls;
mod fonts;
mod map_table;
mod panes;
mod review;
mod session;
#[cfg(feature = "native-smoke")]
mod smoke;
mod widgets;
use crate::model::*;
use eframe::egui::{self, RichText};
use egui_dock::{DockArea, DockState, NodeIndex};
use serde::{Deserialize, Serialize};
use session::{Action, ImportTarget, Session};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PaneKind {
    Overview,
    Registers,
    Parameters,
    System,
    Commands,
    Inspector,
    Log,
    Plot,
    Dashboard,
    MapEditor,
}
impl PaneKind {
    pub fn singleton(self) -> bool {
        matches!(
            self,
            Self::Overview | Self::Inspector | Self::Log | Self::MapEditor
        )
    }
    pub const ALL: [Self; 10] = [
        Self::Overview,
        Self::Registers,
        Self::Parameters,
        Self::System,
        Self::Commands,
        Self::Inspector,
        Self::Log,
        Self::Plot,
        Self::Dashboard,
        Self::MapEditor,
    ];
    pub fn title(self) -> &'static str {
        match self {
            Self::Overview => "Overview",
            Self::Registers => "Registers",
            Self::Parameters => "Parameters",
            Self::System => "System Registers",
            Self::Commands => "Commands",
            Self::Inspector => "Inspector",
            Self::Log => "Activity Log",
            Self::Plot => "Plot",
            Self::Dashboard => "Dashboard",
            Self::MapEditor => "Map Editor",
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Pane {
    pub id: String,
    pub kind: PaneKind,
    pub search: String,
    pub auto: bool,
    pub interval: u64,
    pub input: String,
    pub space: Space,
    pub address: u16,
    pub dashboard: usize,
    pub editing: bool,
    /// Map Editor working copy. Kept out of layouts and Workspaces, which
    /// would otherwise store whole Profile copies and restore stale drafts.
    #[serde(skip)]
    pub draft: Option<Profile>,
    #[serde(skip)]
    pub map_rows: std::collections::BTreeMap<Space, Vec<map_table::Row>>,
    pub map_space: Space,
    pub focus: bool,
    #[serde(default)]
    pub format: DisplayFormat,
    #[serde(default)]
    pub plot_series: Vec<String>,
    /// Plot panes: the time (Unix seconds) the view is frozen at, if paused.
    #[serde(skip)]
    pub frozen: Option<f64>,
}
impl Default for Pane {
    fn default() -> Self {
        Self::new(PaneKind::Overview)
    }
}
impl Pane {
    pub fn new(kind: PaneKind) -> Self {
        Self {
            id: unique_id(),
            kind,
            search: String::new(),
            auto: false,
            interval: 250,
            input: "0".into(),
            space: Space::Register,
            address: 0,
            dashboard: 0,
            editing: false,
            draft: None,
            map_rows: Default::default(),
            map_space: Space::Register,
            focus: false,
            format: DisplayFormat::default(),
            plot_series: vec![],
            frozen: None,
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct NativeWindow {
    #[serde(default)]
    pub position: Option<[f32; 2]>,
    #[serde(default = "default_window_size")]
    pub size: [f32; 2],
    pub id: String,
    pub title: String,
    pub dock: DockState<Pane>,
}
fn default_window_size() -> [f32; 2] {
    [1000., 700.]
}
#[derive(Debug, Clone)]
pub enum PaneRequest {
    Open(Box<Pane>),
    Plot(String),
}

#[derive(Debug, Clone)]
pub struct PaneMove {
    pub source: String,
    pub target: Option<String>,
    pub pane: Pane,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Workspace {
    #[serde(default)]
    pub series_catalog: Vec<PlotSeries>,
    pub id: String,
    pub name: String,
    pub profile_id: String,
    pub dock: DockState<Pane>,
    pub windows: Vec<NativeWindow>,
}
#[derive(Serialize, Deserialize)]
#[serde(default)]
pub struct Saved {
    pub profiles: Vec<Profile>,
    pub active: String,
    pub preferences: Preferences,
    pub dock: DockState<Pane>,
    pub windows: Vec<NativeWindow>,
    pub workspaces: Vec<Workspace>,
    pub series: Vec<PlotSeries>,
    #[serde(default)]
    pub profile_sessions: std::collections::BTreeMap<String, LayoutState>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct LayoutState {
    pub dock: DockState<Pane>,
    pub windows: Vec<NativeWindow>,
    pub series: Vec<PlotSeries>,
}

impl Saved {
    fn leave_dashboard_edit_mode(&mut self) {
        fn reset(dock: &mut DockState<Pane>, windows: &mut [NativeWindow]) {
            for (_, pane) in dock.iter_all_tabs_mut() {
                if pane.kind == PaneKind::Dashboard {
                    pane.editing = false;
                }
            }
            for window in windows {
                reset(&mut window.dock, &mut []);
            }
        }
        reset(&mut self.dock, &mut self.windows);
        for state in self.profile_sessions.values_mut() {
            reset(&mut state.dock, &mut state.windows);
        }
        for workspace in &mut self.workspaces {
            reset(&mut workspace.dock, &mut workspace.windows);
        }
    }
}

const STORAGE_KEY: &str = "dshub-native-v1";

/// `base`, or `base 2`, `base 3`… when another Profile already uses it.
fn unique_name(base: &str, profiles: &[Profile]) -> String {
    let taken = |name: &str| profiles.iter().any(|p| p.name == name);
    if !taken(base) {
        return base.to_string();
    }
    (2..)
        .map(|n| format!("{base} {n}"))
        .find(|name| !taken(name))
        .expect("an unused name")
}

/// Loads saved state. Unreadable state is never silently replaced: the raw text
/// is backed up first, and if that fails, saving stays disabled for this run.
fn load_saved(storage: Option<&dyn eframe::Storage>) -> (Saved, Option<String>, bool) {
    let Some(storage) = storage else {
        return (Saved::default(), None, true);
    };
    let Some(raw) = storage.get_string(STORAGE_KEY) else {
        return (Saved::default(), None, true);
    };
    if let Some(saved) = eframe::get_value::<Saved>(storage, STORAGE_KEY) {
        return (saved, None, true);
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    let backup = eframe::storage_dir("DSHub")
        .ok_or_else(|| "no application data directory".to_string())
        .and_then(|dir| {
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let path = dir.join(format!("{STORAGE_KEY}-unreadable-{stamp}.ron"));
            std::fs::write(&path, &raw).map_err(|e| e.to_string())?;
            Ok(path)
        });
    match backup {
        Ok(path) => (
            Saved::default(),
            Some(format!(
                "This version of DSHub could not read the saved Profiles, dashboards and layouts. \
                 Defaults are loaded. The original data was preserved at:\n{}",
                path.display()
            )),
            true,
        ),
        Err(e) => (
            Saved::default(),
            Some(format!(
                "This version of DSHub could not read the saved Profiles, dashboards and layouts, \
                 and could not back them up ({e}). Defaults are loaded and nothing will be saved \
                 this session, so the original data is left untouched."
            )),
            false,
        ),
    }
}

fn default_dock() -> DockState<Pane> {
    let mut d = DockState::new(vec![
        Pane::new(PaneKind::Registers),
        Pane::new(PaneKind::Parameters),
        Pane::new(PaneKind::System),
        Pane::new(PaneKind::Commands),
        Pane::new(PaneKind::Dashboard),
        Pane::new(PaneKind::MapEditor),
    ]);
    let [main, _] = d.main_surface_mut().split_right(
        NodeIndex::root(),
        0.72,
        vec![
            Pane::new(PaneKind::Overview),
            Pane::new(PaneKind::Inspector),
        ],
    );
    d.main_surface_mut().split_below(
        main,
        0.66,
        vec![Pane::new(PaneKind::Plot), Pane::new(PaneKind::Log)],
    );
    d
}
impl Default for Saved {
    fn default() -> Self {
        Self {
            profiles: default_profiles(),
            active: "default".into(),
            preferences: Preferences::default(),
            dock: default_dock(),
            windows: vec![],
            workspaces: vec![],
            series: vec![],
            profile_sessions: Default::default(),
        }
    }
}
pub struct Desktop {
    saved: Saved,
    session: Session,
    profiles_open: bool,
    settings_open: bool,
    workspaces_open: bool,
    guide_open: bool,
    review_open: bool,
    name: String,
    frame_count: usize,
    screenshot_requested: bool,
    active_profile: String,
    load_error: Option<String>,
    /// The theme last applied to the context; visuals change only when it differs.
    applied_dark: Option<bool>,
    /// False when unreadable settings could not be backed up: saving would
    /// overwrite the user's only copy.
    persist: bool,
}
impl Desktop {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        fonts::install(&cc.egui_ctx);
        let (mut saved, load_error, persist) = load_saved(cc.storage);
        saved.leave_dashboard_edit_mode();
        // Add the revised emulator panels once, retaining existing user dashboards.
        if let Some(profile) = saved
            .profiles
            .iter_mut()
            .find(|p| p.id == "cnc_motor_controller")
        {
            if !profile
                .dashboards
                .iter()
                .any(|d| d.id == "cnc-emulator-control-v2")
            {
                let mut panels = default_profiles().remove(1).dashboards;
                panels.append(&mut profile.dashboards);
                profile.dashboards = panels;
            }
        }
        let mut app = Self {
            saved,
            session: Session::new(),
            profiles_open: false,
            settings_open: false,
            workspaces_open: false,
            guide_open: false,
            review_open: false,
            name: String::new(),
            frame_count: 0,
            screenshot_requested: false,
            active_profile: String::new(),
            load_error,
            applied_dark: None,
            persist,
        };
        if app.saved.profiles.is_empty() {
            app.saved.profiles = default_profiles();
        }
        if !app.saved.profiles.iter().any(|p| p.id == app.saved.active) {
            app.saved.active = app.saved.profiles[0].id.clone();
        }
        app.active_profile = app.saved.active.clone();
        // Repaint when the backend has news instead of polling on a timer.
        let ctx = cc.egui_ctx.clone();
        app.session.app.set_notifier(move || ctx.request_repaint());
        app.session.send(Action::LogSettings(
            app.saved.preferences.log_settings.clone(),
        ));
        if app.saved.preferences.auto_scan {
            app.session.send(Action::Scan);
        }
        if app.saved.preferences.auto_connect {
            let p = &app.saved.preferences;
            let (address, udp, attempts, delay) = (
                p.last_ip.clone(),
                p.udp,
                p.auto_connect_retries,
                p.auto_connect_retry_delay,
            );
            app.session.auto_connect(&address, udp, attempts, delay);
        }
        #[cfg(feature = "native-smoke")]
        if let Ok(scene) = std::env::var("DSHUB_SMOKE_SCENE") {
            app.configure_smoke(&scene);
        }
        app
    }
    fn profile_index(&self) -> usize {
        self.saved
            .profiles
            .iter()
            .position(|p| p.id == self.saved.active)
            .unwrap_or(0)
    }
    fn open_pane(&mut self, kind: PaneKind, ctx: &egui::Context) {
        if kind.singleton() {
            let pane = self
                .saved
                .dock
                .iter_all_tabs()
                .find(|(_, p)| p.kind == kind)
                .map(|(_, p)| p.clone());
            if let Some(pane) = pane {
                if let Some(index) = self.saved.dock.find_tab(&pane) {
                    self.saved.dock.set_active_tab(index);
                }
                return;
            }
            for window in &mut self.saved.windows {
                let pane = window
                    .dock
                    .iter_all_tabs()
                    .find(|(_, p)| p.kind == kind)
                    .map(|(_, p)| p.clone());
                if let Some(pane) = pane {
                    if let Some(index) = window.dock.find_tab(&pane) {
                        window.dock.set_active_tab(index);
                    }
                    ctx.send_viewport_cmd_to(
                        egui::ViewportId::from_hash_of(&window.id),
                        egui::ViewportCommand::Focus,
                    );
                    return;
                }
            }
        }
        self.saved.dock.push_to_focused_leaf(Pane::new(kind));
    }
    fn chrome(&mut self, ctx: &egui::Context) {
        egui::TopBottomPanel::top("chrome").show(ctx, |ui| {
            ui.add_space(4.);
            ui.horizontal_wrapped(|ui| {
                ui.label(
                    RichText::new("DSHUB")
                        .strong()
                        .size(22.)
                        .color(colors::role(ui, Role::Accent)),
                );
                ui.separator();
                ui.menu_button("Panes", |ui| {
                    for kind in PaneKind::ALL {
                        if ui.button(kind.title()).clicked() {
                            self.open_pane(kind, ctx);
                            ui.close_menu();
                        }
                    }
                    ui.separator();
                    if controls::confirm_button(ui, "reset-layout", "Reset layout") {
                        self.saved.dock = default_dock();
                        ui.close_menu();
                    }
                });
                if ui.button("Profiles").clicked() {
                    self.profiles_open = true;
                }
                if ui.button("Workspaces").clicked() {
                    self.workspaces_open = true;
                }
                if ui.button("Settings").clicked() {
                    self.settings_open = true;
                }
                if ui.button("Guide").clicked() {
                    self.guide_open = true;
                }
            });
            ui.separator();
            ui.horizontal_wrapped(|ui| {
                ui.label(RichText::new("DEVICE").small().weak());
                ui.menu_button("Connect…", |ui| {
                    ui.set_min_width(300.);
                    ui.label(RichText::new("Connect to a device").strong());
                    ui.horizontal(|ui| {
                        ui.label("Address");
                        ui.add(
                            egui::TextEdit::singleline(&mut self.saved.preferences.last_ip)
                                .hint_text("IP or IP:port")
                                .desired_width(170.),
                        );
                    });
                    ui.horizontal(|ui| {
                        ui.label("Transport");
                        ui.selectable_value(&mut self.saved.preferences.udp, false, "TCP");
                        ui.selectable_value(&mut self.saved.preferences.udp, true, "UDP");
                    });
                    if ui
                        .add_enabled(
                            !self.session.busy,
                            egui::Button::new(
                                RichText::new("Connect to address")
                                    .color(colors::role(ui, Role::Accent)),
                            ),
                        )
                        .clicked()
                    {
                        let address = self.saved.preferences.last_ip.clone();
                        self.session
                            .connect_to(&address, self.saved.preferences.udp);
                        ui.close_menu();
                    }
                    ui.separator();
                    ui.horizontal(|ui| {
                        ui.label(RichText::new("Network discovery").strong());
                        if ui
                            .add_enabled(
                                !self.session.scanning,
                                egui::Button::new(if self.session.scanning {
                                    "Scanning…"
                                } else {
                                    "Scan network"
                                }),
                            )
                            .clicked()
                        {
                            self.session.send(Action::Scan);
                        }
                    });
                    ui.weak("Select a device to fill its address, then connect.");
                    egui::ScrollArea::vertical()
                        .max_height(220.)
                        .show(ui, |ui| {
                            if self.session.devices.is_empty() {
                                ui.weak("No devices discovered yet.");
                            }
                            for device in &self.session.devices {
                                if ui
                                    .selectable_label(
                                        self.saved.preferences.last_ip == device.ip_address,
                                        format!("{} · {}", device.board_name, device.ip_address),
                                    )
                                    .clicked()
                                {
                                    self.saved.preferences.last_ip = device.ip_address.clone();
                                }
                            }
                        });
                });
                if self.session.busy {
                    if ui
                        .button("Cancel")
                        .on_hover_text("Stop connecting")
                        .clicked()
                    {
                        self.session.send(Action::Disconnect);
                    }
                } else if let Some(connection) = &self.session.connection {
                    ui.monospace(format!("{}:{}", connection.ip, connection.port));
                    if ui.button("Disconnect").clicked() {
                        self.session.send(Action::Disconnect);
                    }
                }
                colors::connection(ui, &self.session);
                if self.session.connected()
                    && !self.session.controlled()
                    && ui
                        .button(RichText::new("Take control").color(colors::role(ui, Role::Accent)))
                        .on_hover_text("Claim permission to write values and send commands")
                        .clicked()
                {
                    self.session.send(Action::Control);
                }
            });
            ui.horizontal_wrapped(|ui| {
                ui.label(RichText::new("PROFILE").small().weak());
                let review_count = review::count(
                    &self.saved.profiles[self.profile_index()],
                    &self.saved.series,
                );
                if review_count > 0
                    && ui
                        .button(format!("⚠ Review {review_count} bindings"))
                        .clicked()
                {
                    self.review_open = true;
                }
                let old = self.saved.active.clone();
                let index = self.profile_index();
                egui::ComboBox::from_id_salt("profile")
                    .selected_text(&self.saved.profiles[index].name)
                    .show_ui(ui, |ui| {
                        for p in &self.saved.profiles {
                            ui.selectable_value(&mut self.saved.active, p.id.clone(), &p.name);
                        }
                    });
                if old != self.saved.active {
                    self.session.confirm = None;
                    self.session.readings.clear();
                    self.session.histories.clear();
                    self.session.selection = None;
                }
            });
            ui.add_space(4.);
        });
        egui::TopBottomPanel::bottom("status").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.label(format!(
                    "{} subscriptions · {} readings · {} native windows",
                    self.session.last_interests.len(),
                    self.session.readings.len(),
                    self.saved.windows.len()
                ));
                ui.separator();
                if !self.session.notice.is_empty() {
                    ui.colored_label(colors::role(ui, Role::Warn), &self.session.notice);
                    if ui.small_button("Dismiss").clicked() {
                        self.session.notice.clear();
                    }
                }
            });
        });
    }
    fn dialogs(&mut self, ctx: &egui::Context) {
        if self.review_open {
            let mut open = true;
            let index = self.profile_index();
            egui::Window::new("Binding review")
                .open(&mut open)
                .default_width(650.)
                .show(ctx, |ui| {
                    review::show(ui, &mut self.saved.profiles[index], &mut self.saved.series)
                });
            self.review_open = open;
        }
        if self.profiles_open {
            let mut open = true;
            egui::Window::new("Profiles")
                .open(&mut open)
                .default_width(620.)
                .show(ctx, |ui| {
                    ui.label("Maps, metadata and dashboards belong to a Profile.");
                    let mut remove = None;
                    let mut duplicate = None;
                    for (i, p) in self.saved.profiles.iter().enumerate() {
                        ui.horizontal(|ui| {
                            if ui
                                .selectable_label(self.saved.active == p.id, &p.name)
                                .clicked()
                            {
                                self.saved.active = p.id.clone();
                                self.session.confirm = None;
                                self.session.readings.clear();
                                self.session.histories.clear();
                            }
                            if ui.small_button("Duplicate").clicked() {
                                duplicate = Some(i);
                            }
                            if ui.small_button("Export").clicked() {
                                self.session.export(
                                    serde_json::to_string_pretty(&p.export()).unwrap(),
                                    &format!("{}.dshub-profile", p.name),
                                    "dshub-profile",
                                );
                            }
                            if !p.is_default && controls::confirm_button(ui, &p.id, "Delete") {
                                remove = Some(i);
                            }
                        });
                    }
                    if let Some(i) = duplicate {
                        let mut p = self.saved.profiles[i].clone();
                        p.id = unique_id();
                        p.name = unique_name(&format!("{} Copy", p.name), &self.saved.profiles);
                        p.is_default = false;
                        self.saved.active = p.id.clone();
                        self.saved.profiles.push(p);
                    }
                    if let Some(i) = remove {
                        self.saved.profiles.remove(i);
                        if !self
                            .saved
                            .profiles
                            .iter()
                            .any(|p| p.id == self.saved.active)
                        {
                            self.saved.active = self.saved.profiles[0].id.clone();
                        }
                    }
                    if ui.button("Import .dshub-profile").clicked() {
                        self.session.pick_file(
                            ImportTarget::Profile,
                            "DSHub Profile",
                            &["dshub-profile", "json"],
                        );
                    }
                    let i = self.profile_index();
                    ui.separator();
                    ui.label("Active Profile name");
                    ui.text_edit_singleline(&mut self.saved.profiles[i].name);
                    let name = self.saved.profiles[i].name.trim();
                    if name.is_empty() {
                        ui.colored_label(colors::role(ui, Role::Warn), "A Profile needs a name.");
                    } else if self
                        .saved
                        .profiles
                        .iter()
                        .enumerate()
                        .any(|(j, p)| j != i && p.name.trim() == name)
                    {
                        ui.colored_label(
                            colors::role(ui, Role::Warn),
                            "Another Profile already has this name.",
                        );
                    }
                });
            self.profiles_open = open;
        }
        if self.settings_open {
            let mut open = true;
            egui::Window::new("Settings")
                .open(&mut open)
                .show(ctx, |ui| {
                    let p = &mut self.saved.preferences;
                    let before = p.log_settings.clone();
                    ui.checkbox(&mut p.dark, "Dark theme");
                    ui.checkbox(&mut p.auto_scan, "Scan on startup");
                    ui.checkbox(&mut p.auto_connect, "Connect to last device on startup");
                    ui.add_space(4.);
                    egui::Grid::new("settings-numbers")
                        .num_columns(2)
                        .spacing([12., 6.])
                        .show(ui, |ui| {
                            ui.label("Connection attempts");
                            ui.add(egui::DragValue::new(&mut p.auto_connect_retries).range(1..=10));
                            ui.end_row();
                            ui.label("Retry delay");
                            ui.add(
                                egui::DragValue::new(&mut p.auto_connect_retry_delay)
                                    .range(500..=10000)
                                    .suffix(" ms"),
                            );
                            ui.end_row();
                            ui.label("Widget / plot interval");
                            ui.add(
                                egui::DragValue::new(&mut p.poll_ms)
                                    .range(50..=5000)
                                    .suffix(" ms"),
                            );
                            ui.end_row();
                            ui.label("Plot window");
                            ui.add(
                                egui::DragValue::new(&mut p.time_span)
                                    .range(1.0..=3600.)
                                    .suffix(" s"),
                            );
                            ui.end_row();
                            ui.label("Points kept per plotted address");
                            ui.add(egui::DragValue::new(&mut p.max_points).range(100..=100000));
                            ui.end_row();
                            ui.label("Log retention");
                            ui.add(
                                egui::DragValue::new(&mut p.log_settings.max_log_count)
                                    .range(100..=10000)
                                    .suffix(" entries"),
                            );
                            ui.end_row();
                            ui.label("Request rate limit").on_hover_text(
                                "Maximum device requests per second. 0 removes the limit.",
                            );
                            ui.add(
                                egui::DragValue::new(&mut p.log_settings.request_rate_limit)
                                    .range(0..=10000)
                                    .custom_formatter(|v, _| {
                                        if v == 0. {
                                            "unlimited".into()
                                        } else {
                                            format!("{v} / s")
                                        }
                                    }),
                            );
                            ui.end_row();
                        });
                    ui.separator();
                    ui.label(RichText::new("Activity log").strong());
                    let l = &mut p.log_settings;
                    ui.checkbox(&mut l.enable_connection_logs, "Connection events");
                    ui.checkbox(&mut l.enable_register_logs, "Register events");
                    ui.checkbox(&mut l.enable_parameter_logs, "Parameter events");
                    ui.checkbox(&mut l.enable_packet_logs, "Packet hex dumps");
                    ui.checkbox(&mut l.enable_auto_refresh_logs, "Auto-refresh events");
                    ui.checkbox(&mut l.enable_plotting_logs, "Plot events");
                    // Every setting applies as soon as it changes.
                    if *l != before {
                        self.session.send(Action::LogSettings(l.clone()));
                    }
                });
            self.settings_open = open;
        }
        if self.workspaces_open {
            let mut open = true;
            egui::Window::new("Workspaces")
                .open(&mut open)
                .show(ctx, |ui| {
                    ui.horizontal(|ui| {
                        ui.text_edit_singleline(&mut self.name);
                        if ui
                            .add_enabled(
                                !self.name.trim().is_empty(),
                                egui::Button::new("Save current"),
                            )
                            .clicked()
                        {
                            self.saved.workspaces.push(Workspace {
                                id: unique_id(),
                                name: self.name.clone(),
                                profile_id: self.saved.active.clone(),
                                dock: self.saved.dock.clone(),
                                windows: self.saved.windows.clone(),
                                series_catalog: self.saved.series.clone(),
                            });
                            self.name.clear();
                        }
                    });
                    let mut remove = None;
                    for (i, w) in self
                        .saved
                        .workspaces
                        .iter()
                        .enumerate()
                        .filter(|(_, w)| w.profile_id == self.saved.active)
                    {
                        ui.horizontal(|ui| {
                            ui.label(&w.name);
                            if ui.button("Restore").clicked() {
                                self.saved.dock = w.dock.clone();
                                self.saved.windows = w.windows.clone();
                                self.saved.series = w.series_catalog.clone();
                            }
                            if controls::confirm_button(ui, &w.id, "Delete") {
                                remove = Some(i);
                            }
                        });
                    }
                    if let Some(i) = remove {
                        self.saved.workspaces.remove(i);
                    }
                });
            self.workspaces_open = open;
        }
        if self.guide_open {
            egui::Window::new("DSHub Guide").open(&mut self.guide_open).show(ctx,|ui|{ui.heading("Connect → Take Control → Inspect");ui.label("Scan for devices, or enter an IP and select TCP or UDP. Connect, then Take Control before sending writes and commands.");ui.label("Drag pane tabs to split or rearrange the workspace. Right-click a tab to move it into a native window or focus it. Add closed panes from the Panes menu.");ui.label("Choose a Profile for the device's maps. Register and parameter tables support search, live refresh, writes, Inspector selection and plotting. System registers are always read-only.");ui.label("Add widgets in a Dashboard and configure their bindings. Map edits that move or replace entries require binding review before affected widgets can read or write.");ui.label("Export Profiles to move maps and dashboards between installations. Save named Workspaces to retain pane arrangements.");ui.separator();ui.label(format!("DSHub {} · egui / Rust · MIT",env!("CARGO_PKG_VERSION")));ui.collapsing("Bundled font license", |ui| { egui::ScrollArea::vertical().max_height(200.).show(ui, |ui| { ui.label(fonts::LICENSE); }); });});
        }
        if let Some(error) = &self.load_error {
            let mut dismissed = false;
            egui::Modal::new(egui::Id::new("load-error")).show(ctx, |ui| {
                ui.set_max_width(520.);
                ui.heading("Saved settings could not be read");
                ui.label(error);
                if ui.button("Continue").clicked() {
                    dismissed = true;
                }
            });
            if dismissed {
                self.load_error = None;
            }
        }
    }
}
/// The pending device-action confirmation, shown modally in every viewport so it
/// appears wherever the operator is working and blocks other input until answered.
fn confirm_modal(ctx: &egui::Context, session: &mut Session) {
    let Some((message, action)) = session.confirm.clone() else {
        return;
    };
    let response = egui::Modal::new(egui::Id::new("confirm-device-action")).show(ctx, |ui| {
        ui.set_max_width(420.);
        ui.heading("Confirm device action");
        ui.label(message);
        ui.add_space(8.);
        ui.horizontal(|ui| {
            let cancel = ui.button("Cancel");
            if ui.memory(|m| m.focused().is_none()) {
                cancel.request_focus();
            }
            if cancel.clicked() {
                session.confirm = None;
            }
            if ui
                .button(RichText::new("Confirm").color(colors::role(ui, Role::Warn)))
                .clicked()
            {
                session.send(action);
                session.confirm = None;
            }
        });
    });
    // Esc or a click outside cancels.
    if response.should_close() {
        session.confirm = None;
    }
}
impl eframe::App for Desktop {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.frame_count += 1;
        if let Ok(path) = std::env::var("DSHUB_SCREENSHOT") {
            if self.frame_count > 25 && !self.screenshot_requested {
                #[cfg(feature = "native-smoke")]
                if std::env::var_os("DSHUB_SMOKE_SCENE").is_some() {
                    assert!(
                        self.session.connected(),
                        "native smoke test failed to connect to emulator"
                    );
                    assert!(
                        self.session.controlled(),
                        "native smoke test did not acquire control"
                    );
                }
                ctx.send_viewport_cmd_to(
                    egui::ViewportId::ROOT,
                    egui::ViewportCommand::Screenshot(egui::UserData::default()),
                );
                self.screenshot_requested = true;
            }
            for event in ctx.input(|i| i.events.clone()) {
                if let egui::Event::Screenshot {
                    viewport_id, image, ..
                } = event
                {
                    if viewport_id != egui::ViewportId::ROOT {
                        continue;
                    }
                    let bytes: Vec<u8> = image.pixels.iter().flat_map(|p| p.to_array()).collect();
                    match image::save_buffer(
                        &path,
                        &bytes,
                        image.width() as u32,
                        image.height() as u32,
                        image::ColorType::Rgba8,
                    ) {
                        Ok(()) => ctx.send_viewport_cmd(egui::ViewportCommand::Close),
                        Err(e) => self.session.notice = e.to_string(),
                    }
                }
            }
        }
        let i = self.profile_index();
        self.session
            .drain(&self.saved.profiles[i], &self.saved.preferences);
        self.session.interests.clear();
        if self.applied_dark != Some(self.saved.preferences.dark) {
            ctx.set_visuals(if self.saved.preferences.dark {
                egui::Visuals::dark()
            } else {
                egui::Visuals::light()
            });
            self.applied_dark = Some(self.saved.preferences.dark);
        }
        while let Some(import) = self.session.take_import(&ImportTarget::Profile) {
            match import.and_then(|text| Profile::import(&text)) {
                Ok(p) => {
                    self.saved.active = p.id.clone();
                    self.saved.profiles.push(p);
                }
                Err(e) => self.session.notice = e,
            }
        }
        self.chrome(ctx);
        self.dialogs(ctx);
        if self.active_profile != self.saved.active {
            self.saved.profile_sessions.insert(
                self.active_profile.clone(),
                LayoutState {
                    dock: self.saved.dock.clone(),
                    windows: self.saved.windows.clone(),
                    series: self.saved.series.clone(),
                },
            );
            let layout = self
                .saved
                .profile_sessions
                .get(&self.saved.active)
                .cloned()
                .unwrap_or_else(|| LayoutState {
                    dock: default_dock(),
                    windows: vec![],
                    series: vec![],
                });
            self.saved.dock = layout.dock;
            self.saved.windows = layout.windows;
            self.saved.series = layout.series;
            self.active_profile = self.saved.active.clone();
            self.session.readings.clear();
            self.session.histories.clear();
            self.session.selection = None;
            self.session.confirm = None;
        }
        let i = self.profile_index();
        let destinations: Vec<_> = std::iter::once(("main".to_string(), "Main Window".to_string()))
            .chain(
                self.saved
                    .windows
                    .iter()
                    .map(|w| (w.id.clone(), w.title.clone())),
            )
            .collect();
        let mut moved = vec![];
        let mut added = vec![];
        let profile = &mut self.saved.profiles[i];
        let prefs = &self.saved.preferences;
        let series = &mut self.saved.series;
        let wanted: std::collections::HashSet<_> = self
            .saved
            .dock
            .iter_all_tabs()
            .chain(
                self.saved
                    .windows
                    .iter()
                    .flat_map(|w| w.dock.iter_all_tabs()),
            )
            .filter(|(_, p)| p.kind == PaneKind::Plot)
            .flat_map(|(_, p)| p.plot_series.iter().cloned())
            .collect();
        for s in series.iter().filter(|s| wanted.contains(&s.id)) {
            self.session.interest(&s.binding, profile, prefs.poll_ms);
            self.session.want_history(&s.binding);
        }
        egui::CentralPanel::default().show(ctx, |ui| {
            let mut viewer = panes::Viewer {
                session: &mut self.session,
                profile,
                prefs,
                series,
                moved: &mut moved,
                added: &mut added,
                window_id: "main",
                destinations: &destinations,
            };
            draw_dock(ui, &mut self.saved.dock, "main-dock", &mut viewer);
        });
        confirm_modal(ctx, &mut self.session);
        let mut closed = vec![];
        for (wi, window) in self.saved.windows.iter_mut().enumerate() {
            let id = egui::ViewportId::from_hash_of(&window.id);
            let mut builder = egui::ViewportBuilder::default()
                .with_title(format!("DSHub · {}", window.title))
                .with_inner_size(window.size);
            if let Some(position) = window.position {
                builder = builder.with_position(position);
            }
            ctx.show_viewport_immediate(id, builder, |ctx, _class| {
                ctx.input(|i| {
                    if let Some(rect) = i.viewport().inner_rect {
                        window.size = [rect.width(), rect.height()];
                    }
                    if let Some(rect) = i.viewport().outer_rect {
                        window.position = Some([rect.min.x, rect.min.y]);
                    }
                });
                if ctx.input(|i| i.viewport().close_requested()) {
                    closed.push(wi);
                }
                egui::CentralPanel::default().show(ctx, |ui| {
                    let mut viewer = panes::Viewer {
                        session: &mut self.session,
                        profile,
                        prefs,
                        series,
                        moved: &mut moved,
                        added: &mut added,
                        window_id: &window.id,
                        destinations: &destinations,
                    };
                    draw_dock(ui, &mut window.dock, &window.id, &mut viewer);
                });
                confirm_modal(ctx, &mut self.session);
            });
        }
        for i in closed.into_iter().rev() {
            let window = self.saved.windows.remove(i);
            for (_, p) in window.dock.iter_all_tabs() {
                self.saved.dock.push_to_focused_leaf(p.clone());
            }
        }
        for request in added {
            match request {
                PaneRequest::Open(pane) => self.saved.dock.push_to_focused_leaf(*pane),
                PaneRequest::Plot(id) => {
                    let pane = self
                        .saved
                        .dock
                        .iter_all_tabs()
                        .find(|(_, p)| p.kind == PaneKind::Plot)
                        .map(|(_, p)| p.clone());
                    if let Some(pane) = pane {
                        if let Some((_, existing)) = self
                            .saved
                            .dock
                            .iter_all_tabs_mut()
                            .find(|(_, p)| p.id == pane.id)
                        {
                            if !existing.plot_series.contains(&id) {
                                existing.plot_series.push(id);
                            }
                        }
                        if let Some(index) = self.saved.dock.find_tab(&pane) {
                            self.saved.dock.set_active_tab(index);
                        }
                    } else {
                        let mut pane = Pane::new(PaneKind::Plot);
                        pane.plot_series.push(id);
                        self.saved.dock.push_to_focused_leaf(pane);
                    }
                }
            }
        }
        for request in moved {
            let dock = if request.source == "main" {
                Some(&mut self.saved.dock)
            } else {
                self.saved
                    .windows
                    .iter_mut()
                    .find(|w| w.id == request.source)
                    .map(|w| &mut w.dock)
            };
            let pane = dock.and_then(|dock| {
                dock.find_tab(&request.pane)
                    .and_then(|index| dock.remove_tab(index))
            });
            let Some(pane) = pane else {
                continue;
            };
            match request.target.as_deref() {
                Some("main") => self.saved.dock.push_to_focused_leaf(pane),
                Some(target) => {
                    if let Some(window) = self.saved.windows.iter_mut().find(|w| w.id == target) {
                        window.dock.push_to_focused_leaf(pane);
                    } else {
                        self.saved.dock.push_to_focused_leaf(pane);
                    }
                }
                None => self.saved.windows.push(NativeWindow {
                    id: unique_id(),
                    title: pane.kind.title().into(),
                    dock: DockState::new(vec![pane]),
                    position: None,
                    size: default_window_size(),
                }),
            }
        }
        self.session.sync();
        // Backend events wake the interface themselves. Time alone changes only
        // staleness badges and acknowledgement timeouts, which need no more
        // than a slow tick. Screenshot runs keep a fast cadence to finish promptly.
        if std::env::var_os("DSHUB_SCREENSHOT").is_some() {
            ctx.request_repaint_after(std::time::Duration::from_millis(50));
        } else if self.session.connected() || self.session.awaiting_outcome() {
            ctx.request_repaint_after(std::time::Duration::from_millis(500));
        }
    }
    fn save(&mut self, storage: &mut dyn eframe::Storage) {
        if self.persist {
            eframe::set_value(storage, STORAGE_KEY, &self.saved);
        }
    }
    fn auto_save_interval(&self) -> std::time::Duration {
        std::time::Duration::from_secs(5)
    }
}
impl PartialEq for Pane {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

fn draw_dock(
    ui: &mut egui::Ui,
    dock: &mut DockState<Pane>,
    id: &str,
    viewer: &mut panes::Viewer<'_>,
) {
    use egui_dock::TabViewer;
    if let Some((_, pane)) = dock.iter_all_tabs_mut().find(|(_, p)| p.focus) {
        ui.horizontal(|ui| {
            ui.heading(pane.kind.title());
            // Esc that closes a popup or leaves a text field stays with it.
            let idle = ui.memory(|m| m.focused().is_none() && !m.any_popup_open());
            if ui.button("Exit Focus · Esc").clicked()
                || (idle && ui.input(|i| i.key_pressed(egui::Key::Escape)))
            {
                pane.focus = false;
            }
        });
        ui.separator();
        viewer.ui(ui, pane);
        return;
    }
    DockArea::new(dock)
        .id(egui::Id::new(id))
        .style(egui_dock::Style::from_egui(ui.style().as_ref()))
        .show_inside(ui, viewer);
}

#[cfg(test)]
mod tests;
