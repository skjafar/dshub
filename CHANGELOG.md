## 0.3.0 (unreleased) - Native Rust interface

- Rebuild the application with egui/eframe and an in-process Tokio backend.
- Port device panes, plots, dashboards, Profiles, map editing, binding review, native windows and Workspaces to Rust.
- Add Cargo-only builds, native release archives, emulator integration and desktop smoke checks.
- Preserve the previous implementation as a migration reference; defer the separate backend review.
- Fix discovered MAC addresses (read after the reserved field) and connect on the ports a Device reports; accept `IP:port` addresses.
- Keep TCP response framing aligned when a request times out mid-frame.
- Decide write outcomes from the acknowledgement status and read the value back, instead of treating the write response as a reading.
- Never drop connection, acknowledgement or error events when the event queue is full.
- Disconnect (and Cancel while connecting) takes effect immediately and discards device requests queued for the old connection.
- Jog controls require Control and keep at most one step in flight, so releasing the button stops queued motion.
- Back up unreadable saved settings instead of silently replacing them with defaults.
- Show device-action confirmations as a modal in every window; open file dialogs without blocking the interface.
- Expanding Map Editor metadata no longer marks the draft as changed.
- Reconnect with exponential backoff and bounded connect time; set `TCP_NODELAY`; verify UDP devices answer before reporting a connection; support IPv6 and host names.
- Correlate responses by their echoed operation code, so a late reply cannot acknowledge a different request; tolerate malformed UDP datagrams and Windows UDP resets.
- Explain when Control is taken by another interface and when a restored connection needs Control again.
- Repaint on device events instead of a 20 Hz timer; cache parsed maps with indexed lookups; stop copying the Profile every frame; virtualise the Activity log; thin plot traces while keeping extremes.
- Keep plot histories only for plotted addresses. Pause freezes one Plot pane while recording continues, and following live fits the Y axis.
- Settings apply immediately, use numeric fields and allow an unlimited request rate. Custom commands accept codes 0–64999.
- Deleting Profiles, Workspaces or dashboards and resetting the layout need a confirming click. Duplicated Profiles get unique names and empty names are flagged.
- Threshold comparators, colour roles, directions and data types are typed. Row conditions use the same constrained editor as widget thresholds.
- Map Editor drafts are no longer stored in layouts or Workspaces. Map errors quote the offending line.
- Mini-plots no longer capture dashboard drags or scrolling.
- Remove unused Tauri-era commands and the `base64` dependency. CI lints all features and runs the emulator integration test on Linux.
- Visual redesign: tonal dark and light themes with a restrained cyan accent; bundled Inter (tabular figures) and JetBrains Mono.
- One-row toolbar with a device chip that shows connection, transport and Control, and opens a connection panel listing discovered devices.
- Messages appear as toasts by severity and are kept in the Activity log.
- Registers, Parameters and System Registers are tables with headers, resizable columns, units, status and in-place editing (double-click or Edit, Enter to write, Esc to cancel).
- Activity log is a filterable table with local times; plots use clock-time axes, read-outs on hover and an empty state.
- Dashboard widgets: cards by depth, fitted read-outs, arc gauge with limits, level bars, lamps, bit grid, inline value writes, dropdowns that show the current option, and a quiet status dot.
- Widget configuration is grouped into labelled sections. Overview, Inspector, Commands, Profiles, Preferences, Workspaces and Guide are redesigned.
- The connection heartbeat shares the request rate limit with every other request.
- Settings are written only after input, window moves or imports, instead of serialised every 5 s while idle. The Map Editor no longer regenerates its map every frame, and imported rows reach the draft immediately.
- Removing a dashboard widget or a plot trace shows a toast with Undo.
- Register and Parameter panes add a DEFAULT view, now the default for new panes: each entry is shown in its declared type (integers in decimal, floats as floats, hex entries in hexadecimal).
- The Activity log records successful register and parameter reads and writes, polled reads with polling start and stop, and plot traces starting or stopping recording, each under its own category. Previously only failures and packet dumps appeared.
- The emulator accepts `--host` to serve other machines; discovery reports the address that reaches the client.

# Changelog

All notable changes to DSHub.

## [0.2.4] - 2026-07-26

- Added `CHANGELOG.md` to document the application release history.
- Added a digit-editable "thumbwheel" numeric input (`ThumbwheelInput`) — click a digit to highlight it, use Up/Down to step it odometer-style, Shift+Left/Right to move the highlight (growing decimal precision on floats) — and rolled it out to every write field: Parameters Panel, Registers Panel, the Data Edit dialog, the Sys Command panel, and the Data Table widget.
- Added optional scientific notation display to the Value Read, Gauge, Progress Bar, Encoder Display, System Info, Data Table, and Alarm List widgets, with automatic scientific notation for very small float magnitudes regardless of the configured display mode.
- Data Table widget: rewrote to auto-detect per-row writability from the device map (parameters are always writable; registers depend on `accessPermit`), with inline write cells, min/max/step validation, and an optional write-confirmation dialog.
- Fixed float register/parameter values being plotted, aggregated into statistics, and exported to CSV as raw IEEE-754 bit patterns instead of their decoded value (Plot Panel).
- Fixed the widget address autocomplete losing in-progress search text while live device data was updating (Widget Config Dialog).
- Fixed plot polling tasks silently stopping on a device reconnect instead of resuming.
- Added `build.bat` for building and packaging DSHub on Windows.
