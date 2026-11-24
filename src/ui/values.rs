//! Saving register or parameter values to a file and restoring them by name.
//!
//! Addresses move between firmware builds, so a restore matches entries by
//! name and then checks the address and type: a changed one is a warning the
//! user must accept before anything is written. Values to save are read fresh
//! from the device first, and every write keeps its own outcome.
use super::{
    colors,
    session::{ImportTarget, OutcomeStatus, Session},
    theme, Pane,
};
use crate::model::{format_float, DataType, Entry, Profile, Role, Space};
use eframe::egui::{self, RichText};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// The file extension of saved values.
pub const EXTENSION: &str = "dshub-values";
const VERSION: u32 = 1;

/// A file of saved values for one space.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ValuesFile {
    /// Format version.
    pub dshub_values: u32,
    pub profile: String,
    pub space: Space,
    /// When the values were read, as local date and time text.
    pub saved: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub board_type: Option<u8>,
    pub entries: Vec<SavedValue>,
}
/// One saved entry: where it was, its type, the raw value and the value as
/// text in that type, so the file reads without DSHub.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SavedValue {
    pub name: String,
    pub address: u16,
    #[serde(rename = "type")]
    pub data_type: DataType,
    pub raw: i32,
    pub value: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub unit: String,
}
impl ValuesFile {
    pub fn parse(text: &str, space: Space) -> Result<Self, String> {
        let file: Self =
            serde_json::from_str(text).map_err(|e| format!("Not a DSHub values file: {e}"))?;
        if file.dshub_values > VERSION {
            return Err(format!(
                "Values file version {} is newer than this DSHub reads",
                file.dshub_values
            ));
        }
        if file.space != space {
            return Err(format!(
                "This file holds {}, not {}",
                file.space.title(),
                space.title()
            ));
        }
        Ok(file)
    }
}

/// What restoring one saved value would do.
#[derive(Debug, Clone, PartialEq)]
pub enum Status {
    /// Same name and address.
    Match,
    /// Same name; the address and/or type differ from the file.
    Changed {
        address: Option<(u16, u16)>,
        data_type: Option<(DataType, DataType)>,
    },
    /// The device already holds the value.
    Equal,
    /// No entry of this name in the current map.
    Missing,
    /// The entry exists but cannot be written.
    ReadOnly,
    /// The value cannot be expressed in the entry's new type.
    Unconvertible(String),
}
impl Status {
    /// Whether the row can be ticked at all.
    pub fn restorable(&self) -> bool {
        matches!(self, Self::Match | Self::Changed { .. } | Self::Equal)
    }
    pub fn warns(&self) -> bool {
        matches!(self, Self::Changed { .. })
    }
    fn text(&self) -> String {
        match self {
            Self::Match => "Match".into(),
            Self::Equal => "Already equal".into(),
            Self::Missing => "Not in this map".into(),
            Self::ReadOnly => "Read-only".into(),
            Self::Unconvertible(why) => why.clone(),
            Self::Changed { address, data_type } => {
                let mut parts = vec![];
                if let Some((from, to)) = address {
                    parts.push(format!("address {from} → {to}"));
                }
                if let Some((from, to)) = data_type {
                    parts.push(format!("type {from} → {to}"));
                }
                format!("Changed: {}", parts.join(", "))
            }
        }
    }
}
/// A saved value matched against the current map.
#[derive(Debug, Clone, PartialEq)]
pub struct Row {
    pub saved: SavedValue,
    pub entry: Option<Entry>,
    /// The raw value to write to `entry`.
    pub raw: Option<i32>,
    pub status: Status,
    pub selected: bool,
    /// The device's value read just before the preview.
    pub current: Option<i32>,
    /// Set once sent: whether `Session::write_raw` took it, or why not.
    pub sent: Option<Result<(), String>>,
}

