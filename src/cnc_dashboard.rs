//! Bundled operator panels, bound by map identity rather than hard-coded offsets.
use crate::model::*;

pub fn dashboards(profile: &Profile) -> Vec<Dashboard> {
    let bind = |kind, space, name: &str, label: &str| {
        let entry = profile
            .entries(space)
            .into_iter()
            .find(|e| e.name == name)
            .expect("CNC dashboard entry exists");
        let mut w = Widget::new(kind);
        w.label = label.into();
        w.binding = Some(Binding::new(space, &entry));
        w.height = 140.;
        w.decimals = 0;
        w
    };
    let button = |code, label: &str, confirm| {
        let mut w = Widget::new(WidgetKind::Button);
        w.label = label.into();
        w.command = Some(code);
        w.confirm = confirm;
        w.width = 180.;
        w.height = 90.;
        w
    };
    let mut control = vec![];
    let mut state = bind(
        WidgetKind::StateLed,
        Space::Register,
        "CONTROLLER_STATE",
        "Controller state",
    );
    state.thresholds = [
        "IDLE", "HOMING", "READY", "RUNNING", "PAUSED", "ERROR", "E_STOP",
    ]
    .iter()
    .enumerate()
    .map(|(i, label)| Threshold {
        op: "==".into(),
        value: i as f64,
        role: if i >= 5 { "error" } else { "ok" }.into(),
        label: (*label).into(),
    })
    .collect();
    control.push(state);
    control.push(button(14, "EMERGENCY STOP", false));
    control.push(button(15, "Reset E-stop", true));
    control.push(button(16, "Clear errors", true));
    control.push(button(0, "Enable all axes", true));
    control.push(button(1, "Disable all axes", false));
    control.push(button(10, "Home all axes", true));
    let mut machine = Widget::new(WidgetKind::Container);
    machine.label = "Machine controls".into();
    machine.width = 650.;
    machine.height = 420.;
    for w in &mut control {
        w.width = 180.;
    }
    machine.children = control;
    let mut control = vec![machine];
    for (i, axis) in ["X", "Y", "Z"].iter().enumerate() {
        let mut group = Widget::new(WidgetKind::Container);
        group.label = format!("{axis} axis · encoder counts");
        group.width = 650.;
        group.height = 500.;
        let mut position = bind(
            WidgetKind::EncoderDisplay,
            Space::Register,
            &format!("MOTOR_{axis}_ENCODER"),
            "Position",
        );
        position.unit = "counts".into();
        let enabled = bind(
            WidgetKind::LedIndicator,
            Space::Register,
            &format!("MOTOR_{axis}_ENABLED"),
            "Driver enabled",
        );
        let mut target = bind(
            WidgetKind::ValueWrite,
            Space::Register,
            &format!("MOTOR_{axis}_SETPOINT"),
            "Target position (counts)",
        );
        target.min = i32::MIN as f64;
        target.max = i32::MAX as f64;
        target.confirm = true;
        let mut jog = Widget::new(WidgetKind::DirectionalControl);
        jog.label = format!("Jog {axis}");
        jog.height = 100.;
        jog.directions = [
            ("left", 21 + i as u16 * 2, "−"),
            ("right", 20 + i as u16 * 2, "+"),
        ]
        .into_iter()
        .map(|(direction, command, label)| DirectionTarget {
            direction: direction.into(),
            command,
            label: format!("{axis} {label}"),
        })
        .collect();
        group.children = vec![
            position,
            enabled,
            target,
            jog,
            button(2 + i as u16, "Enable", true),
            button(5 + i as u16, "Disable", false),
            button(11 + i as u16, "Home axis", true),
        ];
        control.push(group);
    }
    let mut distance = bind(
        WidgetKind::Dropdown,
        Space::Register,
        "JOG_DISTANCE",
        "Jog step (counts)",
    );
    distance.options = [1, 10, 50, 100, 500, 1000]
        .into_iter()
        .map(|v| ValueLabel {
            value: v.to_string(),
            label: v.to_string(),
        })
        .collect();
    control.push(distance);
    let mut spindle = Widget::new(WidgetKind::Container);
    spindle.label = "Spindle".into();
    spindle.width = 650.;
    spindle.height = 440.;
    let mut rpm = bind(
        WidgetKind::Gauge,
        Space::Register,
        "SPINDLE_RPM",
        "Actual speed",
    );
    rpm.max = 24000.;
    rpm.unit = "RPM".into();
    let mut speed = bind(
        WidgetKind::ValueWrite,
        Space::Register,
        "SPINDLE_SPEED_SETPOINT",
        "Target speed (RPM)",
    );
    speed.max = 24000.;
    speed.confirm = true;
    let mut load = bind(
        WidgetKind::ProgressBar,
        Space::Register,
        "SPINDLE_LOAD",
        "Spindle load",
    );
    load.unit = "%".into();
    spindle.children = vec![
        rpm,
        load,
        speed,
        bind(
            WidgetKind::LedIndicator,
            Space::Register,
            "SPINDLE_ENABLED",
            "Spindle enabled",
        ),
        button(8, "Start spindle", true),
        button(9, "Stop spindle", false),
    ];
    control.push(spindle);
    let mut monitoring = vec![];
    for name in [
        "MOTOR_X_ENCODER",
        "MOTOR_Y_ENCODER",
        "MOTOR_Z_ENCODER",
        "SPINDLE_RPM",
    ] {
        let mut w = bind(WidgetKind::MiniPlot, Space::Register, name, name);
        w.width = 500.;
        w.height = 240.;
        monitoring.push(w);
    }
    let mut diagnostics = Widget::new(WidgetKind::DataTable);
    diagnostics.label = "Communication diagnostics".into();
    diagnostics.rows = profile
        .entries(Space::SysRegister)
        .iter()
        .map(|e| Binding::new(Space::SysRegister, e))
        .collect();
    monitoring.push(diagnostics);
    let tuning = profile
        .entries(Space::Parameter)
        .iter()
        .map(|e| {
            let mut w = bind(WidgetKind::ValueWrite, Space::Parameter, &e.name, &e.name);
            w.confirm = true;
            w.decimals = 3;
            w
        })
        .collect();
    vec![
        Dashboard {
            id: "cnc-control".into(),
            name: "CNC Control".into(),
            widgets: control,
        },
        Dashboard {
            id: "cnc-monitoring".into(),
            name: "Monitoring".into(),
            widgets: monitoring,
        },
        Dashboard {
            id: "cnc-tuning".into(),
            name: "Motion tuning".into(),
            widgets: tuning,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bundled_panels_bind_every_control_to_the_cnc_contract() {
        let p = default_profiles().remove(1);
        fn check(w: &Widget, p: &Profile, commands: &mut Vec<u16>) {
            if let Some(b) = &w.binding {
                assert!(b.matches(p), "{}", w.label);
            }
            for b in &w.rows {
                assert!(b.matches(p));
            }
            if let Some(c) = w.command {
                commands.push(c);
            }
            commands.extend(w.directions.iter().map(|d| d.command));
            for child in &w.children {
                check(child, p, commands);
            }
        }
        let mut commands = vec![];
        for d in &p.dashboards {
            for w in &d.widgets {
                check(w, &p, &mut commands);
            }
        }
        for c in p.sys_commands.iter().filter(|c| c.code < 65000) {
            assert!(commands.contains(&c.code), "missing {}", c.name);
        }
        assert_eq!(p.dashboards[2].widgets.len(), 25);
        assert!(Profile::import(&p.export().to_string()).is_ok());
    }
}
