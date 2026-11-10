## [0.3.1] - 2026-11-10 - Dashboard redesign

- Dashboard edits are a draft saved with Save or discarded with Revert; changed widgets are outlined as in the Map Editor, and leaving edit mode, switching dashboards or closing the pane waits until the draft is saved or reverted.
- The Default Profile has a Widget showcase dashboard with every widget kind under a caption, bound to the library's system registers so it shows live values on any device; writes go to PLACEHOLDER and ask first. Existing settings gain it once, appended to the Default Profile's dashboards. The Status Matrix no longer clips its last column at narrow widths.
- Label widget: borderless text on a dashboard. It is kept in the Profile's native dashboards; the version-one dashboard section, read by the former application, leaves it out.
- Value Readout, State LED, Dropdown, Progress Bar, Value Write, Button and Label widgets have no card border. Any widget's label is optional (an empty label drops the title row unless the reading needs attention), a State LED whose states have no labels shows only its lamp, Progress Bar and Value Write can hide their value text, and every widget has an adjustable text size.
- Directional Control buttons sit on a 3×3 compass grid: north at the top, diagonals in the corners, the centre empty; rows without a direction are left out. The CNC Operator dashboard has one Jog pad beside the Machine group (Y+ north, Y− south, X+ east, X− west, Z+ north-east, Z− south-west) with the jog step, instead of a jog control in each axis group.
- The LED Indicator is merged into the State LED, configured only by its states. Dashboards and version-one Profiles with an LED Indicator load it as a State LED: its on value becomes a state with its On label and colour, and its Off label a grey state for every other value. Exports write it as a State LED.
- Threshold colours are chosen from swatches: grey, red, yellow and green, blue and cyan (all following the theme), four extra colours, or any colour from a picker. A chosen colour keeps the rule's role, which Profiles also export for readers without colours.
- Button labels are centred.
- Redesigned bundled dashboards: CNC Operator, Trends and Tuning, and the Widget showcase, are laid out on a regular grid with titled groups of equal height, widgets sized to their content and no clipped values. The CNC Tuning panel lists every parameter in per-axis tables with readable names. Settings that hold the earlier layouts receive the new ones once; Profiles whose maps were changed, and dashboards of your own, are left as they are.
- Data Table and Alarm List rows are aligned columns: a status dot (with text only when a reading needs attention), name, value, unit and, for writable rows, the input and Write button. Alarm rows show their state label.
- Borderless widgets shrink to one line of text (24 px); State LED and Encoder Display shrink to one line inside their card.
- Button and Directional Control commands are picked from the Profile's command list, or entered as a custom code.
- The emulator listens on all network interfaces by default, so other machines can connect; `--local` keeps it on loopback. Discovery replies advertise the local address that routes to the requesting machine.

## [0.3.0] - 2026-11-08 - Native Rust interface

- Rebuild the application with egui/eframe and an in-process Tokio backend.
- Port device panes, plots, dashboards, Profiles, map editing, binding review, native windows and Workspaces to Rust.
- Add Cargo-only builds, native release archives, emulator integration and desktop smoke checks.
- Remove the former Tauri/React application (`client/`, `src-tauri/`); its sources are kept at the `tauri-reference` tag. Defer the separate backend review.
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
- Registers, Parameters and System Registers are tables with headers, resizable columns, units, status and in-place editing (double-click or Edit, Enter to write, Esc to discard). Values not yet sent stay outlined until written or discarded.
- Activity log is a filterable table with local times; plots use clock-time axes, read-outs on hover and an empty state.
- Dashboard widgets: cards by depth, fitted read-outs, arc gauge with limits, level bars, lamps, bit grid, inline value writes, dropdowns that show the current option, and a quiet status dot.
- Widget configuration is grouped into labelled sections. Overview, Inspector, Commands, Profiles, Preferences, Workspaces and Guide are redesigned.
- The connection heartbeat shares the request rate limit with every other request.
- Settings are written only after input, window moves or imports, instead of serialised every 5 s while idle. The Map Editor no longer regenerates its map every frame, and imported rows reach the draft immediately.
- Removing a dashboard widget or a plot trace shows a toast with Undo.
- Register and Parameter panes add a DEFAULT view, now the default for new panes: each entry is shown in its declared type (integers in decimal, floats as floats, hex entries in hexadecimal).
- Engineering units: map metadata can declare scale, offset and write limits. Tables (DEFAULT view), the Inspector, plots and widgets show scaled values; writes outside the limits are refused, and confirmations show the device value next to the new one.
- Critical commands (Write Flash, Reset Firmware, or any Profile command marked critical) always ask, with a press-and-hold confirm. Confirmations name the command and device.
- Plots: crosshair read-out of every trace at the pointer, PNG export, and recording every reading to CSV with offline replay.
- Map Editor outlines every field that differs from the saved Profile until it is saved.
- Window titles, the main window's included, name the device and Profile. A daughter window closes when its last pane is closed or moved away.
- Manage Profiles can create empty Profiles, rename any Profile and delete any Profile but the last.
- Activity log: source filter, a Pause that holds the entries shown while new activity is still collected, and a packet inspector that decodes the selected frame.
- Connection panel: recent devices and Connect + Take Control. The device chip warns about unauthenticated connections (UDP, or outside a private network).
- Live tables poll only the rows in view. Ctrl+K opens a command palette; `/` focuses search.
- Status Matrix: bit names from map metadata and 8/16/32-bit layouts. Custom-drawn widgets have accessibility labels.
- Dashboard editing: visible grid with snapping, click and Ctrl/Shift-click selection, arrow-key nudge, Delete, and layout undo/redo.
- Phosphor icon font replaces Unicode symbols.
- Daughter window titles name the device and Profile; windows restored onto a missing monitor move next to the main window.
- Warnings, errors and crash reports are written to a log folder (Preferences > Logging > Open log folder).
- Profiles are stored as separate files; saved settings carry a schema version with migrations.
- Protocol conformance vectors (`tests/protocol-vectors.json`) run against the emulator in CI. PROTOCOL.md lists every status code.
- CI signs Windows builds and signs and notarizes a macOS app bundle when certificates are configured. The AUR recipe targets the native 0.3.0 release.
- The Activity log records successful register and parameter reads and writes, polled reads with polling start and stop, and plot traces starting or stopping recording, each under its own category. Previously only failures and packet dumps appeared.
- The emulator accepts `--host` to serve other machines; discovery reports the address that reaches the client.
- Match the datastream library: accept `READ_REGISTER_OK` for system register reads (the heartbeat failed against real devices), read the discovery MAC at offset 20, take the control state from the requested interface, and name every library status code. The emulator answers as the library does and PROTOCOL.md was rewritten from the library sources.
- Update to egui/eframe 0.36, egui_dock 0.21, egui_plot 0.37, egui-phosphor 0.14, rfd 0.18 and if-addrs 0.15. Rust 1.95 or newer is required.

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