/// Uint32 and hex hold the same bits; only the way they are shown differs.
fn same_type(a: DataType, b: DataType) -> bool {
    let unsigned = |t| matches!(t, DataType::Uint32 | DataType::Hex);
    a == b || (unsigned(a) && unsigned(b))
}
/// `saved`'s value as `entry`'s raw value: the same bits for the same type,
/// otherwise converted through its value, so a float is never reread as an
/// integer's bits.
pub fn convert(saved: &SavedValue, entry: &Entry) -> Result<i32, String> {
    if same_type(saved.data_type, entry.data_type) {
        return Ok(saved.raw);
    }
    let old = Entry {
        address: saved.address,
        name: saved.name.clone(),
        data_type: saved.data_type,
        writable: true,
        array_size: None,
    };
    let value = old.decode(saved.raw);
    let text = if entry.data_type == DataType::Float {
        value.to_string()
    } else if value.fract() == 0. {
        format!("{value:.0}")
    } else {
        return Err(format!(
            "{} does not fit {}",
            format_float(value as f32),
            entry.data_type
        ));
    };
    entry
        .encode(&text)
        .map_err(|e| format!("{text} does not fit {}: {e}", entry.data_type))
}
/// Matches every saved value to the current map by name. Exact matches start
/// ticked; changed addresses or types start unticked, for the user to accept.
pub fn plan(file: &ValuesFile, entries: &[Entry]) -> Vec<Row> {
    file.entries
        .iter()
        .map(|saved| {
            let entry = entries.iter().find(|e| e.name == saved.name).cloned();
            let (status, raw) = match &entry {
                None => (Status::Missing, None),
                Some(e) if !e.writable => (Status::ReadOnly, None),
                Some(e) => match convert(saved, e) {
                    Err(why) => (Status::Unconvertible(why), None),
                    Ok(raw) => {
                        let address =
                            (e.address != saved.address).then_some((saved.address, e.address));
                        let data_type = (!same_type(saved.data_type, e.data_type))
                            .then_some((saved.data_type, e.data_type));
                        let status = if address.is_none() && data_type.is_none() {
                            Status::Match
                        } else {
                            Status::Changed { address, data_type }
                        };
                        (status, Some(raw))
                    }
                },
            };
            Row {
                selected: status == Status::Match,
                saved: saved.clone(),
                entry,
                raw,
                status,
                current: None,
                sent: None,
            }
        })
        .collect()
}
/// Marks rows whose device value already equals the saved one; they start
/// unticked, so a restore sends only what changes.
pub fn mark_equal(rows: &mut [Row], current: impl Fn(u16) -> Option<i32>) {
    for row in rows {
        let Some(entry) = &row.entry else { continue };
        row.current = current(entry.address);
        if row.status.restorable() && row.current.is_some() && row.current == row.raw {
            row.status = Status::Equal;
            row.selected = false;
        }
    }
}

/// Fresh readings of a set of addresses, requested at `started` (ms).
#[derive(Debug, Clone)]
pub struct FreshRead {
    pub addresses: Vec<u16>,
    pub started: f64,
    pub deadline: f64,
}
impl FreshRead {
    /// Requests a read of every entry.
    fn start(session: &mut Session, space: Space, entries: &[Entry]) -> Self {
        let started = crate::communicator::now_ms();
        for e in entries {
            session.read(space, e);
        }
        Self {
            addresses: entries.iter().map(|e| e.address).collect(),
            started,
            deadline: started + 3000. + 20. * entries.len() as f64,
        }
    }
    /// A reading of `address` taken after the request: its value, or None
    /// if the device refused it.
    fn answer(&self, session: &Session, space: Space, address: u16) -> Option<Option<i32>> {
        session
            .readings
            .get(&(space, address))
            .filter(|r| r.timestamp >= self.started)
            .map(|r| r.valid.then_some(r.value))
    }
    /// Answered so far, and whether reading is over (all answered or late).
    fn progress(&self, session: &Session, space: Space) -> (usize, bool) {
        let answered = self
            .addresses
            .iter()
            .filter(|a| self.answer(session, space, **a).is_some())
            .count();
        let over =
            answered == self.addresses.len() || crate::communicator::now_ms() > self.deadline;
        (answered, over)
    }
}

/// The save or restore dialog of a Registers or Parameters pane.
#[derive(Debug, Clone)]
pub enum Dialog {
    Select {
        selected: BTreeSet<String>,
        filter: String,
    },
    Reading {
        entries: Vec<Entry>,
        read: FreshRead,
    },
    /// Some entries gave no value; save the rest or cancel.
    Incomplete {
        file: ValuesFile,
        failed: Vec<String>,
    },
    /// Reading the device's current values before the preview.
    Comparing {
        file: ValuesFile,
        rows: Vec<Row>,
        read: FreshRead,
    },
    Preview {
        file: ValuesFile,
        rows: Vec<Row>,
        filter: String,
    },
    /// Ticked rows with a changed address or type, listed before sending.
    Warning { file: ValuesFile, rows: Vec<Row> },
    Restoring {
        file: ValuesFile,
        rows: Vec<Row>,
        started: f64,
    },
}

