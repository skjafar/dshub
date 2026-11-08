mod canvas_edit;
mod canvas_layout;
mod clock;
mod colors;
mod controls;
mod fonts;
mod icons;
mod map_table;
mod palette;
mod panes;
mod profile_store;
mod recording;
mod review;
mod session;
#[cfg(feature = "native-smoke")]
mod smoke;
mod theme;
mod toasts;
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
    /// Dashboard working copy while editing; saved to the Profile only on
    /// Save, and kept out of layouts like the Map Editor draft.
    #[serde(skip)]
    pub dashboard_draft: Option<Dashboard>,
    pub map_space: Space,
    pub focus: bool,
    #[serde(default)]
    pub format: DisplayFormat,
    #[serde(default)]
    pub plot_series: Vec<String>,
    /// Activity log: the least severe level shown (0 all, 1 warnings, 2 errors).
    #[serde(default)]
    pub min_level: u8,
    /// Activity log: the source shown (0 all, otherwise a category's position
    /// in `panes::LOG_SOURCES` plus one).
    #[serde(default)]
    pub log_source: u8,
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
            dashboard_draft: None,
            map_space: Space::Register,
            focus: false,
            format: DisplayFormat::Native,
            plot_series: vec![],
            min_level: 0,
            log_source: 0,
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
    /// Layout of this structure; see [`Saved::migrate`]. Data saved before
    /// versioning reads as 1.
    #[serde(default = "legacy_schema")]
    pub schema: u32,
    /// Kept in their own files by [`profile_store`] when a data folder exists;
    /// inline otherwise, and in data saved before schema 2.
    pub profiles: Vec<Profile>,
    /// Profile ids in display order, for Profiles stored as files.
    pub profile_order: Vec<String>,
    pub active: String,
    pub preferences: Preferences,
    pub dock: DockState<Pane>,
    pub windows: Vec<NativeWindow>,
    pub workspaces: Vec<Workspace>,
    pub series: Vec<PlotSeries>,
    #[serde(default)]
    pub profile_sessions: std::collections::BTreeMap<String, LayoutState>,
    /// Whether the Default Profile has been offered the widget showcase.
    /// False in settings saved before it existed; new settings start with
    /// the showcase already in place.
    #[serde(default)]
    pub showcase_added: bool,
    /// Revision of the bundled dashboards these settings hold; see
    /// [`Saved::refresh_bundled`]. Zero in settings saved before it existed.
    #[serde(default)]
    pub bundled_layouts: u32,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct LayoutState {
    pub dock: DockState<Pane>,
    pub windows: Vec<NativeWindow>,
    pub series: Vec<PlotSeries>,
}

