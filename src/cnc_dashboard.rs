//! Bundled operator panels, bound by map identity rather than hard-coded offsets.
use crate::dashboard_kit::*;
use crate::model::*;

/// Canvas width the panels are laid out for.
const WIDTH: f32 = 1200.;
const AXES: [&str; 3] = ["X", "Y", "Z"];
/// Height of the short position trend in each axis group.
const TREND: f32 = 96.;

pub fn dashboards(profile: &Profile) -> Vec<Dashboard> {
    vec![
        Dashboard {
            id: "cnc-emulator-control-v2".into(),
            name: "CNC · Operator".into(),
            widgets: operator(profile),
        },
        Dashboard {
            id: "cnc-emulator-monitoring-v2".into(),
            name: "CNC · Trends".into(),
            widgets: trends(profile),
        },
        Dashboard {
            id: "cnc-emulator-tuning-v2".into(),
            name: "CNC · Tuning".into(),
            widgets: tuning(profile),
        },
    ]
}

fn bind(profile: &Profile, kind: WidgetKind, space: Space, name: &str, label: &str) -> Widget {
    let entry = profile
        .entries(space)
        .into_iter()
        .find(|e| e.name == name)
        .expect("CNC dashboard entry exists");
    let mut w = Widget::new(kind);
    w.label = label.into();
    w.binding = Some(Binding::new(space, &entry));
    w.decimals = 0;
    if let Some(m) = profile.metadata(space, name) {
        w.unit = m.unit.clone();
    }
    w
}
fn register(profile: &Profile, kind: WidgetKind, name: &str, label: &str) -> Widget {
    bind(profile, kind, Space::Register, name, label)
}
fn button(code: u16, label: &str, confirm: bool) -> Widget {
    let mut w = Widget::new(WidgetKind::Button);
    w.label = label.into();
    w.command = Some(code);
    w.confirm = confirm;
    w
}
/// A button that takes something away (disable, stop): quiet, so the
/// actions that start motion stand out.
fn quiet(code: u16, label: &str) -> Widget {
    let mut w = button(code, label, false);
    w.style = ButtonStyle::Neutral;
    w
}
/// Spindle load: heavy cutting from 80 %, as the map describes.
fn spindle_load(profile: &Profile, label: &str) -> Widget {
    let mut load = register(profile, WidgetKind::ProgressBar, "SPINDLE_LOAD", label);
    load.thresholds = vec![Threshold::new(Comparator::Ge, 80., Role::Warn, "High load")];
    load.show_limits = true;
    load
}
/// A short trend with the latest value in its title.
fn trend(profile: &Profile, name: &str, label: &str, seconds: f64) -> Widget {
    let mut w = register(profile, WidgetKind::MiniPlot, name, label);
    w.time_span = seconds;
    w
}
fn controller_state(profile: &Profile) -> Widget {
    let mut state = register(
        profile,
        WidgetKind::StateLed,
        "CONTROLLER_STATE",
        "Controller state",
    );
    state.thresholds = [
        "IDLE", "HOMING", "READY", "RUNNING", "PAUSED", "ERROR", "E_STOP",
    ]
    .iter()
    .enumerate()
    .map(|(i, label)| {
        let role = match i {
            5 | 6 => Role::Error,
            1 | 4 => Role::Warn,
            2 | 3 => Role::Ok,
            _ => Role::Idle,
        };
        Threshold::new(Comparator::Eq, i as f64, role, *label)
    })
    .collect();
    state
}
fn enabled(profile: &Profile, name: &str, label: &str) -> Widget {
    let mut w = register(profile, WidgetKind::StateLed, name, label);
    w.thresholds = led_states(1., "Enabled", "Disabled", &[]);
    w
}
/// Equal buttons across `width`.
fn buttons(buttons: Vec<Widget>, width: f32, height: f32) -> Block {
    let n = buttons.len();
    row(
        buttons
            .into_iter()
            .map(|b| Block::sized(b, span(width, n, 1, GAP), height))
            .collect(),
        GAP,
    )
}