/// The Save values… and Restore values… buttons of a data pane.
pub fn buttons(
    ui: &mut egui::Ui,
    session: &mut Session,
    profile: &Profile,
    p: &mut Pane,
    space: Space,
) {
    let connected = session.connected();
    if ui
        .add_enabled(connected, egui::Button::new("Restore values…"))
        .on_hover_text(format!(
            "Write {} saved in a file back to the device, matched by name",
            space.title().to_lowercase()
        ))
        .on_disabled_hover_text("Connect to a device first")
        .clicked()
    {
        session.pick_file(
            ImportTarget::Values {
                pane: p.id.clone(),
                space,
            },
            "DSHub values",
            &[EXTENSION, "json"],
        );
    }
    if ui
        .add_enabled(connected, egui::Button::new("Save values…"))
        .on_hover_text(format!(
            "Read chosen {} from the device and save them to a file",
            space.title().to_lowercase()
        ))
        .on_disabled_hover_text("Connect to a device first")
        .clicked()
    {
        let selected = profile
            .entries(space)
            .into_iter()
            .filter(|e| e.writable)
            .map(|e| e.name)
            .collect();
        p.values = Some(Dialog::Select {
            selected,
            filter: String::new(),
        });
    }
    let target = ImportTarget::Values {
        pane: p.id.clone(),
        space,
    };
    if let Some(import) = session.take_import(&target) {
        match import.and_then(|text| ValuesFile::parse(&text, space)) {
            Ok(file) => {
                let entries = profile.entries(space);
                let rows = plan(&file, &entries);
                let matched: Vec<Entry> = rows.iter().filter_map(|r| r.entry.clone()).collect();
                let read = FreshRead::start(session, space, &matched);
                p.values = Some(Dialog::Comparing { file, rows, read });
            }
            Err(e) => session.notice = e,
        }
    }
}

/// Draws the pane's open dialog, if any, and moves it along.
pub fn dialog(
    ctx: &egui::Context,
    session: &mut Session,
    profile: &Profile,
    p: &mut Pane,
    space: Space,
) {
    let Some(mut state) = p.values.take() else {
        return;
    };
    let mut close = false;
    let title = match &state {
        Dialog::Select { .. } | Dialog::Reading { .. } | Dialog::Incomplete { .. } => {
            format!("Save {}", space.title().to_lowercase())
        }
        _ => format!("Restore {}", space.title().to_lowercase()),
    };
    let response = egui::Modal::new(egui::Id::new((&p.id, "values"))).show(ctx, |ui| {
        ui.set_width(720.);
        ui.heading(title);
        ui.add_space(4.);
        let next = match &mut state {
            Dialog::Select { selected, filter } => {
                select(ui, session, profile, space, selected, filter, &mut close)
            }
            Dialog::Reading { entries, read } => {
                reading(ui, session, profile, space, entries, read, &mut close)
            }
            Dialog::Incomplete { file, failed } => {
                incomplete(ui, session, file, failed, &mut close)
            }
            Dialog::Comparing { file, rows, read } => {
                comparing(ui, session, space, file, rows, read, &mut close)
            }
            Dialog::Preview { file, rows, filter } => {
                preview(ui, session, profile, file, rows, filter, &mut close)
            }
            Dialog::Warning { file, rows } => warning(ui, session, profile, file, rows, &mut close),
            Dialog::Restoring { rows, started, .. } => {
                restoring(ui, session, space, rows, *started, &mut close)
            }
        };
        if let Some(next) = next {
            state = next;
        }
    });
    if response.should_close() {
        close = true;
    }
    if !close {
        p.values = Some(state);
    }
    // Reads and writes settle without input; keep the dialog current.
    ctx.request_repaint_after(std::time::Duration::from_millis(100));
}

fn weak(ui: &egui::Ui) -> egui::Color32 {
    theme::of(ui).text_weak
}

