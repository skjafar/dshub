# Quick start

Install Rust 1.89+ and run:

```sh
cargo run --locked
```

For testing without hardware, start the emulator in another terminal:

```sh
python3 emulator/dshub_emulator.py
```

Enter `127.0.0.1`, select TCP, click Connect, then Take Control. Choose the CNC Motor Controller Profile.

- Registers / Parameters: search, Read, enable Live refresh, inspect values, or write a writable entry.
- System Registers: read the protocol library's status, control state and uptime.
- Commands: send a named command with an optional integer argument; the device's acknowledgement or refusal appears in the status and Activity Log.
- Plot: add a trace with the Plot button in a data table. Pause, pan/zoom or export CSV.
- Dashboard: enable Edit dashboard, add Widgets and configure bindings, dimensions and thresholds. Drag the widget's handle or use arrows to reorder.
- Map Editor: edit a draft and Save Profile. Review bindings affected by moved or changed entries.
- Panes menu: reopen panes or reset the layout. Right-click a tab to focus it or move it into a native window.
- Profiles: duplicate, rename, import and export maps and dashboards.
- Workspaces: save and restore pane arrangements per Profile.

Build the standalone executable with `cargo build --locked --release`. See [BUILDING.md](BUILDING.md) for platform dependencies and packaging.