fn operator(profile: &Profile) -> Vec<Widget> {
    // Machine strip: state, the emergency stop and machine-wide commands,
    // beside one jog pad for all three axes.
    let quarter = span(WIDTH, 4, 1, SECTION);
    let mut step = register(profile, WidgetKind::Dropdown, "JOG_DISTANCE", "Jog step");
    step.options = [1, 10, 50, 100, 500, 1000]
        .into_iter()
        .map(|v| ValueLabel {
            value: v.to_string(),
            label: format!("{v} counts"),
        })
        .collect();
    let mut pad = Widget::new(WidgetKind::DirectionalControl);
    pad.label = String::new();
    pad.directions = [
        ("up", 22, "Y+"),
        ("down", 23, "Y−"),
        ("right", 20, "X+"),
        ("left", 21, "X−"),
        ("upRight", 24, "Z+"),
        ("downLeft", 25, "Z−"),
    ]
    .into_iter()
    .map(|(direction, command, label)| DirectionTarget {
        direction: direction.into(),
        command,
        label: label.into(),
    })
    .collect();
    let jog = column(
        vec![
            Block::fit(step, inner(quarter)),
            Block::fit(pad, inner(quarter)),
        ],
        GAP,
    );
    let height = jog.height;
    let jog = group("Jog", jog);

    let inner_width = inner(WIDTH - quarter - SECTION);
    let mut state = controller_state(profile);
    state.text_size = 1.25;
    let state = Block::fit(state, 240.);
    let mut stop = button(14, "EMERGENCY STOP", false);
    stop.style = ButtonStyle::Danger;
    stop.text_size = 1.15;
    let stop = Block::sized(stop, 240., height - state.height - GAP);
    let commands_width = inner_width - 240. - GAP;
    let command_height = (height - GAP * 2.) / 3.;
    let commands = column(
        vec![
            buttons(
                vec![
                    button(15, "Reset E-stop", true),
                    button(16, "Clear errors", true),
                ],
                commands_width,
                command_height,
            ),
            buttons(
                vec![
                    button(0, "Enable all axes", true),
                    quiet(1, "Disable all axes"),
                ],
                commands_width,
                command_height,
            ),
            Block::sized(
                button(10, "Home all axes", true),
                commands_width,
                command_height,
            ),
        ],
        GAP,
    );
    let machine = group(
        "Machine",
        row(vec![column(vec![state, stop], GAP), commands], GAP),
    );

    // One column per axis, then the spindle.
    let w = inner(quarter);
    let mut columns: Vec<Block> = AXES
        .iter()
        .enumerate()
        .map(|(i, axis)| {
            let i = i as u16;
            let encoder = format!("MOTOR_{axis}_ENCODER");
            let mut position = register(profile, WidgetKind::ValueRead, &encoder, "Position");
            position.text_size = 1.2;
            let mut target = register(
                profile,
                WidgetKind::ValueWrite,
                &format!("MOTOR_{axis}_SETPOINT"),
                "Target position",
            );
            target.min = i32::MIN as f64;
            target.max = i32::MAX as f64;
            target.confirm = true;
            group(
                &format!("{axis} axis"),
                column(
                    vec![
                        Block::fit(position, w),
                        Block::sized(trend(profile, &encoder, "", 30.), w, TREND),
                        Block::fit(target, w),
                        Block::fit(
                            enabled(profile, &format!("MOTOR_{axis}_ENABLED"), "Driver"),
                            w,
                        ),
                        buttons(
                            vec![button(2 + i, "Enable", true), quiet(5 + i, "Disable")],
                            w,
                            32.,
                        ),
                        Block::sized(button(11 + i, &format!("Home {axis}"), true), w, 32.),
                    ],
                    GAP,
                ),
            )
        })
        .collect();
    let mut rpm = register(profile, WidgetKind::Gauge, "SPINDLE_RPM", "Speed");
    rpm.max = 24000.;
    let load = spindle_load(profile, "Load");
    let mut speed = register(
        profile,
        WidgetKind::ValueWrite,
        "SPINDLE_SPEED_SETPOINT",
        "Target speed",
    );
    speed.max = 24000.;
    speed.value = "12000".into();
    speed.confirm = true;
    columns.push(group(
        "Spindle",
        column(
            vec![
                Block::fit(rpm, w),
                Block::fit(load, w),
                Block::fit(speed, w),
                Block::fit(enabled(profile, "SPINDLE_ENABLED", "Spindle"), w),
                buttons(vec![button(8, "Start", true), quiet(9, "Stop")], w, 32.),
            ],
            GAP,
        ),
    ));
    column(
        vec![row(vec![machine, jog], SECTION), row(columns, SECTION)],
        SECTION,
    )
    .into_widgets()
}

