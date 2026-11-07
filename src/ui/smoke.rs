//! Opt-in native smoke fixture. Uses the real emulator, never simulated readings.
use super::*;
impl Desktop {
    pub fn configure_smoke(&mut self, scene: &str) {
        println!("SMOKE_SCENE:{scene}");
        self.saved = Saved::default();
        self.saved.active = "cnc_motor_controller".into();
        self.active_profile = self.saved.active.clone();
        self.saved.preferences.poll_ms = 100;
        let kind = match scene {
            "dashboard" | "cnc" | "cnc-edit" => PaneKind::Dashboard,
            "parameters" => PaneKind::Parameters,
            "system" => PaneKind::System,
            "commands" => PaneKind::Commands,
            "inspector" => PaneKind::Inspector,
            "log" => PaneKind::Log,
            "plot" => PaneKind::Plot,
            "editor" => PaneKind::MapEditor,
            _ => PaneKind::Registers,
        };
        let mut pane = Pane::new(kind);
        pane.auto = true;
        pane.editing = scene == "cnc-edit";
        let profile = &mut self.saved.profiles[1];
        for kind in WidgetKind::ALL
            .into_iter()
            .filter(|_| !matches!(scene, "cnc" | "cnc-edit"))
        {
            let writable = matches!(
                kind,
                WidgetKind::ValueWrite | WidgetKind::Button | WidgetKind::Dropdown
            );
            let entry = profile.entries(Space::Register)[if writable { 10 } else { 0 }].clone();
            let mut widget = Widget::new(kind);
            widget.binding = Some(Binding::new(Space::Register, &entry));
            widget.width = 300.;
            widget.height = 130.;
            widget.rows.push(Binding::new(Space::Register, &entry));
            widget.directions.push(DirectionTarget {
                direction: "up".into(),
                command: 20,
                label: "Jog X +".into(),
            });
            widget.options.push(ValueLabel {
                value: "0".into(),
                label: "Zero".into(),
            });
            if kind == WidgetKind::Container {
                let mut child = Widget::new(WidgetKind::ValueRead);
                child.binding = widget.binding.clone();
                widget.children.push(child);
            }
            profile.dashboards[0].widgets.push(widget);
        }
        let entry = profile.entries(Space::Register)[0].clone();
        self.session.selection = Some((Space::Register, entry.clone()));
        self.saved.series.push(PlotSeries {
            id: unique_id(),
            binding: Binding::new(Space::Register, &entry),
            enabled: true,
        });
        if kind == PaneKind::Plot {
            pane.plot_series = self.saved.series.iter().map(|s| s.id.clone()).collect();
        }
        self.saved.dock = DockState::new(vec![pane]);
        if scene == "native-window" {
            self.saved.windows.push(NativeWindow {
                id: "smoke-daughter".into(),
                title: "Native Monitor".into(),
                dock: DockState::new(vec![Pane::new(PaneKind::Overview)]),
                position: None,
                size: [1000., 700.],
            });
        }
        if scene == "review" {
            profile.registers_map = format!("uint32_t INSERTED;\n{}", profile.registers_map);
            self.review_open = true;
        }
        self.session
            .send(Action::Connect("127.0.0.1".into(), false));
        self.session.send(Action::Control);
    }
}