fn select(
    ui: &mut egui::Ui,
    session: &mut Session,
    profile: &Profile,
    space: Space,
    selected: &mut BTreeSet<String>,
    filter: &mut String,
    close: &mut bool,
) -> Option<Dialog> {
    let entries = profile.entries(space);
    let needle = filter.to_lowercase();
    let shown: Vec<&Entry> = entries
        .iter()
        .filter(|e| needle.is_empty() || e.name.to_lowercase().contains(&needle))
        .collect();
    ui.label(
        RichText::new("Tick the entries to save. They are read from the device first. Read-only entries are saved as a record; restoring skips them.")
            .color(weak(ui)),
    );
    ui.horizontal(|ui| {
        ui.add(
            egui::TextEdit::singleline(filter)
                .hint_text("Filter by name")
                .desired_width(200.),
        );
        if ui.button("Tick shown").clicked() {
            selected.extend(shown.iter().map(|e| e.name.clone()));
        }
        if ui.button("Untick shown").clicked() {
            for e in &shown {
                selected.remove(&e.name);
            }
        }
        if ui.button("Writable only").clicked() {
            *selected = entries
                .iter()
                .filter(|e| e.writable)
                .map(|e| e.name.clone())
                .collect();
        }
    });
    ui.add_space(4.);
    egui::ScrollArea::vertical()
        .max_height(360.)
        .show(ui, |ui| {
            egui::Grid::new("save-values")
                .num_columns(4)
                .striped(true)
                .show(ui, |ui| {
                    for e in shown {
                        let mut on = selected.contains(&e.name);
                        if ui
                            .checkbox(&mut on, RichText::new(&e.name).monospace())
                            .changed()
                        {
                            if on {
                                selected.insert(e.name.clone());
                            } else {
                                selected.remove(&e.name);
                            }
                        }
                        ui.label(
                            RichText::new(e.address.to_string())
                                .monospace()
                                .color(weak(ui)),
                        );
                        ui.label(RichText::new(e.data_type.as_str()).color(weak(ui)));
                        ui.label(
                            RichText::new(if e.writable {
                                "read/write"
                            } else {
                                "read-only"
                            })
                            .color(weak(ui)),
                        );
                        ui.end_row();
                    }
                });
        });
    ui.add_space(8.);
    let mut next = None;
    ui.horizontal(|ui| {
        if ui.button("Cancel").clicked() {
            *close = true;
        }
        let chosen: Vec<Entry> = entries
            .iter()
            .filter(|e| selected.contains(&e.name))
            .cloned()
            .collect();
        if ui
            .add_enabled(
                !chosen.is_empty() && session.connected(),
                egui::Button::new(format!("Read and save {}", chosen.len())),
            )
            .clicked()
        {
            let read = FreshRead::start(session, space, &chosen);
            next = Some(Dialog::Reading {
                entries: chosen,
                read,
            });
        }
    });
    next
}

fn reading(
    ui: &mut egui::Ui,
    session: &mut Session,
    profile: &Profile,
    space: Space,
    entries: &[Entry],
    read: &FreshRead,
    close: &mut bool,
) -> Option<Dialog> {
    let (answered, over) = read.progress(session, space);
    ui.label(format!(
        "Reading {answered} of {} from the device…",
        entries.len()
    ));
    ui.add(egui::ProgressBar::new(
        answered as f32 / entries.len().max(1) as f32,
    ));
    if ui.button("Cancel").clicked() {
        *close = true;
    }
    if !over {
        return None;
    }
    let mut failed = vec![];
    let values = entries
        .iter()
        .filter_map(|e| match read.answer(session, space, e.address).flatten() {
            Some(raw) => Some(SavedValue {
                name: e.name.clone(),
                address: e.address,
                data_type: e.data_type,
                raw,
                value: e.format(raw),
                unit: profile
                    .metadata(space, &e.name)
                    .map(|m| m.unit.clone())
                    .unwrap_or_default(),
            }),
            None => {
                failed.push(e.name.clone());
                None
            }
        })
        .collect();
    let file = ValuesFile {
        dshub_values: VERSION,
        profile: profile.name.clone(),
        space,
        saved: super::clock::full(crate::communicator::now_ms()),
        board_type: session.board_type(),
        entries: values,
    };
    if failed.is_empty() {
        write_file(session, &file);
        *close = true;
        None
    } else {
        Some(Dialog::Incomplete { file, failed })
    }
}

