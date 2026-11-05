use super::*;
use crate::types::{DeviceConnection, InterfaceType, RegisterData};

struct Harness {
    ctx: egui::Context,
    session: Session,
    profile: Profile,
    pane: Pane,
    prefs: Preferences,
    series: Vec<PlotSeries>,
    time: f64,
}
impl Harness {
    fn new(kind: PaneKind) -> Self {
        let mut profile = default_profiles().remove(1);
        profile.dashboards.truncate(1);
        profile.dashboards[0].widgets.clear();
        Self {
            ctx: egui::Context::default(),
            session: Session::new(),
            profile,
            pane: Pane::new(kind),
            prefs: Preferences::default(),
            series: vec![],
            time: 0.,
        }
    }
    fn frame(&mut self, events: Vec<egui::Event>) -> egui::FullOutput {
        self.time += 0.02;
        let input = egui::RawInput {
            screen_rect: Some(egui::Rect::from_min_size(
                egui::Pos2::ZERO,
                egui::vec2(1400., 1000.),
            )),
            time: Some(self.time),
            events,
            ..Default::default()
        };
        self.ctx.run(input, |ctx| {
            egui::CentralPanel::default().show(ctx, |ui| {
                let mut moved = vec![];
                let mut added = vec![];
                let mut viewer = panes::Viewer {
                    session: &mut self.session,
                    profile: &mut self.profile,
                    prefs: &self.prefs,
                    series: &mut self.series,
                    moved: &mut moved,
                    added: &mut added,
                    window_id: "test",
                    destinations: &[],
                };
                egui_dock::TabViewer::ui(&mut viewer, ui, &mut self.pane);
            });
        })
    }
    fn click(&mut self, label: &str) {
        self.frame(vec![]);
        let output = self.frame(vec![]);
        let position = output
            .shapes
            .iter()
            .find_map(|shape| {
                if let egui::Shape::Text(t) = &shape.shape {
                    (t.galley.text() == label).then(|| t.pos + t.galley.size() / 2.)
                } else {
                    None
                }
            })
            .unwrap_or_else(|| panic!("No rendered control named {label}"));
        self.frame(vec![
            egui::Event::PointerMoved(position),
            egui::Event::PointerButton {
                pos: position,
                button: egui::PointerButton::Primary,
                pressed: true,
                modifiers: Default::default(),
            },
        ]);
        self.frame(vec![egui::Event::PointerButton {
            pos: position,
            button: egui::PointerButton::Primary,
            pressed: false,
            modifiers: Default::default(),
        }]);
    }
}
#[test]
fn map_editor_add_and_save_updates_profile() {
    let mut h = Harness::new(PaneKind::MapEditor);
    let initial = h.profile.entries(Space::Register).len();
    h.click("Add entry");
    assert_eq!(
        h.profile.entries(Space::Register).len(),
        initial,
        "draft must remain separate before save"
    );
    h.click("Save Profile");
    assert_eq!(h.profile.entries(Space::Register).len(), initial + 1);
    assert!(h.profile.registers_map.contains("NEW_ENTRY_1"));
}
#[test]
fn every_pane_and_widget_renders_with_live_and_offline_state() {
    let mut h = Harness::new(PaneKind::Overview);
    for connected in [false, true] {
        h.session.connection = connected.then_some(DeviceConnection {
            ip: "127.0.0.1".into(),
            port: 2009,
            interface_type: InterfaceType::Tcp,
            connected: true,
            reconnecting: false,
            control_state: 1,
            device_name: Some("Emulator".into()),
        });
        for space in Space::ALL {
            for e in h.profile.entries(space) {
                h.session.readings.insert(
                    (space, e.address),
                    RegisterData {
                        address: e.address,
                        name: e.name.clone(),
                        value: 42,
                        valid: connected,
                        timestamp: 1_000.,
                    },
                );
            }
        }
        for kind in PaneKind::ALL {
            h.pane = Pane::new(kind);
            let output = h.frame(vec![]);
            assert!(!output.shapes.is_empty(), "{kind:?}");
        }
        for kind in WidgetKind::ALL {
            let entry = h.profile.entries(Space::Register)[0].clone();
            let mut widget = Widget::new(kind);
            widget.binding = Some(Binding::new(Space::Register, &entry));
            widget.rows.push(Binding::new(Space::Register, &entry));
            widget.directions.push(DirectionTarget {
                direction: "up".into(),
                command: 20,
                label: "Up".into(),
            });
            widget.command = Some(0);
            h.profile.dashboards[0].widgets = vec![widget];
            h.pane = Pane::new(PaneKind::Dashboard);
            let output = h.frame(vec![]);
            assert!(!output.shapes.is_empty(), "{kind:?}");
        }
    }
}
#[test]
fn save_and_restore_preserves_native_layout_profiles_and_windows() {
    let mut s = Saved::default();
    s.windows.push(NativeWindow {
        id: "daughter".into(),
        title: "Monitor".into(),
        dock: DockState::new(vec![Pane::new(PaneKind::Plot)]),
        position: Some([25., 50.]),
        size: [1000., 700.],
    });
    s.workspaces.push(Workspace {
        id: "saved".into(),
        name: "Inspection".into(),
        series_catalog: vec![],
        profile_id: s.active.clone(),
        dock: s.dock.clone(),
        windows: s.windows.clone(),
    });
    #[derive(Default)]
    struct MemoryStorage(std::collections::BTreeMap<String, String>);
    impl eframe::Storage for MemoryStorage {
        fn get_string(&self, key: &str) -> Option<String> {
            self.0.get(key).cloned()
        }
        fn set_string(&mut self, key: &str, value: String) {
            self.0.insert(key.into(), value);
        }
        fn flush(&mut self) {}
    }
    let mut storage = MemoryStorage::default();
    eframe::set_value(&mut storage, "state", &s);
    let restored: Saved = eframe::get_value(&storage, "state")
        .expect("native state must roundtrip through the production storage codec");
    assert_eq!(restored.windows.len(), 1);
    assert_eq!(restored.workspaces[0].name, "Inspection");
    assert_eq!(restored.dock.iter_all_tabs().count(), 10);
}
#[test]
fn unreviewed_widgets_do_not_subscribe_or_write() {
    let mut h = Harness::new(PaneKind::Dashboard);
    let e = h.profile.entries(Space::Register)[10].clone();
    let mut widget = Widget::new(WidgetKind::ValueWrite);
    widget.binding = Some(Binding::new(Space::Register, &e));
    h.profile.dashboards[0].widgets = vec![widget];
    h.profile.registers_map = format!("uint32_t INSERTED;\n{}", h.profile.registers_map);
    h.frame(vec![]);
    assert!(h.session.interests.is_empty());
    assert_eq!(review::count(&h.profile, &[]), 1);
}
#[test]
fn nested_and_hidden_bindings_are_in_review_count() {
    let mut p = default_profiles().remove(1);
    p.dashboards.truncate(1);
    p.dashboards[0].widgets.clear();
    let mut child = Widget::new(WidgetKind::ValueRead);
    child.binding = Some(Binding::new(
        Space::Register,
        &p.entries(Space::Register)[0],
    ));
    let mut container = Widget::new(WidgetKind::Container);
    container.children.push(child);
    p.dashboards[0].widgets.push(container);
    p.registers_map = "uint32_t REPLACED;".into();
    assert_eq!(review::count(&p, &[]), 1);
}

