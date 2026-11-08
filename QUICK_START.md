# Quick start

Install Rust 1.95+ and run:

```sh
cargo run --locked
```

For testing without hardware, start the emulator in another terminal:

```sh
python3 emulator/dshub_emulator.py
```

Enter `127.0.0.1`, select TCP, click Connect, then Take Control. Choose the CNC Motor Controller Profile.

- Registers / Parameters: search, Read, enable Live refresh and inspect values. Double-click a writable value to edit it; Enter writes, Esc discards. Unsent values stay outlined.
- System Registers: read the protocol library's status, control state and uptime.
- Commands: send a named command with an optional integer argument; the device's acknowledgement or refusal appears in the status and Activity Log.
- Plot: add a trace with the Plot button in a data table. Hover for a read-out of every trace; Pause, pan/zoom, export PNG or CSV, or Record readings to CSV and replay them later.
- Activity log: filter by level and source, Pause the view while activity is still collected, and select a packet to decode it.
- Dashboard: enable Edit dashboard, add Widgets and configure bindings, dimensions and thresholds. Widgets snap to a grid; drag, resize, nudge with the arrow keys and undo/redo layout changes.
- Map Editor: edit a draft and Save Profile. Changed fields stay outlined until saved. Review bindings affected by moved or changed entries.
- Panes menu: reopen panes or reset the layout. Right-click a tab to focus it or move it into a native window.
- Profiles: create, duplicate, rename, delete, import and export maps and dashboards.
- Workspaces: save and restore pane arrangements per Profile.
- Ctrl+K opens the command palette; `/` focuses search.

Build the standalone executable with `cargo build --locked --release`. See [BUILDING.md](BUILDING.md) for platform dependencies and packaging.