fn write_file(session: &mut Session, file: &ValuesFile) {
    let name = format!(
        "{} {}.{EXTENSION}",
        file.profile,
        file.space.title().to_lowercase()
    );
    match serde_json::to_string_pretty(file) {
        Ok(text) => session.export(text, &name, EXTENSION),
        Err(e) => session.notice = e.to_string(),
    }
}

fn incomplete(
    ui: &mut egui::Ui,
    session: &mut Session,
    file: &ValuesFile,
    failed: &[String],
    close: &mut bool,
) -> Option<Dialog> {
    ui.label(format!(
        "{} entries gave no value (refused, or no answer in time):",
        failed.len()
    ));
    egui::ScrollArea::vertical()
        .max_height(160.)
        .show(ui, |ui| {
            for name in failed {
                ui.label(
                    RichText::new(name)
                        .monospace()
                        .color(colors::role(ui, Role::Warn)),
                );
            }
        });
    ui.add_space(8.);
    ui.horizontal(|ui| {
        if ui.button("Cancel").clicked() {
            *close = true;
        }
        if ui
            .add_enabled(
                !file.entries.is_empty(),
                egui::Button::new(format!("Save the other {}", file.entries.len())),
            )
            .clicked()
        {
            write_file(session, file);
            *close = true;
        }
    });
    None
}

fn comparing(
    ui: &mut egui::Ui,
    session: &mut Session,
    space: Space,
    file: &ValuesFile,
    rows: &mut [Row],
    read: &FreshRead,
    close: &mut bool,
) -> Option<Dialog> {
    let (answered, over) = read.progress(session, space);
    ui.label(format!(
        "Reading the device's current values: {answered} of {}…",
        read.addresses.len()
    ));
    ui.add(egui::ProgressBar::new(
        answered as f32 / read.addresses.len().max(1) as f32,
    ));
    if ui.button("Cancel").clicked() {
        *close = true;
    }
    if !over {
        return None;
    }
    let mut rows = rows.to_vec();
    mark_equal(&mut rows, |address| {
        read.answer(session, space, address).flatten()
    });
    Some(Dialog::Preview {
        file: file.clone(),
        rows,
        filter: String::new(),
    })
}

fn status_colour(ui: &egui::Ui, status: &Status) -> egui::Color32 {
    match status {
        Status::Match => colors::role(ui, Role::Ok),
        Status::Changed { .. } => colors::role(ui, Role::Warn),
        Status::Unconvertible(_) => colors::role(ui, Role::Error),
        _ => weak(ui),
    }
}