#[test]
fn dashboard_cards_wrap_in_rows_and_keep_vertical_content() {
    let mut h = Harness::new(PaneKind::Dashboard);
    h.profile.dashboards[0].widgets = (0..6)
        .map(|i| {
            let mut w = Widget::new(WidgetKind::ValueRead);
            w.label = format!("Card{i}");
            w.width = 300.;
            w.height = 100.;
            w
        })
        .collect();
    h.frame(vec![]);
    let output = h.frame(vec![]);
    let pos = |label: &str| {
        output
            .shapes
            .iter()
            .find_map(|s| {
                if let egui::Shape::Text(t) = &s.shape {
                    (t.galley.text() == label).then_some(t.pos)
                } else {
                    None
                }
            })
            .unwrap()
    };
    assert!(pos("Card1").x > pos("Card0").x);
    assert!(
        pos("Card4").y > pos("Card0").y,
        "fifth card must wrap below the first row"
    );
}
#[test]
fn saving_a_map_draft_preserves_concurrent_dashboard_changes() {
    let mut h = Harness::new(PaneKind::MapEditor);
    h.frame(vec![]);
    h.profile.dashboards[0]
        .widgets
        .push(Widget::new(WidgetKind::Gauge));
    h.click("Save Profile");
    assert_eq!(h.profile.dashboards[0].widgets.len(), 1);
}
#[test]
fn write_outcomes_wait_for_device_acknowledgement_and_preserve_refusal() {
    use session::{OutcomeStatus, WriteOutcome};
    let mut h = Harness::new(PaneKind::Registers);
    let now = crate::communicator::now_ms();
    h.session.writes.insert(
        (Space::Register, 10),
        WriteOutcome {
            sent_at: now,
            expected: 123,
            status: OutcomeStatus::Sending,
        },
    );
    h.session
        .app
        .emit(
            "registerUpdate",
            RegisterData {
                address: 10,
                name: "MOTOR_X_SETPOINT".into(),
                value: 123,
                valid: false,
                timestamp: now + 1.,
            },
        )
        .unwrap();
    h.session.drain(&h.profile, &h.prefs);
    assert_eq!(
        h.session.writes[&(Space::Register, 10)].status,
        OutcomeStatus::Refused
    );
    h.session
        .app
        .emit(
            "registerUpdate",
            RegisterData {
                address: 10,
                name: "MOTOR_X_SETPOINT".into(),
                value: 123,
                valid: true,
                timestamp: now + 2.,
            },
        )
        .unwrap();
    h.session.drain(&h.profile, &h.prefs);
    assert_eq!(
        h.session.writes[&(Space::Register, 10)].status,
        OutcomeStatus::Refused,
        "a later read must not turn a refused write into a success"
    );
    h.session.writes.insert(
        (Space::Register, 10),
        WriteOutcome {
            sent_at: now,
            expected: 123,
            status: OutcomeStatus::Sending,
        },
    );
    h.session
        .app
        .emit(
            "registerUpdate",
            RegisterData {
                address: 10,
                name: "MOTOR_X_SETPOINT".into(),
                value: 123,
                valid: true,
                timestamp: now + 3.,
            },
        )
        .unwrap();
    h.session.drain(&h.profile, &h.prefs);
    assert_eq!(
        h.session.writes[&(Space::Register, 10)].status,
        OutcomeStatus::Confirmed
    );
    h.session.writes.insert(
        (Space::Register, 11),
        WriteOutcome {
            sent_at: now - 6000.,
            expected: 123,
            status: OutcomeStatus::Sending,
        },
    );
    h.session.drain(&h.profile, &h.prefs);
    assert_eq!(
        h.session.writes[&(Space::Register, 11)].status,
        OutcomeStatus::Unknown
    );
}
#[test]
fn changing_connections_cancels_old_write_confirmations() {
    let mut h = Harness::new(PaneKind::Registers);
    h.session.confirm = Some((
        "Old device write".into(),
        Action::Write(Space::Register, 10, 42),
    ));
    h.session.send(Action::Connect("127.0.0.1".into(), false));
    assert!(h.session.confirm.is_none());
}