fn trends(profile: &Profile) -> Vec<Widget> {
    // Four trends, each with its latest value in the title, beside the
    // machine's state and the link's health.
    let plots_width = span(WIDTH, 3, 2, SECTION);
    let plot_width = span(plots_width, 2, 1, SECTION);
    let plots = grid(
        [
            ("MOTOR_X_ENCODER", "X position"),
            ("MOTOR_Y_ENCODER", "Y position"),
            ("MOTOR_Z_ENCODER", "Z position"),
            ("SPINDLE_RPM", "Spindle speed"),
        ]
        .into_iter()
        .map(|(name, label)| Block::sized(trend(profile, name, label, 60.), plot_width, 260.))
        .collect(),
        2,
        SECTION,
    );
    let side = inner(WIDTH - plots_width - SECTION);
    let half = span(side, 2, 1, GAP);
    let mut state = controller_state(profile);
    state.text_size = 1.25;
    let drivers = grid(
        [
            ("MOTOR_X_ENABLED", "X driver"),
            ("MOTOR_Y_ENABLED", "Y driver"),
            ("MOTOR_Z_ENABLED", "Z driver"),
            ("SPINDLE_ENABLED", "Spindle"),
        ]
        .into_iter()
        .map(|(name, label)| Block::fit(enabled(profile, name, label), half))
        .collect(),
        2,
        GAP,
    );
    let machine = group(
        "Machine",
        column(
            vec![
                Block::fit(state, side),
                drivers,
                Block::fit(spindle_load(profile, "Spindle load"), side),
            ],
            GAP,
        ),
    );
    let mut link = Widget::new(WidgetKind::DataTable);
    link.label = String::new();
    link.show_header = true;
    link.decimals = 0;
    for (name, label) in [
        ("DS_PACKET_COUNT", "Packets"),
        ("DS_ERROR_COUNT", "Errors"),
        ("CONTROL_INTERFACE", "Control"),
        ("COUNTER_1HZ", "Seconds"),
    ] {
        let entry = profile
            .entries(Space::SysRegister)
            .into_iter()
            .find(|e| e.name == name)
            .expect("library system register exists");
        link.rows.push(Binding::new(Space::SysRegister, &entry));
        link.row_styles.insert(
            name.into(),
            RowStyle {
                label: label.into(),
                ..Default::default()
            },
        );
    }
    let link = group("Communication", Block::fit(link, side));
    row(vec![plots, column(vec![machine, link], SECTION)], SECTION).into_widgets()
}