fn preview(
    ui: &mut egui::Ui,
    session: &mut Session,
    profile: &Profile,
    file: &ValuesFile,
    rows: &mut [Row],
    filter: &mut String,
    close: &mut bool,
) -> Option<Dialog> {
    ui.label(
        RichText::new(format!(
            "From {} · Profile {} · saved {} · {} values",
            file.space.title(),
            file.profile,
            file.saved,
            file.entries.len()
        ))
        .color(weak(ui)),
    );
    if let (Some(saved), Some(now)) = (file.board_type, session.board_type()) {
        if saved != now {
            ui.colored_label(
                colors::role(ui, Role::Warn),
                format!("Saved from board type {saved}; the connected device reports {now}."),
            );
        }
    }
    ui.horizontal(|ui| {
        ui.add(
            egui::TextEdit::singleline(filter)
                .hint_text("Filter by name")
                .desired_width(200.),
        );
        let needle = filter.to_lowercase();
        let shown = |r: &Row| needle.is_empty() || r.saved.name.to_lowercase().contains(&needle);
        if ui.button("Tick shown").clicked() {
            rows.iter_mut()
                .filter(|r| shown(r) && r.status.restorable())
                .for_each(|r| r.selected = true);
        }
        if ui.button("Untick shown").clicked() {
            rows.iter_mut()
                .filter(|r| shown(r))
                .for_each(|r| r.selected = false);
        }
    });
    ui.add_space(4.);
    let needle = filter.to_lowercase();
    egui::ScrollArea::vertical()
        .max_height(380.)
        .show(ui, |ui| {
            egui::Grid::new("restore-values")
                .num_columns(5)
                .striped(true)
                .show(ui, |ui| {
                    for h in ["Name", "Address", "Saved value", "Device now", "Status"] {
                        ui.label(RichText::new(h).small().color(weak(ui)));
                    }
                    ui.end_row();
                    for r in rows.iter_mut().filter(|r| {
                        needle.is_empty() || r.saved.name.to_lowercase().contains(&needle)
                    }) {
                        let restorable = r.status.restorable();
                        ui.add_enabled(
                            restorable,
                            egui::Checkbox::new(
                                &mut r.selected,
                                RichText::new(&r.saved.name).monospace(),
                            ),
                        );
                        let address = match &r.entry {
                            Some(e) if e.address != r.saved.address => {
                                format!("{} → {}", r.saved.address, e.address)
                            }
                            _ => r.saved.address.to_string(),
                        };
                        ui.label(RichText::new(address).monospace());
                        let unit = if r.saved.unit.is_empty() {
                            String::new()
                        } else {
                            format!(" {}", r.saved.unit)
                        };
                        ui.label(RichText::new(format!("{}{unit}", r.saved.value)).monospace());
                        let now = match (&r.entry, r.current) {
                            (Some(e), Some(raw)) => e.format(raw),
                            _ => "—".into(),
                        };
                        ui.label(RichText::new(now).monospace().color(weak(ui)));
                        ui.label(
                            RichText::new(r.status.text()).color(status_colour(ui, &r.status)),
                        );
                        ui.end_row();
                    }
                });
        });
    let chosen = rows.iter().filter(|r| r.selected).count();
    let warned = rows
        .iter()
        .filter(|r| r.selected && r.status.warns())
        .count();
    ui.add_space(8.);
    let mut next = None;
    ui.horizontal(|ui| {
        if ui.button("Cancel").clicked() {
            *close = true;
        }
        let label = if warned > 0 {
            format!("Restore {chosen} ({warned} changed)")
        } else {
            format!("Restore {chosen}")
        };
        let ready = chosen > 0 && session.controlled();
        if ui
            .add_enabled(
                ready,
                egui::Button::new(RichText::new(label).color(colors::role(ui, Role::Warn))),
            )
            .on_disabled_hover_text(if session.controlled() {
                "Tick at least one value"
            } else {
                "Take Control to write"
            })
            .clicked()
        {
            next = Some(if warned > 0 {
                Dialog::Warning {
                    file: file.clone(),
                    rows: rows.to_vec(),
                }
            } else {
                start_restore(session, profile, file, rows)
            });
        }
    });
    next
}

fn warning(
    ui: &mut egui::Ui,
    session: &mut Session,
    profile: &Profile,
    file: &ValuesFile,
    rows: &mut [Row],
    close: &mut bool,
) -> Option<Dialog> {
    let warned: Vec<&Row> = rows
        .iter()
        .filter(|r| r.selected && r.status.warns())
        .collect();
    ui.colored_label(
        colors::role(ui, Role::Warn),
        format!(
            "{} of the values to restore changed address or type since they were saved. They are written to the entry of the same name:",
            warned.len()
        ),
    );
    egui::ScrollArea::vertical()
        .max_height(220.)
        .show(ui, |ui| {
            for r in &warned {
                ui.label(
                    RichText::new(format!("{}  ·  {}", r.saved.name, r.status.text())).monospace(),
                );
            }
        });
    ui.add_space(8.);
    let mut next = None;
    ui.horizontal(|ui| {
        if ui.button("Back").clicked() {
            next = Some(Dialog::Preview {
                file: file.clone(),
                rows: rows.to_vec(),
                filter: String::new(),
            });
        }
        if ui.button("Cancel").clicked() {
            *close = true;
        }
        if ui
            .button(RichText::new("Restore anyway").color(colors::role(ui, Role::Warn)))
            .clicked()
        {
            next = Some(start_restore(session, profile, file, rows));
        }
    });
    next
}