#[test]
fn plot_panes_select_traces_independently() {
    let mut h = Harness::new(PaneKind::Plot);
    let e = h.profile.entries(Space::Register)[0].clone();
    h.series.push(PlotSeries {
        id: "state".into(),
        binding: Binding::new(Space::Register, &e),
        enabled: true,
    });
    h.click("CONTROLLER_STATE");
    assert_eq!(h.pane.plot_series, vec!["state"]);
    let first = h.pane.clone();
    h.pane = Pane::new(PaneKind::Plot);
    h.frame(vec![]);
    assert!(h.pane.plot_series.is_empty());
    h.click("CONTROLLER_STATE");
    h.click("CONTROLLER_STATE");
    assert!(h.pane.plot_series.is_empty());
    assert_eq!(first.plot_series, vec!["state"]);
    assert_eq!(
        h.series.len(),
        1,
        "trace selection must not delete another pane's series"
    );
}

#[test]
fn bundled_cnc_dashboards_render_offline_and_with_feedback() {
    let mut h = Harness::new(PaneKind::Dashboard);
    h.profile = default_profiles().remove(1);
    for online in [false, true] {
        for space in Space::ALL {
            for e in h.profile.entries(space) {
                h.session.readings.insert(
                    (space, e.address),
                    RegisterData {
                        address: e.address,
                        name: e.name,
                        value: 0,
                        valid: online,
                        timestamp: 1000.,
                    },
                );
            }
        }
        for index in 0..h.profile.dashboards.len() {
            h.pane.dashboard = index;
            let result = h.frame(vec![]);
            assert!(!result.shapes.is_empty());
            assert_eq!(review::count(&h.profile, &[]), 0);
        }
    }
}