/// The current [`Saved`] layout.
const SCHEMA: u32 = 2;
/// Revision of the bundled dashboards' layout. Raise it when they change so
/// stored copies are refreshed.
const BUNDLED_LAYOUTS: u32 = 2;
fn legacy_schema() -> u32 {
    1
}
impl Saved {
    /// Brings data saved by an older version up to [`SCHEMA`].
    fn migrate(&mut self) {
        // 1 → 2: Profiles moved to their own files. Inline Profiles load as
        // before and are written out as files on the first save.
        self.schema = SCHEMA;
    }
    /// Adds the widget showcase to the Default Profile once. Runs after the
    /// Profile files are loaded, since those replace the inline Profiles.
    /// Appended, so open panes keep showing the dashboard they showed; a
    /// deleted showcase does not return.
    fn add_showcase(&mut self) {
        if self.showcase_added {
            return;
        }
        self.showcase_added = true;
        if let Some(p) = self.profiles.iter_mut().find(|p| p.id == "default") {
            if crate::showcase_dashboard::fits(p)
                && !p
                    .dashboards
                    .iter()
                    .any(|d| d.id == crate::showcase_dashboard::ID)
            {
                let showcase = crate::showcase_dashboard::dashboard(p);
                p.dashboards.push(showcase);
            }
        }
    }
    /// Replaces stored copies of the bundled dashboards with their current
    /// layout once per [`BUNDLED_LAYOUTS`] revision. A Profile whose maps were
    /// changed keeps its copies, which may no longer bind; dashboards of the
    /// user's own are never touched.
    fn refresh_bundled(&mut self) {
        if self.bundled_layouts >= BUNDLED_LAYOUTS {
            return;
        }
        self.bundled_layouts = BUNDLED_LAYOUTS;
        for fresh in default_profiles() {
            let Some(p) = self.profiles.iter_mut().find(|p| p.id == fresh.id) else {
                continue;
            };
            let same_maps = p.registers_map == fresh.registers_map
                && p.parameters_map == fresh.parameters_map
                && p.system_registers_map == fresh.system_registers_map;
            let showcase =
                crate::showcase_dashboard::fits(p).then(|| crate::showcase_dashboard::dashboard(p));
            for d in &mut p.dashboards {
                let replacement = if d.id == crate::showcase_dashboard::ID {
                    showcase.clone()
                } else if same_maps {
                    fresh.dashboards.iter().find(|n| n.id == d.id).cloned()
                } else {
                    None
                };
                if let Some(new) = replacement {
                    *d = new;
                }
            }
        }
    }
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

/// Whether this frame's input in the current viewport may have changed saved
/// state. Hover movement alone cannot; presses, keys, text and scrolling can.
pub(super) fn edited(ctx: &egui::Context) -> bool {
    ctx.input(|i| {
        i.events.iter().any(|e| {
            !matches!(
                e,
                egui::Event::PointerMoved(_)
                    | egui::Event::MouseMoved(_)
                    | egui::Event::PointerGone
                    | egui::Event::WindowFocused(_)
                    | egui::Event::Screenshot { .. }
            )
        })
    })
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
            schema: SCHEMA,
            showcase_added: true,
            bundled_layouts: BUNDLED_LAYOUTS,
            profiles: default_profiles(),
            profile_order: vec![],
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
    /// The command palette (Ctrl+K): open, its query and highlighted row.
    palette_open: bool,
    palette_query: String,
    palette_selected: usize,
    review_open: bool,
    name: String,
    frame_count: usize,
    screenshot_requested: bool,
    active_profile: String,
    load_error: Option<String>,
    /// The open Preferences tab.
    settings_tab: u8,
    /// A discovered device double-clicked in the connection panel.
    pending_connect: Option<(String, bool)>,
    /// The theme last applied to the context; visuals change only when it differs.
    applied_dark: Option<bool>,
    /// False when unreadable settings could not be backed up: saving would
    /// overwrite the user's only copy.
    persist: bool,
    /// Profile files; `None` without a data folder (Profiles stay inline).
    profile_files: Option<profile_store::ProfileStore>,
    /// Set by user input, window moves and imports; autosave serialises
    /// `saved` only when this is set, so an idle application writes nothing.
    touched: bool,
}
impl Desktop {
    /// Reverses a removal reported by a toast.
    fn undo(&mut self, undo: session::Undo) {
        match undo {
            session::Undo::Widget {
                profile,
                dashboard,
                parent,
                index,
                widget,
            } => {
                // A widget removed while editing goes back into that draft.
                let draft = self
                    .saved
                    .dock
                    .iter_all_tabs_mut()
                    .map(|(_, p)| p)
                    .chain(
                        self.saved
                            .windows
                            .iter_mut()
                            .flat_map(|w| w.dock.iter_all_tabs_mut().map(|(_, p)| p)),
                    )
                    .filter_map(|p| p.dashboard_draft.as_mut())
                    .find(|d| d.id == dashboard);
                if let Some(draft) = draft {
                    if !widgets::insert(&mut draft.widgets, parent.as_deref(), index, *widget) {
                        self.session.notice = "The widget's container no longer exists".into();
                    }
                } else if !widgets::restore(
                    &mut self.saved.profiles,
                    &profile,
                    &dashboard,
                    parent.as_deref(),
                    index,
                    *widget,
                ) {
                    self.session.notice = "The widget's dashboard no longer exists".into();
                }
            }
            session::Undo::Trace { index, series } => {
                let index = index.min(self.saved.series.len());
                self.saved.series.insert(index, series);
            }
        }
        self.touched = true;
    }
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        fonts::install(&cc.egui_ctx);
        let (mut saved, mut load_error, persist) = load_saved(cc.storage);
        saved.migrate();
        let mut profile_files = cc
            .storage
            .filter(|_| persist)
            .and_then(|_| profile_store::ProfileStore::open());
        if let Some(store) = &mut profile_files {
            let loaded = store.load(&saved.profile_order);
            if !loaded.profiles.is_empty() {
                saved.profiles = loaded.profiles;
            }
            if !loaded.problems.is_empty() {
                let text = format!(
                    "Some Profile files could not be read and were set aside:\n{}",
                    loaded.problems.join("\n")
                );
                load_error = Some(match load_error {
                    Some(previous) => format!("{previous}\n\n{text}"),
                    None => text,
                });
            }
        }
        saved.add_showcase();
        saved.refresh_bundled();
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
            palette_open: false,
            palette_query: String::new(),
            palette_selected: 0,
            review_open: false,
            name: String::new(),
            frame_count: 0,
            screenshot_requested: false,
            active_profile: String::new(),
            load_error,
            settings_tab: 0,
            pending_connect: None,
            applied_dark: None,
            persist,
            profile_files,
            touched: true,
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
                    self.saved.dock.set_active_tab(index).ok();
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
                        window.dock.set_active_tab(index).ok();
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
    /// Ctrl+K opens the command palette; `/` focuses the first search field.
    fn keyboard(&mut self, ctx: &egui::Context) {
        if ctx.input_mut(|i| i.consume_key(egui::Modifiers::COMMAND, egui::Key::K)) {
            self.palette_open = !self.palette_open;
            self.palette_query.clear();
            self.palette_selected = 0;
        }
        let idle = ctx.memory(|m| m.focused().is_none());
        if idle
            && !self.palette_open
            && ctx.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::Slash))
        {
            ctx.data_mut(|d| d.insert_temp(egui::Id::new(FOCUS_SEARCH), true));
        }
        if !self.palette_open {
            return;
        }
        let profile = &self.saved.profiles[self.profile_index()];
        let (choice, close) = palette::show(
            ctx,
            &mut self.palette_query,
            &mut self.palette_selected,
            profile,
        );
        if close {
            self.palette_open = false;
        }
        match choice {
            Some(palette::Choice::Pane(kind)) => self.open_pane(kind, ctx),
            Some(palette::Choice::Entry(s, e)) => {
                self.session.selection = Some((s, e));
                self.open_pane(PaneKind::Inspector, ctx);
            }
            Some(palette::Choice::Command(c)) => {
                // No argument field here: the confirmation names the value.
                self.session.command(c.code, 0, Some(&c), true);
            }
            Some(palette::Choice::Window(window)) => match window {
                "preferences" => self.settings_open = true,
                "profiles" => self.profiles_open = true,
                "workspaces" => self.workspaces_open = true,
                _ => self.guide_open = true,
            },
            Some(palette::Choice::Theme) => {
                self.saved.preferences.dark = !self.saved.preferences.dark;
                self.touched = true;
            }
            None => {}
        }
    }
    fn chrome(&mut self, ui: &mut egui::Ui) {
        let palette = theme::palette(self.saved.preferences.dark);
        egui::Panel::top("chrome")
            .frame(
                egui::Frame::new()
                    .fill(palette.surface)
                    .inner_margin(egui::Margin::symmetric(10, 6))
                    .stroke(egui::Stroke::new(1_f32, palette.ghost)),
            )
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new("DSHub")
                            .family(egui::FontFamily::Name(fonts::SEMIBOLD.into()))
                            .size(15.)
                            .color(palette.accent),
                    );
                    ui.add_space(4.);
                    let ctx = ui.ctx().clone();
                    self.layout_menu(ui, &ctx);
                    ui.separator();
                    self.device_controls(ui);
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui
                            .button(icons::QUESTION)
                            .on_hover_text("Guide and licences")
                            .clicked()
                        {
                            self.guide_open = true;
                        }
                        if ui
                            .button(icons::GEAR)
                            .on_hover_text("Preferences")
                            .clicked()
                        {
                            self.settings_open = true;
                        }
                        ui.separator();
                        self.profile_controls(ui);
                    });
                });
            });
        egui::Panel::bottom("status")
            .frame(
                egui::Frame::new()
                    .fill(palette.surface)
                    .inner_margin(egui::Margin::symmetric(10, 3))
                    .stroke(egui::Stroke::new(1_f32, palette.ghost)),
            )
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    let weak = |text: String| RichText::new(text).small().color(palette.text_weak);
                    ui.label(weak(format!(
                        "{} polled · {} readings",
                        self.session.last_interests.len(),
                        self.session.readings.len(),
                    )));
                    if !self.saved.windows.is_empty() {
                        ui.label(weak(format!("· {} windows", self.saved.windows.len())));
                    }
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        ui.label(weak(format!("v{}", env!("CARGO_PKG_VERSION"))));
                    });
                });
            });
    }
    fn layout_menu(&mut self, ui: &mut egui::Ui, ctx: &egui::Context) {
        ui.menu_button("Panes", |ui| {
            ui.set_min_width(180.);
            for kind in PaneKind::ALL {
                if ui.button(kind.title()).clicked() {
                    self.open_pane(kind, ctx);
                    ui.close();
                }
            }
            ui.separator();
            if ui.button("Workspaces…").clicked() {
                self.workspaces_open = true;
                ui.close();
            }
            if controls::confirm_button(ui, "reset-layout", "Reset layout") {
                self.saved.dock = default_dock();
                ui.close();
            }
        });
    }
    /// The device chip (state at a glance; opens the connection panel), plus
    /// the one action the current state calls for.
    fn device_controls(&mut self, ui: &mut egui::Ui) {
        let popup = ui.make_persistent_id("connection-panel");
        let chip = ui
            .add(
                egui::Button::new(controls::device_chip(ui, &self.session))
                    .min_size(egui::vec2(0., 24.)),
            )
            .on_hover_text(self.session.exposure().unwrap_or("Connection"));
        egui::Popup::from_toggle_button_response(&chip)
            .id(popup)
            .close_behavior(egui::PopupCloseBehavior::CloseOnClickOutside)
            .show(|ui| {
                ui.set_width(460.);
                if self.connection_panel(ui) {
                    egui::Popup::close_id(ui.ctx(), popup);
                }
            });
        if self.session.busy {
            if ui
                .button("Cancel")
                .on_hover_text("Stop connecting")
                .clicked()
            {
                self.session.send(Action::Disconnect);
            }
        } else if self.session.connected() && !self.session.controlled() {
            if controls::primary_button(ui, "Take control")
                .on_hover_text("Claim permission to write values and send commands")
                .clicked()
            {
                self.session.send(Action::Control);
            }
        } else if self.session.connection.is_none()
            && controls::primary_button(ui, "Connect").clicked()
        {
            let address = self.saved.preferences.last_ip.clone();
            self.session
                .connect_to(&address, self.saved.preferences.udp);
        }
    }
    /// Returns true when the panel should close.
    fn connection_panel(&mut self, ui: &mut egui::Ui) -> bool {
        let mut close = false;
        let palette = theme::of(ui);
        ui.label(theme::caption(ui, "Connect"));
        ui.horizontal(|ui| {
            let address = ui.add(
                egui::TextEdit::singleline(&mut self.saved.preferences.last_ip)
                    .hint_text("IP or IP:port")
                    .desired_width(190.),
            );
            controls::segmented(
                ui,
                &mut self.saved.preferences.udp,
                &[(false, "TCP"), (true, "UDP")],
            );
            let enter = address.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
            if (ui
                .add_enabled(!self.session.busy, controls::primary(ui, "Connect"))
                .clicked()
                || enter)
                && !self.session.busy
            {
                let address = self.saved.preferences.last_ip.clone();
                self.session
                    .connect_to(&address, self.saved.preferences.udp);
                close = true;
            }
            if ui
                .add_enabled(!self.session.busy, egui::Button::new("+ Control"))
                .on_hover_text("Connect, then take Control")
                .clicked()
            {
                let address = self.saved.preferences.last_ip.clone();
                self.session
                    .connect_and_control(&address, self.saved.preferences.udp);
                close = true;
            }
        });
        if let Some(summary) = self
            .session
            .connection
            .as_ref()
            .map(|c| format!("{}:{} · {:?}", c.ip, c.port, c.interface_type))
        {
            ui.horizontal(|ui| {
                ui.label(RichText::new(summary).monospace().color(palette.text_weak));
                if ui.button("Disconnect").clicked() {
                    self.session.send(Action::Disconnect);
                    close = true;
                }
            });
        }
        if !self.saved.preferences.recent.is_empty() {
            ui.add_space(6.);
            ui.label(theme::caption(ui, "Recent"));
            let mut chosen = None;
            for device in &self.saved.preferences.recent {
                ui.horizontal(|ui| {
                    let label = match &device.name {
                        Some(name) => format!("{name}  {}", device.address),
                        None => device.address.clone(),
                    };
                    if ui
                        .add_enabled(!self.session.busy, egui::Button::new(label).frame(false))
                        .on_hover_text("Connect")
                        .clicked()
                    {
                        chosen = Some((device.clone(), false));
                    }
                    ui.label(
                        RichText::new(if device.udp { "UDP" } else { "TCP" })
                            .small()
                            .color(palette.text_weak),
                    );
                    if ui
                        .add_enabled(!self.session.busy, egui::Button::new("+ Control").small())
                        .on_hover_text("Connect, then take Control")
                        .clicked()
                    {
                        chosen = Some((device.clone(), true));
                    }
                });
            }
            if let Some((device, control)) = chosen {
                self.saved.preferences.last_ip = device.address.clone();
                self.saved.preferences.udp = device.udp;
                if control {
                    self.session
                        .connect_and_control(&device.address, device.udp);
                } else {
                    self.session.connect_to(&device.address, device.udp);
                }
                close = true;
            }
        }
        ui.add_space(6.);
        ui.horizontal(|ui| {
            ui.label(theme::caption(ui, "Devices on this network"));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if ui
                    .add_enabled(
                        !self.session.scanning,
                        egui::Button::new(if self.session.scanning {
                            "Scanning…"
                        } else {
                            "Scan"
                        }),
                    )
                    .clicked()
                {
                    self.session.send(Action::Scan);
                }
            });
        });
        if self.session.devices.is_empty() {
            ui.label(
                RichText::new(if self.session.scanning {
                    "Listening for replies…"
                } else {
                    "No devices found yet. Scan, or enter an address above."
                })
                .color(palette.text_weak),
            );
            return close;
        }
        let profile = &self.saved.profiles[self.profile_index()];
        egui::Grid::new("discovered-devices")
            .num_columns(4)
            .striped(true)
            .spacing([14., 4.])
            .show(ui, |ui| {
                for heading in ["Device", "Address", "Board", "Firmware"] {
                    ui.label(theme::caption(ui, heading));
                }
                ui.end_row();
                for device in &self.session.devices {
                    let selected = self
                        .saved
                        .preferences
                        .last_ip
                        .split(':')
                        .next()
                        .is_some_and(|ip| ip == device.ip_address);
                    let row = ui
                        .selectable_label(selected, &device.board_name)
                        .on_hover_text(format!(
                            "MAC {} · ID {} · TCP {} / UDP {}\nDouble-click to connect",
                            device.mac_address, device.device_id, device.tcp_port, device.udp_port
                        ));
                    ui.monospace(&device.ip_address);
                    ui.label(profile.board_type_name(device.board_type));
                    ui.monospace(format!("0x{:04X}", device.firmware_version));
                    ui.end_row();
                    if row.clicked() || row.double_clicked() {
                        self.saved.preferences.last_ip = device.ip_address.clone();
                    }
                    if row.double_clicked() {
                        let address = device.ip_address.clone();
                        let udp = self.saved.preferences.udp;
                        // Borrow ends before connecting.
                        close = true;
                        self.pending_connect = Some((address, udp));
                    }
                }
            });
        if let Some((address, udp)) = self.pending_connect.take() {
            self.session.connect_to(&address, udp);
        }
        close
    }
    fn profile_controls(&mut self, ui: &mut egui::Ui) {
        let old = self.saved.active.clone();
        let index = self.profile_index();
        egui::ComboBox::from_id_salt("profile")
            .selected_text(&self.saved.profiles[index].name)
            .width(170.)
            .show_ui(ui, |ui| {
                for p in &self.saved.profiles {
                    ui.selectable_value(&mut self.saved.active, p.id.clone(), &p.name);
                }
                ui.separator();
                if ui.button("Manage Profiles…").clicked() {
                    self.profiles_open = true;
                }
            });
        ui.label(theme::caption(ui, "Profile"));
        if old != self.saved.active {
            self.session.confirm = None;
            self.session.readings.clear();
            self.session.histories.clear();
            self.session.selection = None;
        }
        let review_count = review::count(
            &self.saved.profiles[self.profile_index()],
            &self.saved.series,
        );
        if review_count > 0
            && ui
                .add(
                    egui::Button::new(
                        RichText::new(format!("{} {review_count} to review", icons::WARNING))
                            .color(colors::role(ui, Role::Warn)),
                    )
                    .stroke(egui::Stroke::new(
                        1_f32,
                        colors::role(ui, Role::Warn).gamma_multiply(0.5),
                    )),
                )
                .on_hover_text("Map changes moved or replaced bound entries")
                .clicked()
        {
            self.review_open = true;
        }
    }
    fn profile_manager(&mut self, ui: &mut egui::Ui) {
        let palette = theme::of(ui);
        let mut remove = None;
        let mut duplicate = None;
        let mut create = false;
        ui.horizontal_top(|ui| {
            ui.vertical(|ui| {
                ui.set_width(220.);
                ui.label(theme::caption(ui, "Profiles"));
                egui::ScrollArea::vertical()
                    .max_height(260.)
                    .show(ui, |ui| {
                        ui.with_layout(egui::Layout::top_down_justified(egui::Align::Min), |ui| {
                            for p in &self.saved.profiles {
                                let mut text = egui::text::LayoutJob::default();
                                RichText::new(&p.name).append_to(
                                    &mut text,
                                    ui.style(),
                                    egui::FontSelection::Default,
                                    egui::Align::Center,
                                );
                                if p.is_default {
                                    RichText::new("   bundled")
                                        .small()
                                        .color(palette.text_weak)
                                        .append_to(
                                            &mut text,
                                            ui.style(),
                                            egui::FontSelection::Default,
                                            egui::Align::Center,
                                        );
                                }
                                if ui
                                    .selectable_label(self.saved.active == p.id, text)
                                    .clicked()
                                {
                                    self.saved.active = p.id.clone();
                                }
                            }
                        });
                    });
                ui.add_space(6.);
                ui.horizontal(|ui| {
                    if ui
                        .button("New")
                        .on_hover_text(
                            "Create an empty Profile with the protocol's system registers",
                        )
                        .clicked()
                    {
                        create = true;
                    }
                    if ui.button("Import…").clicked() {
                        self.session.pick_file(
                            ImportTarget::Profile,
                            "DSHub Profile",
                            &["dshub-profile", "json"],
                        );
                    }
                });
            });
            ui.add_space(16.);
            ui.vertical(|ui| {
                let i = self.profile_index();
                ui.label(theme::caption(ui, "Name"));
                ui.add(
                    egui::TextEdit::singleline(&mut self.saved.profiles[i].name)
                        .hint_text("Profile name")
                        .desired_width(260.),
                )
                .on_hover_text("Rename the selected Profile");
                let name = self.saved.profiles[i].name.trim().to_string();
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
                ui.add_space(6.);
                let p = &self.saved.profiles[i];
                egui::Grid::new("profile-summary")
                    .num_columns(2)
                    .spacing([16., 4.])
                    .show(ui, |ui| {
                        for (label, count) in [
                            ("Registers", p.parsed(Space::Register).entries.len()),
                            ("Parameters", p.parsed(Space::Parameter).entries.len()),
                            (
                                "System registers",
                                p.parsed(Space::SysRegister).entries.len(),
                            ),
                            ("Commands", p.commands().len()),
                            ("Dashboards", p.dashboards.len()),
                        ] {
                            ui.label(RichText::new(label).color(palette.text_weak));
                            ui.monospace(count.to_string());
                            ui.end_row();
                        }
                    });
                ui.add_space(4.);
                ui.label(
                    RichText::new("Maps, metadata, commands and dashboards belong to the Profile.")
                        .small()
                        .color(palette.text_weak),
                );
                ui.add_space(8.);
                ui.horizontal(|ui| {
                    if ui.button("Duplicate").clicked() {
                        duplicate = Some(i);
                    }
                    if ui.button("Export…").clicked() {
                        self.session.export(
                            serde_json::to_string_pretty(&p.export()).unwrap(),
                            &format!("{}.dshub-profile", p.name),
                            "dshub-profile",
                        );
                    }
                    // Any Profile may be deleted except the last one.
                    if self.saved.profiles.len() > 1 {
                        if controls::confirm_button(ui, &p.id, "Delete") {
                            remove = Some(i);
                        }
                    } else {
                        ui.add_enabled(false, egui::Button::new("Delete"))
                            .on_disabled_hover_text("The last Profile cannot be deleted");
                    }
                });
            });
        });
        if let Some(i) = duplicate {
            let mut p = self.saved.profiles[i].clone();
            p.id = unique_id();
            p.name = unique_name(&format!("{} Copy", p.name), &self.saved.profiles);
            p.is_default = false;
            self.saved.active = p.id.clone();
            self.saved.profiles.push(p);
        }
        if create {
            let mut p = Profile::template();
            p.name = unique_name("New Profile", &self.saved.profiles);
            self.saved.active = p.id.clone();
            self.saved.profiles.push(p);
        }
        if let Some(i) = remove {
            let removed = self.saved.profiles.remove(i);
            self.saved.profile_sessions.remove(&removed.id);
            if !self
                .saved
                .profiles
                .iter()
                .any(|p| p.id == self.saved.active)
            {
                self.saved.active = self.saved.profiles[0].id.clone();
            }
        }
    }
    fn preferences(&mut self, ui: &mut egui::Ui) {
        controls::segmented(
            ui,
            &mut self.settings_tab,
            &[
                (0, "General"),
                (1, "Connection"),
                (2, "Data"),
                (3, "Activity log"),
            ],
        );
        ui.add_space(8.);
        let p = &mut self.saved.preferences;
        let before = p.log_settings.clone();
        let grid = |ui: &mut egui::Ui, id: &str, add: &mut dyn FnMut(&mut egui::Ui)| {
            egui::Grid::new(id)
                .num_columns(2)
                .spacing([16., 8.])
                .min_col_width(150.)
                .show(ui, add);
        };
        match self.settings_tab {
            0 => grid(ui, "prefs-general", &mut |ui| {
                ui.label("Theme");
                controls::segmented(ui, &mut p.dark, &[(true, "Dark"), (false, "Light")]);
                ui.end_row();
            }),
            1 => grid(ui, "prefs-connection", &mut |ui| {
                ui.label("On startup");
                ui.vertical(|ui| {
                    ui.checkbox(&mut p.auto_scan, "Scan the network");
                    ui.checkbox(&mut p.auto_connect, "Connect to the last device");
                });
                ui.end_row();
                ui.label("Connection attempts");
                ui.add(egui::DragValue::new(&mut p.auto_connect_retries).range(1..=10));
                ui.end_row();
                ui.label("Delay between attempts");
                ui.add(
                    egui::DragValue::new(&mut p.auto_connect_retry_delay)
                        .range(500..=10000)
                        .suffix(" ms"),
                );
                ui.end_row();
                ui.label("Request rate limit")
                    .on_hover_text("Maximum device requests per second. 0 removes the limit.");
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
            }),
            2 => grid(ui, "prefs-data", &mut |ui| {
                ui.label("Widget and plot interval");
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
                ui.label("Samples kept per trace");
                ui.add(egui::DragValue::new(&mut p.max_points).range(100..=100000));
                ui.end_row();
            }),
            _ => grid(ui, "prefs-log", &mut |ui| {
                let l = &mut p.log_settings;
                ui.label("Record");
                ui.vertical(|ui| {
                    ui.checkbox(&mut l.enable_connection_logs, "Connection events");
                    ui.checkbox(&mut l.enable_register_logs, "Register events");
                    ui.checkbox(&mut l.enable_parameter_logs, "Parameter events");
                    ui.checkbox(&mut l.enable_auto_refresh_logs, "Polling events");
                    ui.checkbox(&mut l.enable_plotting_logs, "Plot events");
                    ui.checkbox(&mut l.enable_packet_logs, "Packet hex dumps");
                });
                ui.end_row();
                ui.label("Retention");
                ui.add(
                    egui::DragValue::new(&mut l.max_log_count)
                        .range(100..=10000)
                        .suffix(" entries"),
                );
                ui.end_row();
                ui.label("Diagnostics");
                if ui
                    .button("Open log folder")
                    .on_hover_text(
                        "Warnings, errors and crash reports are kept here for support requests",
                    )
                    .clicked()
                {
                    if let Err(e) = crate::diagnostics::open_log_dir() {
                        log::warn!("{e}");
                    }
                }
                ui.end_row();
            }),
        }
        // Every setting applies as soon as it changes.
        if p.log_settings != before {
            self.session
                .send(Action::LogSettings(p.log_settings.clone()));
        }
        ui.add_space(6.);
        ui.label(
            RichText::new("Changes apply immediately.")
                .small()
                .color(theme::of(ui).text_weak),
        );
    }
    fn workspaces(&mut self, ui: &mut egui::Ui) {
        let palette = theme::of(ui);
        ui.label(theme::caption(ui, "Save the current layout"));
        ui.horizontal(|ui| {
            ui.add(
                egui::TextEdit::singleline(&mut self.name)
                    .hint_text("Workspace name")
                    .desired_width(220.),
            );
            if ui
                .add_enabled(!self.name.trim().is_empty(), controls::primary(ui, "Save"))
                .clicked()
            {
                self.saved.workspaces.push(Workspace {
                    id: unique_id(),
                    name: self.name.trim().to_string(),
                    profile_id: self.saved.active.clone(),
                    dock: self.saved.dock.clone(),
                    windows: self.saved.windows.clone(),
                    series_catalog: self.saved.series.clone(),
                });
                self.name.clear();
            }
        });
        ui.add_space(8.);
        ui.label(theme::caption(ui, "Saved for this Profile"));
        let mut remove = None;
        let mut any = false;
        egui::Grid::new("workspaces")
            .num_columns(3)
            .striped(true)
            .spacing([12., 4.])
            .show(ui, |ui| {
                for (i, w) in self
                    .saved
                    .workspaces
                    .iter()
                    .enumerate()
                    .filter(|(_, w)| w.profile_id == self.saved.active)
                {
                    any = true;
                    ui.label(&w.name);
                    if ui.button("Restore").clicked() {
                        self.saved.dock = w.dock.clone();
                        self.saved.windows = w.windows.clone();
                        self.saved.series = w.series_catalog.clone();
                    }
                    if controls::confirm_button(ui, &w.id, "Delete") {
                        remove = Some(i);
                    }
                    ui.end_row();
                }
            });
        if !any {
            ui.label(RichText::new("None yet.").color(palette.text_weak));
        }
        if let Some(i) = remove {
            self.saved.workspaces.remove(i);
        }
    }
    fn dialogs(&mut self, ctx: &egui::Context) {
        if self.review_open {
            let mut open = true;
            let index = self.profile_index();
            egui::Window::new("Binding review")
                .open(&mut open)
                .collapsible(false)
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
                .default_width(640.)
                .resizable(false)
                .collapsible(false)
                .show(ctx, |ui| self.profile_manager(ui));
            self.profiles_open = open;
        }
        if self.settings_open {
            let mut open = true;
            egui::Window::new("Preferences")
                .open(&mut open)
                .default_width(420.)
                .resizable(false)
                .collapsible(false)
                .show(ctx, |ui| self.preferences(ui));
            self.settings_open = open;
        }
        if self.workspaces_open {
            let mut open = true;
            egui::Window::new("Workspaces")
                .open(&mut open)
                .default_width(420.)
                .collapsible(false)
                .show(ctx, |ui| self.workspaces(ui));
            self.workspaces_open = open;
        }
        if self.guide_open {
            egui::Window::new("DSHub")
                .open(&mut self.guide_open)
                .default_width(460.)
                .collapsible(false)
                .show(ctx, guide);
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
fn guide(ui: &mut egui::Ui) {
    let palette = theme::of(ui);
    ui.label(theme::caption(ui, "Getting started"));
    for (step, title, text) in [
        ("1", "Connect", "Open the device menu in the toolbar. Scan the network or enter an address (IP or IP:port), choose TCP or UDP and connect."),
        ("2", "Take Control", "Writes and commands need Control on this connection. The toolbar shows who holds it."),
        ("3", "Inspect", "Registers, Parameters and System Registers list every entry of the Profile's maps. Double-click a value to write it; select a row for the Inspector."),
        ("4", "Monitor", "Plot traces from any entry, or build Dashboards; dashboard edits apply on Save, and Revert discards them. Map edits that move entries ask for binding review before widgets read or write again."),
        ("5", "Arrange", "Drag tabs to split panes. Right-click a tab to move it to its own window or focus it. Save layouts as Workspaces."),
    ] {
        ui.horizontal_top(|ui| {
            ui.label(RichText::new(step).monospace().color(palette.accent));
            ui.vertical(|ui| {
                ui.label(RichText::new(title).family(egui::FontFamily::Name(fonts::SEMIBOLD.into())));
                ui.label(RichText::new(text).color(palette.text_weak));
            });
        });
        ui.add_space(4.);
    }
    ui.label(theme::caption(ui, "Keyboard"));
    egui::Grid::new("guide-keys").num_columns(2).show(ui, |ui| {
        for (keys, action) in [
            (
                "Ctrl+K",
                "Command palette: panes, entries, commands, windows",
            ),
            ("/", "Focus the search field"),
            (
                "Double-click, Enter",
                "Edit a value in a table; Enter writes, Esc discards. Unsent values stay outlined",
            ),
            ("Esc", "Leave Focus mode"),
            (
                "Arrows, Alt+Arrows",
                "Dashboard editing: move the selection by a grid step or a point",
            ),
            ("Delete", "Dashboard editing: remove the selected widgets"),
            (
                "Ctrl+Z, Ctrl+Shift+Z",
                "Dashboard editing: undo and redo layout changes",
            ),
        ] {
            ui.label(RichText::new(keys).monospace().color(palette.accent));
            ui.label(RichText::new(action).color(palette.text_weak));
            ui.end_row();
        }
    });
    ui.separator();
    ui.label(
        RichText::new(format!(
            "DSHub {} · Rust and egui · MIT",
            env!("CARGO_PKG_VERSION")
        ))
        .small()
        .color(palette.text_weak),
    );
    egui::CollapsingHeader::new(theme::caption(ui, "Font licences")).show(ui, |ui| {
        egui::ScrollArea::vertical()
            .max_height(200.)
            .show(ui, |ui| {
                ui.label(RichText::new(fonts::LICENSE).small());
            });
    });
}
/// Temp-data key set by `/`; the first search field drawn takes focus.
pub(crate) const FOCUS_SEARCH: &str = "focus-search";
/// How long a critical command's Confirm button must be held.
const HOLD_SECONDS: f64 = 1.5;
/// The pending device-action confirmation, shown modally in every viewport so it
/// appears wherever the operator is working and blocks other input until answered.
fn confirm_modal(ctx: &egui::Context, session: &mut Session) {
    let Some((message, action)) = session.confirm.clone() else {
        return;
    };
    let response = egui::Modal::new(egui::Id::new("confirm-device-action")).show(ctx, |ui| {
        ui.set_max_width(420.);
        ui.heading(if session.confirm_hold {
            "Confirm critical command"
        } else {
            "Confirm device action"
        });
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
            let confirmed = if session.confirm_hold {
                controls::hold_button(ui, "Hold to confirm", HOLD_SECONDS)
            } else {
                ui.button(RichText::new("Confirm").color(colors::role(ui, Role::Warn)))
                    .clicked()
            };
            if confirmed {
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
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = &ui.ctx().clone();
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
        self.touched |= edited(ctx);
        panes::save_plot_shots(ctx, &self.session);
        if let Some(c) = self
            .session
            .connection
            .as_ref()
            .filter(|_| self.session.connected())
        {
            let address = if c.ip.contains(':') {
                format!("[{}]:{}", c.ip, c.port)
            } else {
                format!("{}:{}", c.ip, c.port)
            };
            self.touched |= self.saved.preferences.remember(RecentDevice {
                address,
                udp: c.interface_type == crate::types::InterfaceType::Udp,
                name: c.device_name.clone(),
            });
        }
        let i = self.profile_index();
        self.session
            .drain(&self.saved.profiles[i], &self.saved.preferences);
        self.session.interests.clear();
        if self.applied_dark != Some(self.saved.preferences.dark) {
            theme::apply(ctx, self.saved.preferences.dark);
            self.applied_dark = Some(self.saved.preferences.dark);
        }
        if let Some(undo) = self.session.undo.take() {
            self.undo(undo);
        }
        while let Some(import) = self.session.take_import(&ImportTarget::Profile) {
            match import.and_then(|text| Profile::import(&text)) {
                Ok(p) => {
                    self.saved.active = p.id.clone();
                    self.saved.profiles.push(p);
                    self.touched = true;
                }
                Err(e) => self.session.notice = e,
            }
        }
        self.chrome(ui);
        self.dialogs(ctx);
        self.keyboard(ctx);
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
        egui::CentralPanel::default().show(ui, |ui| {
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
        let mut touched = false;
        // Window titles name the device and Profile, so several windows
        // stay identifiable in the task switcher.
        let context = match &self.session.connection {
            Some(c) => format!(
                "{} · {}",
                c.device_name.clone().unwrap_or_else(|| c.ip.clone()),
                profile.name
            ),
            None => profile.name.clone(),
        };
        let main_title = format!("DSHub — {context}");
        if ctx.input(|i| i.viewport().title.as_deref() != Some(main_title.as_str())) {
            ctx.send_viewport_cmd(egui::ViewportCommand::Title(main_title));
        }
        let root = ctx.input(|i| i.viewport().outer_rect);
        let root_monitor = ctx.input(|i| i.viewport().monitor_size.is_some());
        for (wi, window) in self.saved.windows.iter_mut().enumerate() {
            let id = egui::ViewportId::from_hash_of(&window.id);
            let title = format!("DSHub · {} — {context}", window.title);
            let mut builder = egui::ViewportBuilder::default()
                .with_title(title.clone())
                .with_inner_size(window.size);
            if let Some(position) = window.position {
                builder = builder.with_position(position);
            }
            ctx.show_viewport_immediate(id, builder, |viewport_ui, _class| {
                let ctx = &viewport_ui.ctx().clone();
                if ctx.input(|i| i.viewport().title.as_deref() != Some(title.as_str())) {
                    ctx.send_viewport_cmd(egui::ViewportCommand::Title(title.clone()));
                }
                // A window restored onto a monitor that is gone reports no
                // current monitor; bring it next to the main window. Checked
                // once per window, and only where the platform reports
                // monitors at all (the main window has one).
                let checked = egui::Id::new(("monitor-checked", &window.id));
                let placed = ctx.input(|i| i.viewport().outer_rect.is_some());
                if placed && !ctx.data(|d| d.get_temp::<bool>(checked).unwrap_or(false)) {
                    ctx.data_mut(|d| d.insert_temp(checked, true));
                    let lost = ctx.input(|i| i.viewport().monitor_size.is_none());
                    if let Some(root) = root.filter(|_| lost && root_monitor) {
                        let position = root.min + egui::vec2(40., 40.);
                        ctx.send_viewport_cmd(egui::ViewportCommand::OuterPosition(position));
                        window.position = Some([position.x, position.y]);
                    }
                }
                panes::save_plot_shots(ctx, &self.session);
                let geometry = (window.size, window.position);
                ctx.input(|i| {
                    if let Some(rect) = i.viewport().inner_rect {
                        window.size = [rect.width(), rect.height()];
                    }
                    if let Some(rect) = i.viewport().outer_rect {
                        window.position = Some([rect.min.x, rect.min.y]);
                    }
                });
                touched |= edited(ctx) || geometry != (window.size, window.position);
                if ctx.input(|i| i.viewport().close_requested()) {
                    closed.push(wi);
                }
                egui::CentralPanel::default().show(viewport_ui, |ui| {
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
        self.touched |= touched || !closed.is_empty();
        // `/` with no search field in view does nothing.
        ctx.data_mut(|d| d.remove_temp::<bool>(egui::Id::new(FOCUS_SEARCH)));
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
                            self.saved.dock.set_active_tab(index).ok();
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
        // A daughter whose last pane was closed or moved away closes itself.
        let before = self.saved.windows.len();
        self.saved
            .windows
            .retain(|w| w.dock.iter_all_tabs().next().is_some());
        self.touched |= self.saved.windows.len() != before;
        self.session.sync();
        // After sync, so notices raised anywhere this frame show immediately.
        toasts::show(ctx, &mut self.session);
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
        if !(self.persist && self.touched) {
            return;
        }
        self.saved.profile_order = self.saved.profiles.iter().map(|p| p.id.clone()).collect();
        // Profiles go to their own files; if that fails they stay inline so
        // nothing is lost.
        let in_files = match &mut self.profile_files {
            Some(store) => match store.save(&self.saved.profiles) {
                Ok(()) => true,
                Err(e) => {
                    log::error!("Could not save Profile files: {e}");
                    false
                }
            },
            None => false,
        };
        let profiles = if in_files {
            std::mem::take(&mut self.saved.profiles)
        } else {
            vec![]
        };
        eframe::set_value(storage, STORAGE_KEY, &self.saved);
        if in_files {
            self.saved.profiles = profiles;
        }
        self.touched = false;
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
            let idle = ui.memory(|m| m.focused().is_none()) && !ui.ctx().any_popup_open();
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
        .style(theme::dock_style(ui))
        // Tab context menus carry move/focus/duplicate; the per-leaf collapse
        // and close-all buttons only added clutter beside every tab bar.
        .show_leaf_collapse_buttons(false)
        .show_leaf_close_all_buttons(false)
        .show_inside(ui, viewer);
}

#[cfg(test)]
mod tests;