/// Sends every ticked row, in file order.
fn start_restore(
    session: &mut Session,
    profile: &Profile,
    file: &ValuesFile,
    rows: &[Row],
) -> Dialog {
    let started = crate::communicator::now_ms();
    let mut rows = rows.to_vec();
    for r in rows.iter_mut().filter(|r| r.selected) {
        let (Some(entry), Some(raw)) = (&r.entry, r.raw) else {
            continue;
        };
        session.notice.clear();
        // The map's limits apply, as to every write.
        let meta = profile.metadata(file.space, &entry.name);
        let taken = session.write_raw(file.space, entry, raw, &r.saved.value, meta, false);
        r.sent = Some(if taken {
            Ok(())
        } else {
            Err(if session.notice.is_empty() {
                "Not sent".into()
            } else {
                session.notice.clone()
            })
        });
    }
    Dialog::Restoring {
        file: file.clone(),
        rows,
        started,
    }
}

/// What became of a sent row: settled or not, and the text to show.
fn outcome(session: &Session, space: Space, r: &Row, started: f64) -> (bool, Role, String) {
    match (&r.sent, &r.entry) {
        (Some(Err(why)), _) => (true, Role::Error, why.clone()),
        (Some(Ok(())), Some(e)) => {
            let key = (space, e.address);
            match session.writes.get(&key).filter(|o| o.sent_at >= started) {
                None => (false, Role::Info, "Sending…".into()),
                Some(o) => match o.status {
                    OutcomeStatus::Sending => (false, Role::Info, "Sending…".into()),
                    OutcomeStatus::Refused => (true, Role::Error, "Refused".into()),
                    OutcomeStatus::Unknown => (true, Role::Warn, "No acknowledgement".into()),
                    OutcomeStatus::Confirmed => {
                        let back = session.readings.get(&key).filter(|rd| {
                            rd.valid && o.acked_at.is_some_and(|at| rd.timestamp >= at)
                        });
                        match back {
                            None => (true, Role::Ok, "Confirmed".into()),
                            Some(rd) if Some(rd.value) == r.raw => {
                                (true, Role::Ok, "Confirmed".into())
                            }
                            Some(rd) => (
                                true,
                                Role::Error,
                                format!("Device reads {}", e.format(rd.value)),
                            ),
                        }
                    }
                },
            }
        }
        _ => (true, Role::Idle, String::new()),
    }
}

