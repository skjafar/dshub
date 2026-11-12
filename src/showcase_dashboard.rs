//! The Default Profile's widget showcase: every widget kind once, each under a
//! caption, bound to the library's system registers (live on any datastream
//! device) or to the harmless `PLACEHOLDER` register for writes.
use crate::dashboard_kit::*;
use crate::model::*;

pub const ID: &str = "default-widget-showcase";

/// Canvas width the showcase is laid out for.
const WIDTH: f32 = 1200.;
/// The inside of one of four cards across the canvas.
const INNER: f32 = 288. - PADDING * 2.;

/// Whether `profile` has the entries the showcase binds to; a Default
/// Profile whose maps were changed may not.
pub fn fits(profile: &Profile) -> bool {
    let has = |space: Space, name: &str| profile.entries(space).iter().any(|e| e.name == name);
    has(Space::Register, "PLACEHOLDER")
        && [
            "DS_PACKET_COUNT",
            "DS_ERROR_COUNT",
            "CONTROL_INTERFACE",
            "COUNTER_1HZ",
        ]
        .iter()
        .all(|name| has(Space::SysRegister, name))
}

pub fn dashboard(profile: &Profile) -> Dashboard {
    let entry = |space: Space, name: &str| {
        profile
            .entries(space)
            .into_iter()
            .find(|e| e.name == name)
            .unwrap_or_else(|| panic!("showcase entry {name}"))
    };
    let bind = |space, name: &str| Binding::new(space, &entry(space, name));
    let sys = |name: &str| bind(Space::SysRegister, name);
    let placeholder = || bind(Space::Register, "PLACEHOLDER");
    let rule = |op: &str, value: f64, role: &str, label: &str| {
        Threshold::new(op.into(), value, role.into(), label)
    };
    let control_states = [
        (0., "idle", "Nobody in control"),
        (1., "ok", "TCP in control"),
        (2., "ok", "UDP in control"),
        (101., "info", "CLI in control"),
        (102., "info", "USB in control"),
    ];
    let widget = |kind: WidgetKind, label: &str| {
        let mut w = Widget::new(kind);
        w.label = label.into();
        w
    };

    // Each kind: its name, what it is for, and a live example.
    let mut items: Vec<(&str, &str, Widget)> = vec![];

    let mut w = widget(WidgetKind::ValueRead, "Packets received");
    w.binding = Some(sys("DS_PACKET_COUNT"));
    w.decimals = 0;
    items.push((
        "Value Readout",
        "One value, large and borderless; it can also scale by a factor.",
        w,
    ));

    let mut w = widget(WidgetKind::Gauge, "Protocol errors");
    w.binding = Some(sys("DS_ERROR_COUNT"));
    w.max = 100.;
    w.thresholds = vec![
        rule(">=", 50., "error", "Many errors"),
        rule(">=", 1., "warn", "Errors"),
    ];
    items.push(("Gauge", "A value on an arc, coloured by its limits.", w));

    let mut w = widget(WidgetKind::ProgressBar, "Uptime, first hour");
    w.binding = Some(sys("COUNTER_1HZ"));
    w.max = 3600.;
    w.unit = "s".into();
    items.push((
        "Progress Bar",
        "A value between a minimum and a maximum.",
        w,
    ));

    let mut w = widget(WidgetKind::StateLed, "Control interface");
    w.binding = Some(sys("CONTROL_INTERFACE"));
    w.thresholds = control_states
        .iter()
        .map(|(v, role, label)| rule("==", *v, role, label))
        .collect();
    items.push((
        "State LED",
        "A lamp in the colour of the matching state.",
        w,
    ));

    let mut w = widget(WidgetKind::StatusMatrix, "Packet count, low bits");
    w.binding = Some(sys("DS_PACKET_COUNT"));
    w.bit_count = 16;
    items.push(("Status Matrix", "The bits of a word, lit when set.", w));

    let mut w = widget(WidgetKind::Button, "Write 1 to PLACEHOLDER");
    w.binding = Some(placeholder());
    w.value = "1".into();
    w.confirm = true;
    items.push(("Button", "Writes a value or sends a command.", w));

    let mut w = widget(WidgetKind::Dropdown, "PLACEHOLDER");
    w.binding = Some(placeholder());
    w.options = [("0", "Off"), ("1", "On"), ("2", "Auto")]
        .into_iter()
        .map(|(value, label)| ValueLabel {
            value: value.into(),
            label: label.into(),
        })
        .collect();
    w.confirm = true;
    items.push(("Dropdown", "Picks one of a few named values.", w));

    let mut w = widget(WidgetKind::ValueWrite, "PLACEHOLDER");
    w.binding = Some(placeholder());
    w.value = String::new();
    w.min = 0.;
    w.max = u32::MAX as f64;
    w.decimals = 0;
    w.confirm = true;
    items.push(("Value Write", "Types a value and writes it.", w));

    let mut w = widget(WidgetKind::DirectionalControl, "Example commands");
    w.directions = [("left", 2, "Left"), ("right", 3, "Right")]
        .into_iter()
        .map(|(direction, command, label)| DirectionTarget {
            direction: direction.into(),
            command,
            label: label.into(),
        })
        .collect();
    w.confirm = true;
    items.push(("Directional Control", "Sends a command per direction.", w));

    let mut w = widget(WidgetKind::DataTable, "Library registers");
    w.rows = [
        "DS_PACKET_COUNT",
        "DS_ERROR_COUNT",
        "CONTROL_INTERFACE",
        "COUNTER_1HZ",
    ]
    .into_iter()
    .map(sys)
    .collect();
    for (name, label) in [
        ("DS_PACKET_COUNT", "Packets"),
        ("DS_ERROR_COUNT", "Errors"),
        ("CONTROL_INTERFACE", "Control"),
        ("COUNTER_1HZ", "Seconds"),
    ] {
        w.row_styles.insert(
            name.into(),
            RowStyle {
                label: label.into(),
                ..Default::default()
            },
        );
    }
    items.push(("Data Table", "Several values in aligned rows.", w));

    let mut w = widget(WidgetKind::AlarmList, "Link health");
    w.rows = vec![sys("DS_ERROR_COUNT"), sys("CONTROL_INTERFACE")];
    w.thresholds = vec![rule(">", 0., "warn", "Errors")];
    w.row_styles.insert(
        "CONTROL_INTERFACE".into(),
        RowStyle {
            label: "Control".into(),
            format: DisplayFormat::Decimal,
            thresholds: vec![
                rule("==", 0., "warn", "Nobody in control"),
                rule("!=", 0., "ok", "Held"),
            ],
        },
    );
    items.push(("Alarm List", "Rows that warn by rule.", w));

    let mut w = widget(WidgetKind::DeviceInfo, "Device");
    w.binding = None;
    items.push((
        "Device Info",
        "The connected device and who controls it.",
        w,
    ));

    let mut readout = widget(WidgetKind::ValueRead, "Errors");
    readout.binding = Some(sys("DS_ERROR_COUNT"));
    readout.decimals = 0;
    let mut lamp = widget(WidgetKind::StateLed, "UDP control");
    lamp.binding = Some(sys("CONTROL_INTERFACE"));
    lamp.thresholds = led_states(2., "Held", "Not held", &[]);
    let container = group(
        "Group",
        column(
            vec![
                Block::fit(readout, INNER - PADDING * 2.),
                Block::fit(lamp, INNER - PADDING * 2.),
            ],
            GAP,
        ),
    )
    .into_widgets()
    .remove(0);
    items.push(("Container", "Groups widgets under a title.", container));

    let mut w = widget(WidgetKind::MiniPlot, "Uptime");
    w.binding = Some(sys("COUNTER_1HZ"));
    w.time_span = 60.;
    items.push(("Mini-Plot", "A short trend of one value.", w));

    let mut w = widget(WidgetKind::Label, "");
    w.label = "Labels are plain text for headings, notes and instructions.".into();
    items.push(("Label", "Text with no border.", w));

    // Every kind appears exactly once.
    debug_assert_eq!(items.len(), WidgetKind::ALL.len());

    let cards = items
        .into_iter()
        .map(|(title, about, w)| {
            let mut note = Widget::new(WidgetKind::Label);
            note.label = about.into();
            let example = if w.kind == WidgetKind::Container {
                // Room for a nested group's own title row.
                let height = w.height + 16.;
                Block::sized(w, INNER, height)
            } else if w.kind == WidgetKind::MiniPlot {
                Block::sized(w, INNER, 150.)
            } else {
                Block::fit(w, INNER)
            };
            group(title, column(vec![Block::fit(note, INNER), example], GAP))
        })
        .collect();
    let mut heading = Widget::new(WidgetKind::Label);
    heading.label = "Widget showcase".into();
    heading.text_size = 1.6;
    heading.bold = true;
    let mut intro = Widget::new(WidgetKind::Label);
    intro.label = "Every widget kind, bound to the datastream library's system registers \
                   so it shows live values on any device. Writes go to PLACEHOLDER and ask \
                   first. Turn on Edit dashboard to see how each one is configured."
        .into();
    let widgets = column(
        vec![
            Block::fit(heading, WIDTH),
            Block::fit(intro, WIDTH),
            grid(cards, 4, SECTION),
        ],
        GAP,
    )
    .into_widgets();
    Dashboard {
        id: ID.into(),
        name: "Widget showcase".into(),
        widgets,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn showcase_has_every_kind_and_valid_bindings() {
        let p = default_profiles().remove(0);
        let d = dashboard(&p);
        fn walk(widgets: &[Widget], p: &Profile, kinds: &mut Vec<WidgetKind>) {
            for w in widgets {
                kinds.push(w.kind);
                for b in w.binding.iter().chain(&w.rows) {
                    assert!(b.matches(p), "{} binding {}", w.label, b.name);
                }
                walk(&w.children, p, kinds);
            }
        }
        let mut kinds = vec![];
        walk(&d.widgets, &p, &mut kinds);
        for kind in WidgetKind::ALL {
            assert!(kinds.contains(&kind), "{kind:?} missing");
        }
        // Writes only ever target PLACEHOLDER, never a system register.
        fn writes(widgets: &[Widget]) -> Vec<&Binding> {
            widgets
                .iter()
                .flat_map(|w| {
                    let own = w.binding.iter().filter(move |_| {
                        matches!(
                            w.kind,
                            WidgetKind::Button | WidgetKind::Dropdown | WidgetKind::ValueWrite
                        )
                    });
                    own.chain(writes(&w.children))
                })
                .collect()
        }
        assert!(writes(&d.widgets).iter().all(|b| b.name == "PLACEHOLDER"));
    }
}
