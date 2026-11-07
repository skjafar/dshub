use super::*;
use crate::runtime::Event;
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
    use crate::types::{WriteAck, CMD_WRITE_REGISTER};
    use session::{OutcomeStatus, WriteOutcome};
    let mut h = Harness::new(PaneKind::Registers);
    let now = crate::communicator::now_ms();
    let ack = |status: i16, timestamp: f64| WriteAck {
        command: CMD_WRITE_REGISTER,
        address: 10,
        status,
        valid: status >= 0,
        timestamp,
    };
    let sending = || WriteOutcome {
        sent_at: now,
        status: OutcomeStatus::Sending,
    };
    h.session.writes.insert((Space::Register, 10), sending());
    h.session.app.emit(Event::WriteAck(ack(-5, now + 1.)));
    h.session.drain(&h.profile, &h.prefs);
    assert_eq!(
        h.session.writes[&(Space::Register, 10)].status,
        OutcomeStatus::Refused
    );
    h.session.app.emit(Event::Register(RegisterData {
        address: 10,
        name: "MOTOR_X_SETPOINT".into(),
        value: 123,
        valid: true,
        timestamp: now + 2.,
    }));
    h.session.app.emit(Event::WriteAck(ack(2, now + 3.)));
    h.session.drain(&h.profile, &h.prefs);
    assert_eq!(
        h.session.writes[&(Space::Register, 10)].status,
        OutcomeStatus::Refused,
        "later traffic must not turn a refused write into a success"
    );
    // PROTOCOL.md: the status decides the outcome, not the echoed value.
    h.session.writes.insert((Space::Register, 10), sending());
    h.session.app.emit(Event::WriteAck(ack(2, now + 4.)));
    h.session.drain(&h.profile, &h.prefs);
    assert_eq!(
        h.session.writes[&(Space::Register, 10)].status,
        OutcomeStatus::Confirmed
    );
    assert_eq!(
        h.session.readings[&(Space::Register, 10)].value,
        123,
        "an acknowledgement is not a reading"
    );
    h.session.writes.insert(
        (Space::Register, 11),
        WriteOutcome {
            sent_at: now - 6000.,
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
fn connection_endpoints_prefer_explicit_then_reported_ports() {
    use crate::types::{DiscoveredDevice, DEFAULT_TCP_PORT, DEFAULT_UDP_PORT};
    let mut h = Harness::new(PaneKind::Registers);
    assert_eq!(
        h.session.endpoint("10.0.0.5", false).unwrap(),
        ("10.0.0.5".into(), DEFAULT_TCP_PORT)
    );
    h.session.devices.push(DiscoveredDevice {
        ip_address: "10.0.0.5".into(),
        board_name: "Board".into(),
        mac_address: String::new(),
        device_id: 1,
        board_type: 1,
        firmware_version: 1,
        tcp_port: 3009,
        udp_port: 3011,
    });
    assert_eq!(h.session.endpoint("10.0.0.5", false).unwrap().1, 3009);
    assert_eq!(h.session.endpoint("10.0.0.5", true).unwrap().1, 3011);
    assert_eq!(h.session.endpoint(" 10.0.0.5:4000 ", true).unwrap().1, 4000);
    assert_eq!(
        h.session.endpoint("[::1]:2009", false).unwrap(),
        ("::1".into(), 2009)
    );
    assert_eq!(
        h.session.endpoint("10.0.0.6", true).unwrap().1,
        DEFAULT_UDP_PORT
    );
    assert!(h.session.endpoint("10.0.0.5:0", false).is_err());
    assert!(h.session.endpoint("", false).is_err());
}
#[test]
fn opening_metadata_without_editing_leaves_the_draft_unchanged() {
    let mut h = Harness::new(PaneKind::MapEditor);
    h.frame(vec![]);
    h.click("Commands / Metadata");
    let name = h.profile.entries(Space::Register)[0]
        .name
        .split('[')
        .next()
        .unwrap()
        .to_string();
    h.profile.registers_metadata.remove(&name);
    h.pane.draft = None;
    h.frame(vec![]);
    h.click(&name);
    h.frame(vec![]);
    assert!(!h.pane.draft.as_ref().unwrap().maps_differ(&h.profile));
}
#[test]
fn changing_connections_cancels_old_write_confirmations() {
    let mut h = Harness::new(PaneKind::Registers);
    h.session.confirm = Some((
        "Old device write".into(),
        Action::Write(Space::Register, 10, 42),
    ));
    h.session.send(Action::Connect(
        "127.0.0.1".into(),
        crate::types::DEFAULT_TCP_PORT,
        false,
    ));
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

#[test]
fn map_table_renders_separate_rows_without_changing_unedited_source() {
    let mut h = Harness::new(PaneKind::MapEditor);
    h.profile.registers_map =
        "// Keep firmware comments\nuint32_t FIRST;\nfloat SECOND[2];\n".into();
    h.frame(vec![]);
    let output = h.frame(vec![]);
    let position = |label: &str| {
        output
            .shapes
            .iter()
            .find_map(|shape| match &shape.shape {
                egui::Shape::Text(text) if text.galley.text() == label => Some(text.pos),
                _ => None,
            })
            .unwrap()
    };
    assert!(position("SECOND").y > position("FIRST").y);
    assert!((position("SECOND").x - position("FIRST").x).abs() < 1.);
    assert_eq!(
        h.pane.draft.as_ref().unwrap().registers_map,
        h.profile.registers_map
    );
}

#[test]
fn system_map_is_reference_only_and_draft_cannot_override_it() {
    let mut h = Harness::new(PaneKind::MapEditor);
    h.pane.map_space = Space::SysRegister;
    let original = h.profile.system_registers_map.clone();
    let output = h.frame(vec![]);
    for shape in output.shapes {
        if let egui::Shape::Text(text) = shape.shape {
            assert!(!["Add entry", "Import map / header", "Remove", "Details…"]
                .contains(&text.galley.text()));
        }
    }
    let mut draft = h.profile.clone();
    draft.system_registers_map = "uint32_t CUSTOM;".into();
    h.profile.apply_map_draft(&draft);
    assert_eq!(h.profile.system_registers_map, original);
}

fn text_position(output: &egui::FullOutput, label: &str) -> egui::Pos2 {
    output
        .shapes
        .iter()
        .find_map(|s| match &s.shape {
            egui::Shape::Text(t) if t.galley.text() == label => Some(t.pos),
            _ => None,
        })
        .unwrap_or_else(|| panic!("Missing {label}"))
}
fn pointer_button(pos: egui::Pos2, pressed: bool) -> egui::Event {
    egui::Event::PointerButton {
        pos,
        button: egui::PointerButton::Primary,
        pressed,
        modifiers: Default::default(),
    }
}
#[test]
fn canvas_drag_resize_and_configuration_keep_geometry_live() {
    let mut h = Harness::new(PaneKind::Dashboard);
    let mut widget = Widget::new(WidgetKind::ValueRead);
    widget.label = "Movable".into();
    widget.width = 300.;
    widget.height = 160.;
    h.profile.dashboards[0].widgets = vec![widget];
    h.frame(vec![]);
    let normal = h.frame(vec![]);
    let original = text_position(&normal, "Movable");
    h.pane.editing = true;
    h.frame(vec![]);
    let edit = h.frame(vec![]);
    assert_eq!(
        text_position(&edit, "Movable"),
        original,
        "edit mode must not shift the canvas"
    );
    let start = original + egui::vec2(30., 8.);
    h.frame(vec![egui::Event::PointerMoved(start)]);
    h.frame(vec![pointer_button(start, true)]);
    let end = start + egui::vec2(70., 40.);
    h.frame(vec![egui::Event::PointerMoved(end)]);
    let moved = h.profile.dashboards[0].widgets[0].position.unwrap();
    assert!(
        moved[0] >= 60. && moved[1] >= 30.,
        "widget must move before pointer release: {moved:?}"
    );
    h.frame(vec![pointer_button(end, false)]);
    let output = h.frame(vec![]);
    let top_left = text_position(&output, "Movable") - egui::vec2(6., 6.);
    let corner = top_left + egui::vec2(297., 157.);
    h.frame(vec![egui::Event::PointerMoved(corner)]);
    h.frame(vec![pointer_button(corner, true)]);
    let bigger = corner + egui::vec2(50., 35.);
    h.frame(vec![egui::Event::PointerMoved(bigger)]);
    let widget = &h.profile.dashboards[0].widgets[0];
    assert!(
        widget.width > 340. && widget.height > 185.,
        "resize must apply while held: {} x {}",
        widget.width,
        widget.height
    );
    h.frame(vec![pointer_button(bigger, false)]);
    let geometry = (
        h.profile.dashboards[0].widgets[0].position,
        h.profile.dashboards[0].widgets[0].width,
        h.profile.dashboards[0].widgets[0].height,
    );
    h.frame(vec![egui::Event::PointerMoved(
        top_left + egui::vec2(20., 20.),
    )]);
    h.click("Configure");
    h.frame(vec![]);
    let output = h.frame(vec![]);
    text_position(&output, "Changes apply immediately");
    let w = &h.profile.dashboards[0].widgets[0];
    assert_eq!(
        (w.position, w.width, w.height),
        geometry,
        "configuration window must not resize widget"
    );
    // DragValue's text entry changes the actual canvas geometry without Save/Apply.
    h.click(&format!("{}", geometry.1));
    h.frame(vec![
        egui::Event::Key {
            key: egui::Key::A,
            physical_key: None,
            pressed: true,
            repeat: false,
            modifiers: egui::Modifiers {
                ctrl: true,
                command: true,
                ..Default::default()
            },
        },
        egui::Event::Text("420".into()),
        egui::Event::Key {
            key: egui::Key::Enter,
            physical_key: None,
            pressed: true,
            repeat: false,
            modifiers: Default::default(),
        },
    ]);
    h.frame(vec![]);
    assert_eq!(h.profile.dashboards[0].widgets[0].width, 420.);
    h.pane.editing = false;
    h.frame(vec![]);
    let w = &h.profile.dashboards[0].widgets[0];
    assert_eq!(
        (w.position, w.width, w.height),
        (geometry.0, 420., geometry.2)
    );
    let restored: Widget = serde_json::from_str(&serde_json::to_string(w).unwrap()).unwrap();
    assert_eq!(restored.position, w.position);
}

#[test]
fn buttons_and_containers_can_be_dragged_without_dispatching_commands() {
    for kind in [WidgetKind::Button, WidgetKind::Container] {
        let mut h = Harness::new(PaneKind::Dashboard);
        let mut w = Widget::new(kind);
        w.label = "Drag target".into();
        if kind == WidgetKind::Button {
            w.command = Some(14);
        }
        h.profile.dashboards[0].widgets = vec![w];
        h.session.connection = Some(DeviceConnection {
            ip: "127.0.0.1".into(),
            port: 2009,
            interface_type: InterfaceType::Tcp,
            connected: true,
            reconnecting: false,
            control_state: 1,
            device_name: None,
        });
        h.pane.editing = true;
        h.frame(vec![]);
        let out = h.frame(vec![]);
        let start = text_position(&out, "Drag target") + egui::vec2(45., 5.);
        h.frame(vec![egui::Event::PointerMoved(start)]);
        h.frame(vec![pointer_button(start, true)]);
        h.frame(vec![egui::Event::PointerMoved(
            start + egui::vec2(40., 30.),
        )]);
        assert!(
            h.profile.dashboards[0].widgets[0].position.unwrap()[0] > 20.,
            "{kind:?} must move while held"
        );
        assert!(h.session.commands.is_empty());
    }
}

#[test]
fn pointer_drag_reparents_widgets_and_hover_x_removes_them() {
    let mut h = Harness::new(PaneKind::Dashboard);
    let mut a = Widget::new(WidgetKind::Container);
    a.label = "Source".into();
    a.width = 400.;
    a.height = 300.;
    a.position = Some([0., 0.]);
    let mut child = Widget::new(WidgetKind::ValueRead);
    child.label = "Transfer me".into();
    child.width = 180.;
    child.height = 100.;
    child.position = Some([0., 0.]);
    let child_id = child.id.clone();
    a.children.push(child);
    let mut b = Widget::new(WidgetKind::Container);
    b.label = "Destination".into();
    b.width = 400.;
    b.height = 300.;
    b.position = Some([500., 0.]);
    h.profile.dashboards[0].widgets = vec![a, b];
    h.pane.editing = true;
    h.frame(vec![]);
    let out = h.frame(vec![]);
    let start = text_position(&out, "Transfer me") + egui::vec2(45., 5.);
    let end = text_position(&out, "Destination") + egui::vec2(80., 70.);
    h.frame(vec![egui::Event::PointerMoved(start)]);
    h.frame(vec![pointer_button(start, true)]);
    h.frame(vec![egui::Event::PointerMoved(end)]);
    h.frame(vec![pointer_button(end, false)]);
    assert!(h.profile.dashboards[0].widgets[0].children.is_empty());
    assert_eq!(h.profile.dashboards[0].widgets[1].children[0].id, child_id);
    h.frame(vec![]);
    let out = h.frame(vec![]);
    let label = text_position(&out, "Transfer me");
    // The small X occupies the first 20 points of the hovered header.
    let x = label + egui::vec2(8., 8.);
    h.frame(vec![egui::Event::PointerMoved(x)]);
    h.frame(vec![pointer_button(x, true)]);
    h.frame(vec![pointer_button(x, false)]);
    assert!(h.profile.dashboards[0].widgets[1].children.is_empty());
}

#[test]
fn binding_picker_search_selects_the_matching_register() {
    let mut h = Harness::new(PaneKind::Dashboard);
    let mut w = Widget::new(WidgetKind::ValueRead);
    w.label = "Search widget".into();
    h.profile.dashboards[0].widgets = vec![w];
    h.pane.editing = true;
    h.frame(vec![]);
    let out = h.frame(vec![]);
    h.frame(vec![egui::Event::PointerMoved(
        text_position(&out, "Search widget") + egui::vec2(45., 5.),
    )]);
    h.click("Configure");
    h.frame(vec![]);
    h.click("Choose binding");
    h.frame(vec![]);
    h.frame(vec![egui::Event::Text("MOTOR_X_ENCODER".into())]);
    let out = h.frame(vec![]);
    assert!(!out.shapes.iter().any(
        |s| matches!(&s.shape, egui::Shape::Text(t) if t.galley.text().contains("MOTOR_Y_ENCODER"))
    ));
    h.click("MOTOR_X_ENCODER · Registers · 1 (int32_t)");
    let binding = h.profile.dashboards[0].widgets[0].binding.as_ref().unwrap();
    assert_eq!(binding.name, "MOTOR_X_ENCODER");
    assert_eq!(binding.space, Space::Register);
}

#[test]
fn resizing_keeps_neighbors_fixed_until_release() {
    let mut h = Harness::new(PaneKind::Dashboard);
    let mut a = Widget::new(WidgetKind::ValueRead);
    a.label = "Resize target".into();
    a.width = 300.;
    a.height = 160.;
    a.position = Some([0., 0.]);
    let mut b = Widget::new(WidgetKind::ValueRead);
    b.label = "Neighbor".into();
    b.width = 200.;
    b.height = 160.;
    b.position = Some([308., 0.]);
    h.profile.dashboards[0].widgets = vec![a, b];
    h.pane.editing = true;
    h.frame(vec![]);
    let out = h.frame(vec![]);
    let corner = text_position(&out, "Resize target") - egui::vec2(6., 6.) + egui::vec2(297., 157.);
    h.frame(vec![egui::Event::PointerMoved(corner)]);
    h.frame(vec![pointer_button(corner, true)]);
    let end = corner + egui::vec2(50., 20.);
    h.frame(vec![egui::Event::PointerMoved(end)]);
    assert_eq!(
        h.profile.dashboards[0].widgets[1].position,
        Some([308., 0.])
    );
    h.frame(vec![pointer_button(end, false)]);
    assert_eq!(
        h.profile.dashboards[0].widgets[1].position,
        Some([358., 0.])
    );
}

#[test]
fn refinement_startup_resets_dashboard_editing() {
    let mut saved = Saved::default();
    for (_, pane) in saved.dock.iter_all_tabs_mut() {
        pane.editing = true;
    }
    saved.profile_sessions.insert(
        "test".into(),
        LayoutState {
            dock: saved.dock.clone(),
            windows: vec![],
            series: vec![],
        },
    );
    saved.leave_dashboard_edit_mode();
    for dock in [&saved.dock, &saved.profile_sessions["test"].dock] {
        for (_, pane) in dock.iter_all_tabs() {
            if pane.kind == PaneKind::Dashboard {
                assert!(!pane.editing);
            }
        }
    }
}

#[test]
fn refinement_map_rows_drag_within_access_sections() {
    let mut h = Harness::new(PaneKind::MapEditor);
    h.profile.registers_map =
        "uint32_t FIRST;\nuint32_t SECOND;\n// Read/Write\nuint32_t OUTPUT;".into();
    h.frame(vec![]);
    let out = h.frame(vec![]);
    let start = text_position(&out, "≡ 0") + egui::vec2(8., 6.);
    let end = text_position(&out, "SECOND") + egui::vec2(30., 6.);
    h.frame(vec![egui::Event::PointerMoved(start)]);
    h.frame(vec![pointer_button(start, true)]);
    h.frame(vec![egui::Event::PointerMoved(end)]);
    h.frame(vec![pointer_button(end, false)]);
    let entries = h.pane.draft.as_ref().unwrap().entries(Space::Register);
    assert_eq!(entries[0].name, "SECOND");
    assert_eq!(entries[1].name, "FIRST");
    assert!(entries[2].writable);
}
#[test]
fn plot_windows_keep_extremes_when_thinned() {
    let h: std::collections::VecDeque<[f64; 2]> = (0..10_000)
        .map(|i| [i as f64, if i == 5_000 { 99. } else { 0. }])
        .collect();
    let points = panes::window(&h, 1_000., 9_000., 500);
    assert!(points.len() <= 502);
    assert!(points.first().unwrap()[0] >= 1_000.);
    assert!(points.last().unwrap()[0] <= 9_000.);
    assert!(
        points.iter().any(|p| p[1] == 99.),
        "the spike must survive thinning"
    );
    assert_eq!(panes::window(&h, 10., 19., 500).len(), 10);
}
#[test]
fn histories_are_kept_only_for_plotted_addresses() {
    let mut h = Harness::new(PaneKind::Registers);
    let plotted = Binding::new(Space::Register, &h.profile.entries(Space::Register)[0]);
    let reading = |address| {
        Event::Register(RegisterData {
            address,
            name: String::new(),
            value: 1,
            valid: true,
            timestamp: crate::communicator::now_ms(),
        })
    };
    h.session.want_history(&plotted);
    h.session.sync();
    h.session.app.emit(reading(plotted.address));
    h.session.app.emit(reading(plotted.address + 1));
    h.session.drain(&h.profile, &h.prefs);
    assert!(h
        .session
        .histories
        .contains_key(&(Space::Register, plotted.address)));
    assert!(!h
        .session
        .histories
        .contains_key(&(Space::Register, plotted.address + 1)));
    // Once nothing plots it, the history is released.
    h.session.sync();
    assert!(h.session.histories.is_empty());
}
#[test]
fn duplicated_profiles_get_unused_names() {
    let mut profiles = default_profiles();
    let name = profiles[0].name.clone();
    assert_eq!(unique_name("Fresh", &profiles), "Fresh");
    assert_eq!(unique_name(&name, &profiles), format!("{name} 2"));
    profiles[1].name = format!("{name} 2");
    assert_eq!(unique_name(&name, &profiles), format!("{name} 3"));
}