fn tuning(profile: &Profile) -> Vec<Widget> {
    let third = span(WIDTH, 3, 1, SECTION);
    let table = |label: &str, rows: &[(String, &str)]| {
        let mut w = Widget::new(WidgetKind::DataTable);
        w.label = label.into();
        w.confirm = true;
        w.show_header = true;
        for (name, short) in rows {
            let entry = profile
                .entries(Space::Parameter)
                .into_iter()
                .find(|e| &e.name == name)
                .expect("CNC parameter exists");
            w.rows.push(Binding::new(Space::Parameter, &entry));
            w.row_styles.insert(
                name.clone(),
                RowStyle {
                    label: (*short).into(),
                    format: DisplayFormat::default(),
                    thresholds: vec![],
                },
            );
        }
        Block::fit(w, third)
    };
    let axes = AXES
        .iter()
        .map(|axis| {
            let rows = [
                (format!("MOTOR_{axis}_MAX_VEL"), "Max velocity"),
                (format!("MOTOR_{axis}_MAX_ACCEL"), "Max acceleration"),
                (format!("MOTOR_{axis}_KP"), "Kp"),
                (format!("MOTOR_{axis}_KI"), "Ki"),
                (format!("MOTOR_{axis}_KD"), "Kd"),
                (format!("MOTOR_{axis}_STEPS_PER_MM"), "Steps per mm"),
                (format!("HOME_{axis}_POSITION"), "Home position"),
            ];
            table(&format!("{axis} axis"), &rows)
        })
        .collect();
    let spindle = table(
        "Spindle",
        &[
            ("SPINDLE_MAX_RPM".into(), "Max speed"),
            ("SPINDLE_ACCEL_RPM_PER_SEC".into(), "Acceleration"),
        ],
    );
    let motion = table(
        "Homing and stopping",
        &[
            ("HOMING_SPEED".into(), "Homing speed"),
            ("E_STOP_DECEL".into(), "E-stop decel."),
        ],
    );
    let mut note = Widget::new(WidgetKind::Label);
    note.label = "Point at a row to type a new value, then press Write. Each write \
                  asks first and shows its outcome beside the button. Changes are \
                  lost at restart unless they are written to flash."
        .into();
    note.tone = TextTone::Weak;
    // Library commands every datastream device has.
    let flash = |code: u16, label: &str, style: ButtonStyle| {
        let mut w = button(code, label, true);
        w.style = style;
        w
    };
    let memory = group(
        "Flash memory",
        column(
            vec![
                buttons(
                    vec![
                        flash(65001, "Write flash", ButtonStyle::Action),
                        flash(65000, "Read flash", ButtonStyle::Neutral),
                    ],
                    inner(third),
                    32.,
                ),
                Block::fit(note, inner(third)),
            ],
            GAP,
        ),
    );
    column(
        vec![
            row(axes, SECTION),
            row(vec![spindle, motion, memory], SECTION),
        ],
        SECTION,
    )
    .into_widgets()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bundled_panels_bind_every_control_to_the_cnc_contract() {
        let p = default_profiles().remove(1);
        fn check(w: &Widget, p: &Profile, commands: &mut Vec<u16>, rows: &mut usize) {
            if let Some(b) = &w.binding {
                assert!(b.matches(p), "{}", w.label);
            }
            for b in &w.rows {
                assert!(b.matches(p));
                *rows += usize::from(b.space == Space::Parameter);
            }
            if let Some(c) = w.command {
                commands.push(c);
            }
            commands.extend(w.directions.iter().map(|d| d.command));
            for child in &w.children {
                check(child, p, commands, rows);
            }
        }
        let (mut commands, mut parameters) = (vec![], 0);
        for d in &p.dashboards {
            for w in &d.widgets {
                check(w, &p, &mut commands, &mut parameters);
            }
        }
        for c in p.sys_commands.iter().filter(|c| c.code < 65000) {
            assert!(commands.contains(&c.code), "missing {}", c.name);
        }
        assert_eq!(
            parameters,
            p.entries(Space::Parameter).len(),
            "every parameter is tunable"
        );
        assert!(Profile::import(&p.export().to_string()).is_ok());
    }
    #[test]
    fn bundled_panels_fit_the_canvas_without_overlap() {
        let p = default_profiles().remove(1);
        fn check(widgets: &[Widget], width: f32) {
            let r: Vec<[f32; 4]> = widgets
                .iter()
                .map(|w| {
                    let [x, y] = w.position.unwrap();
                    [x, y, x + w.width, y + w.height]
                })
                .collect();
            for (i, a) in r.iter().enumerate() {
                assert!(a[2] <= width + 0.5, "{} too wide", widgets[i].label);
                for b in &r[i + 1..] {
                    let overlap = a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
                    assert!(!overlap, "{} overlaps", widgets[i].label);
                }
            }
            for w in widgets {
                check(&w.children, inner(w.width));
            }
        }
        for d in &p.dashboards {
            check(&d.widgets, WIDTH);
        }
    }
}
