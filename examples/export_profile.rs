//! Generate a portable Profile containing all native Widget kinds.
use dshub::model::*;
fn main() {
    if let Some(path) = std::env::args().nth(1) {
        let text = std::fs::read_to_string(path).expect("Profile file");
        let profile = Profile::import(&text).expect("Valid Profile");
        println!(
            "{}",
            serde_json::to_string_pretty(&profile.export()).unwrap()
        );
        return;
    }
    let mut p = default_profiles().remove(1);
    for kind in WidgetKind::ALL {
        let mut w = Widget::new(kind);
        let e = p.entries(Space::Register)[if matches!(
            kind,
            WidgetKind::Button | WidgetKind::Dropdown | WidgetKind::ValueWrite
        ) {
            10
        } else {
            0
        }]
        .clone();
        w.binding = Some(Binding::new(Space::Register, &e));
        w.rows.push(Binding::new(Space::Register, &e));
        w.directions.push(DirectionTarget {
            direction: "up".into(),
            command: 20,
            label: "Jog".into(),
        });
        p.dashboards[0].widgets.push(w);
    }
    println!("{}", serde_json::to_string_pretty(&p.export()).unwrap());
}