fn restoring(
    ui: &mut egui::Ui,
    session: &mut Session,
    space: Space,
    rows: &mut [Row],
    started: f64,
    close: &mut bool,
) -> Option<Dialog> {
    let sent: Vec<&Row> = rows.iter().filter(|r| r.sent.is_some()).collect();
    let results: Vec<(bool, Role, String)> = sent
        .iter()
        .map(|r| outcome(session, space, r, started))
        .collect();
    let done = results.iter().filter(|(settled, ..)| *settled).count();
    let count = |role| results.iter().filter(|(s, r, _)| *s && *r == role).count();
    ui.label(format!(
        "{done} of {} settled · {} confirmed · {} refused or not sent · {} without acknowledgement",
        sent.len(),
        count(Role::Ok),
        count(Role::Error),
        count(Role::Warn)
    ));
    egui::ScrollArea::vertical()
        .max_height(380.)
        .show(ui, |ui| {
            egui::Grid::new("restore-progress")
                .num_columns(3)
                .striped(true)
                .show(ui, |ui| {
                    for (r, (_, role, text)) in sent.iter().zip(&results) {
                        ui.label(RichText::new(&r.saved.name).monospace());
                        ui.label(RichText::new(&r.saved.value).monospace());
                        ui.label(RichText::new(text).color(colors::role(ui, *role)));
                        ui.end_row();
                    }
                });
        });
    ui.add_space(8.);
    if ui
        .button(if done == sent.len() {
            "Close"
        } else {
            "Close (writes continue)"
        })
        .clicked()
    {
        *close = true;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    fn entry(name: &str, address: u16, data_type: DataType, writable: bool) -> Entry {
        Entry {
            address,
            name: name.into(),
            data_type,
            writable,
            array_size: None,
        }
    }
    fn saved(name: &str, address: u16, data_type: DataType, raw: i32) -> SavedValue {
        let e = entry(name, address, data_type, true);
        SavedValue {
            name: name.into(),
            address,
            data_type,
            raw,
            value: e.format(raw),
            unit: String::new(),
        }
    }
    fn file(entries: Vec<SavedValue>) -> ValuesFile {
        ValuesFile {
            dshub_values: VERSION,
            profile: "SCE2-CC".into(),
            space: Space::Parameter,
            saved: "today".into(),
            board_type: None,
            entries,
        }
    }

    #[test]
    fn values_are_matched_by_name_and_changes_need_accepting() {
        let kp = 1.5_f32.to_bits() as i32;
        let f = file(vec![
            saved("KP", 4, DataType::Float, kp),
            saved("KI", 5, DataType::Float, kp),
            saved("MODE", 6, DataType::Uint32, 3),
            saved("GONE", 7, DataType::Int32, 1),
            saved("STATE", 8, DataType::Uint32, 2),
            saved("MASK", 9, DataType::Hex, 0xFF),
        ]);
        let map = vec![
            entry("KP", 4, DataType::Float, true),
            // Moved by a later build.
            entry("KI", 12, DataType::Float, true),
            // Retyped: 3 still fits a float.
            entry("MODE", 6, DataType::Float, true),
            entry("STATE", 8, DataType::Uint32, false),
            // Hex and uint32 hold the same bits.
            entry("MASK", 9, DataType::Uint32, true),
        ];
        let rows = plan(&f, &map);
        let by = |name: &str| rows.iter().find(|r| r.saved.name == name).unwrap();
        assert_eq!(by("KP").status, Status::Match);
        assert!(by("KP").selected);
        assert_eq!(
            by("KI").status,
            Status::Changed {
                address: Some((5, 12)),
                data_type: None
            }
        );
        assert!(!by("KI").selected, "a changed address waits to be accepted");
        assert_eq!(by("KI").raw, Some(kp));
        assert_eq!(
            by("MODE").status,
            Status::Changed {
                address: None,
                data_type: Some((DataType::Uint32, DataType::Float))
            }
        );
        assert_eq!(
            by("MODE").raw,
            Some(3.0_f32.to_bits() as i32),
            "converted by value"
        );
        assert_eq!(by("GONE").status, Status::Missing);
        assert_eq!(by("STATE").status, Status::ReadOnly);
        assert!(!by("STATE").status.restorable());
        assert_eq!(by("MASK").status, Status::Match);
    }

    #[test]
    fn values_that_do_not_fit_a_new_type_are_not_restored() {
        let f = file(vec![saved(
            "GAIN",
            1,
            DataType::Float,
            2.5_f32.to_bits() as i32,
        )]);
        let rows = plan(&f, &[entry("GAIN", 1, DataType::Int32, true)]);
        assert!(matches!(rows[0].status, Status::Unconvertible(_)));
        assert!(!rows[0].selected && rows[0].raw.is_none());
        let f = file(vec![saved("N", 1, DataType::Int32, -1)]);
        let rows = plan(&f, &[entry("N", 1, DataType::Uint32, true)]);
        assert!(
            matches!(rows[0].status, Status::Unconvertible(_)),
            "negative into unsigned"
        );
    }

    #[test]
    fn values_the_device_already_holds_start_unticked() {
        let f = file(vec![
            saved("A", 1, DataType::Int32, 10),
            saved("B", 2, DataType::Int32, 20),
        ]);
        let mut rows = plan(
            &f,
            &[
                entry("A", 1, DataType::Int32, true),
                entry("B", 2, DataType::Int32, true),
            ],
        );
        mark_equal(&mut rows, |address| {
            Some(if address == 1 { 10 } else { 21 })
        });
        assert_eq!(rows[0].status, Status::Equal);
        assert!(!rows[0].selected && rows[0].status.restorable());
        assert_eq!(rows[1].status, Status::Match);
        assert!(rows[1].selected);
        assert_eq!(rows[1].current, Some(21));
    }

    #[test]
    fn values_files_round_trip_and_belong_to_one_space() {
        let f = file(vec![saved(
            "KP",
            4,
            DataType::Float,
            1.5_f32.to_bits() as i32,
        )]);
        let text = serde_json::to_string_pretty(&f).unwrap();
        assert!(
            text.contains("\"value\": \"1.5\""),
            "readable without DSHub: {text}"
        );
        assert_eq!(ValuesFile::parse(&text, Space::Parameter).unwrap(), f);
        assert!(ValuesFile::parse(&text, Space::Register).is_err());
        assert!(ValuesFile::parse("{}", Space::Parameter).is_err());
    }
}
