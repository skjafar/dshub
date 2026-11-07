# DSHub native application — static analysis

Date: 2026-11-07 · Branch: `codex/egui-rebuild` @ `6a25af9` · Scope: whole root crate (`src/`, ~10.2k lines), emulator, docs, CI.

Method: read-only code review. I didn't build, run, profile or test anything. Performance findings come from reading the code paths and estimating their cost. Severity: **P0** = safety or data loss; **P1** = wrong behaviour users will hit; **P2** = noticeable quality, performance or UX problem; **P3** = polish or hygiene.

---

## 1. Executive summary

The port has a good architecture. A single Tokio session actor owns all I/O. egui never awaits the network. Binding identity and drift review are modelled explicitly. Write outcomes are never shown optimistically. System registers are blocked from writes at three layers. Much of the backend comments explain *why* a guard exists, which is rare and valuable.

The main weaknesses are elsewhere:

1. **Machine-safety gaps on the command path (CNC).** Commands share a FIFO queue with polling, jog repeats can pile up behind it, and nothing gives E-stop priority.
2. **Silent data-loss risk in persistence.** One schema mismatch resets every Profile and dashboard to defaults.
3. **Real protocol bugs:** MAC parsing is off by two bytes, discovered ports are ignored, TCP framing can be lost on a timeout, and write confirmation depends on emulator behaviour that the spec contradicts.
4. **Performance scales badly with map size.** The map text is re-parsed with a regex on almost every lookup, several times per widget per frame, and the app repaints at 20 Hz even when idle.
5. **The UI is functional but looks like a stock egui demo.** It uses default visuals, row-of-buttons tables with no headers, forms inside menus, unlabeled config fields, Unix-epoch time axes and a non-modal confirm dialog. The design direction in CLAUDE.md (tonal hierarchy, cyan accent, stable numeric alignment) is mostly not implemented yet.

---

## 2. Good practices worth keeping

| Area | What is done well | Where |
|---|---|---|
| Concurrency boundary | The UI sends `Action`s over an unbounded channel to one actor and never awaits I/O. | `src/ui/session.rs` |
| Response correlation | Address-echo checks discard stale frames and resync, and the reason is documented. | `communicator.rs` `response_matches` |
| Status semantics | `status_ok` (≥0) is documented against the earlier bug where refused writes showed as success. | `communicator.rs` |
| Hot-path logging | A lock-free `LogFilter` (atomics) skips hex-dump formatting when packet logs are off. | `types.rs` |
| Tick behaviour | `MissedTickBehavior::Delay` on every poll, plot and heartbeat ticker avoids bursts after a stall. | `commands.rs`, `poll.rs` |
| Reconnect races | The stop token is replaced, not reset, so an old reconnect loop can't revive itself. | `commands.rs` `connect_device` |
| Poll coalescing | Reference-counted subscriptions use the fastest-interval rule, with pure bookkeeping kept apart from the task code and unit-tested. | `poll.rs` |
| Interest diffing | The UI rebuilds the wanted set each frame and sends only the diff. | `session.rs` `sync` |
| Binding identity | Bindings carry name/type/array-size/address. Drift stops polling and writes, and the review covers nested containers and plot series. | `model.rs`, `review.rs` |
| Outcome model | `Sending / Confirmed / Refused / Unknown`. Disconnect turns pending into Unknown, never into success. | `session.rs` |
| Read-only system registers | Enforced in the UI, in `Session::write_raw`, in the actor (`Action::Write` refuses SysRegister) and in the map editor. | multiple |
| Status not by colour alone | Every status badge carries a text label ("Stale", "Cached · offline", "Read failed"). | `colors.rs` |
| Virtualised lists | `show_rows` is used in entry tables and the binding picker. | `panes.rs`, `widgets.rs` |
| Glyph coverage test | A test asserts that every UI symbol exists in the bundled fonts. | `fonts.rs` |
| Tooling discipline | `--locked`, fmt check, clippy `-D warnings`, a cross-OS CI matrix, an opt-in smoke feature kept out of release. | `.github/workflows/build.yml` |
| Format compatibility | Version-one Profile import/export with round-trip tests for all 16 widget kinds. | `profile_compat.rs` |
| Documented platform workaround | vsync is disabled on Wayland, with the reason stated. | `main.rs` |

---

## 3. Backend and Ethernet interfacing

### 3.1 Confirmed bugs

| # | Sev | Issue | Evidence | Fix |
|---|---|---|---|---|
| B1 | **P1** | **MAC address parsed from the wrong offset.** PROTOCOL.md and the emulator put 2 reserved bytes at 20–21 and the MAC at 22–27. The parser reads 20–25, so the emulator's `02:00:00:00:00:01` displays as `00:00:02:00:00:00`. | [scanner.rs:123](../../src/backend/scanner.rs:123), `emulator/dshub_emulator.py:633` | Read `data[22..28]`. Add a parse test built from the emulator's `struct.pack` layout. |
| B2 | **P1** | **Discovered TCP/UDP ports are ignored.** `connect_device` always uses 2009/2011. Devices that report other ports can't be reached. | [scanner.rs:117](../../src/backend/scanner.rs:117), `commands.rs` `connect_device` | Carry `DiscoveredDevice` (or the port) into `Action::Connect`. Allow a manual `ip:port` entry. |
| B3 | **P1** | **TCP framing can break permanently on a timeout.** `timeout(remaining, stream.read_exact(..))`: `read_exact` is not cancel-safe. If the deadline fires after 1–7 bytes arrived, those bytes are dropped and every later frame is shifted. Address checks then discard everything until 3 timeouts force a reconnect. | [communicator.rs:541](../../src/backend/communicator.rs:541) | Keep a persistent `BytesMut`/`[u8; 8]` with a fill index outside the timeout, or use `tokio_util::codec::FramedRead` with a fixed-length decoder. |
| B4 | **P1** | **The spec and the emulator disagree on the write-response value, and the UI depends on the emulator.** PROTOCOL.md says the response value is "zero on writes". The emulator echoes the written value. `Session::drain` confirms a write only when `r.value == expected`. Against spec-compliant firmware, writes would sit in "Sending…" and become "Unknown" even though the device returned `WRITE_OK`. | [session.rs:408](../../src/ui/session.rs:408), PROTOCOL.md §Response | Decide the contract. If the status code is authoritative, confirm on `status_ok`. Optionally verify with a follow-up read. Align the emulator to the spec. |
| B5 | **P1** | **Write responses overwrite the live reading.** The write arm emits `registerUpdate` with the response value, and `drain` stores it in `readings` and pushes it into the plot history. With spec firmware (value 0), every write makes the readout flash `0` and adds a false `0` sample. A refused write stores `valid: false`, so the cell shows "Error" until the next poll. | [session.rs:432](../../src/ui/session.rs:432), `communicator.rs` arms 2/4 | Emit a separate `WriteAck` event. Never feed write echoes into `readings` or `histories`. |
| B6 | **P2** | **Command responses are accepted without correlation.** `response_matches` returns `true` for type 0. A late read reply (status 1, any address) can be taken as the answer to a pending command and mark it "acknowledged". | [communicator.rs:243](../../src/backend/communicator.rs:243) | The protocol echoes the op code in a positive status, so require `status == req.command as i16 \|\| status < 0` for every request type. That is cheap and catches most stale frames. |
| B7 | **P2** | **One malformed UDP datagram drops the connection.** A short datagram from the device returns `Err` and is treated as fatal, which triggers a reconnect. | [communicator.rs:648](../../src/backend/communicator.rs:648) | Log it, discard it and keep waiting until the deadline. |
| B8 | **P2** | **UDP source check compares strings.** `src.ip().to_string() != remote_ip` fails for hostnames, zero-padded input, or IPv4-mapped IPv6. It also allocates on every datagram. | [communicator.rs:644](../../src/backend/communicator.rs:644) | Resolve once to a `SocketAddr` at connect time and compare `SocketAddr`s. Better still, `connect()` the UDP socket so the kernel filters by source. |
| B9 | **P2** | **The reconnect loop has no connect timeout.** On Linux, `TcpStream::connect` to a dead host can block about 2 minutes (SYN retries). Only the first connect is wrapped in 5 s by the session. | [commands.rs:203](../../src/backend/commands.rs:203) | Wrap it in `timeout(3–5 s)`. Use exponential backoff with jitter. |
| B10 | **P2** | **`TCP_NODELAY` is not set.** Small 8-byte stop-and-wait frames can hit Nagle/delayed-ACK interactions (40–200 ms stalls with lwIP stacks). | `commands.rs` connect paths | `stream.set_nodelay(true)` after connect. |
| B11 | **P2** | **User commands (type ≥ 100) produce no typed response event.** The `_` arm only logs, so any caller waiting on an outcome times out to Unknown. | `communicator.rs` `process_response` | Emit `commandResponse` for every command type. |
| B12 | **P3** | Status `-4` (ADDRESS_OUT_OF_RANGE, used by the emulator) shows as `UNKNOWN`. | `communicator.rs` `status_name` | Add the full status table to PROTOCOL.md and to `status_name`. |
| B13 | **P3** | IPv6 literals break `format!("{ip}:{port}")`. Hostname input works for TCP but not UDP (see B8). | connect paths | Parse into `SocketAddr`. Show validation in the connect form. |
| B14 | **P3** | Windows: an ICMP port-unreachable makes the UDP `recv_from` return `ConnectionReset` (WSAECONNRESET). This is treated as fatal. | UDP communicator | Ignore `ConnectionReset` on UDP sockets on Windows. |

### 3.2 Design and robustness issues

* **P0 — No priority lane for safety commands.** Writes, commands, polls, plots and the heartbeat all share one FIFO `mpsc(100)` with stop-and-wait I/O and 5 s timeouts. With 100 polls queued and a 2 ms RTT, an E-stop waits about 200 ms. During a device stall it can wait 5–15 s, or be lost when the communicator exits. For a CNC operator UI that is a hazard. Recommended:
  * Use two channels, *control* (writes and commands) and *telemetry* (polls), and `tokio::select!` with `biased;` so control frames always go first.
  * Mark E-stop / "disable motors" commands in the profile as `priority: critical`. Send them immediately, ahead of any queued work, and optionally flush the telemetry queue first.
  * Give each command an outcome deadline counted from when it is *sent*, not when it is enqueued.
* **P0 — Jog can keep moving the machine after the button is released.** `DirectionalControl` re-sends a discrete jog command every 0.15 s while the pointer is held ([widgets.rs:1102](../../src/ui/widgets.rs:1102)). Each one queues behind telemetry. After release, jogs already in the queue still run, so the machine keeps moving. The button is also enabled on `connected()` instead of `controlled()` (line 1093), unlike every other control. Recommended: coalesce jogs (at most one in flight), drop queued jogs on release, and prefer a firmware "jog start / jog stop" pair with a dead-man timeout on the device.
* **P1 — The serial session actor can block Disconnect.** The actor awaits each action in turn. `queue_request` awaits the rate limiter *and* `tx.send()` on a full channel, and `AutoConnect` sleeps between retries. So "Read visible" on a large table, a slow rate limit (the UI allows 1 req/s) or an auto-connect retry loop delays Disconnect, Scan and Take Control by seconds to minutes. Handle `Disconnect` out of band (a `CancellationToken` or a separate watch channel), and spawn long operations instead of awaiting them inside the loop.
* **P1 — The event queue is lossy and carries everything.** `runtime::AppHandle` keeps one `VecDeque` capped at 20 000 and drops the oldest when full ([runtime.rs:46](../../src/runtime.rs:46)). State transitions (`connectionStatus`, `disconnected`, `commandResponse`) share it with high-rate data and packet logs. With the window minimised or packet logging on, a dropped `connectionStatus` leaves the UI showing "Connected" forever. Split it into a lossless *control* channel and a bounded, coalescing *telemetry* store, for example a `HashMap<(Space, u16), Reading>` where only the newest value matters.
* **P2 — Events carry stringly-typed JSON from the Tauri era.** Each event does `serde_json::to_value` on the backend and `from_value` in `drain`, with a `String` name. At 1 000 req/s that is thousands of JSON trees per second for nothing. Replace it with `enum BackendEvent { Reading{..}, WriteAck{..}, Connection(..), Log(..), .. }`. The Tauri commands in `commands.rs` can go too (`save_pdf_file`, `save_text_file`, `save_csv`, `start_plotting*`, `write_system_register`, `get_connection_status` and the `base64` dependency are unused by the native UI).
* **P2 — The rate limiter only covers some traffic.** Polls and manual requests are limited. The heartbeat and plot tasks bypass it. The UI slider is 1–10 000, so 0 ("disabled") can't be reached, and a low value starves manual reads.
* **P2 — UDP "connect" never checks the device.** The connection is reported as *Connected* immediately, even with nothing at the address. Send a probe (read sys reg 2) and report *Connected* only after a reply.
* **P2 — Control is lost silently after a reconnect.** Reconnect sets `control_state: 0`. Every write and command widget then disables without telling the user. Raise a clear "Control lost — re-take?" notice. An opt-in auto-retake per Profile is possible, but should be off by default for safety.
* **P2 — Timestamps use wall-clock time.** `now_ms()` uses `SystemTime`. NTP steps or DST/manual clock changes reorder plot samples and break staleness and outcome-timeout logic. Use `Instant` for ages and timeouts, and keep wall time only for display and export.
* **P3 — The reconnect loop duplicates its TCP and UDP branches** (about 100 near-identical lines). Factor into `establish(params) -> Transport`.
* **P3 — Literal op codes** (`1 =>`, `2 =>` …) in `process_response`. Use the `CMD_*` constants or an `#[repr(u16)] enum Op`.
* **P3 — The `lib.rs` `#[path = "backend/…"]` re-export hack** puts backend modules at the crate root. Make `backend` a real module (`crate::backend::communicator`).
* **P3 — Stop-and-wait caps throughput at 1/RTT.** That is fine on a LAN for tens of registers but limiting for large tables over Wi-Fi or VPN. For the deferred backend review, consider a protocol v0.3 with a sequence/tag field (enabling pipelining and exact correlation) and a *block read* op (N consecutive addresses in one frame).

---

## 4. Application model and persistence

| # | Sev | Issue | Fix |
|---|---|---|---|
| M1 | **P0** | **One schema mismatch wipes all user data.** `eframe::get_value::<Saved>(..).unwrap_or_default()` ([mod.rs:241](../../src/ui/mod.rs:241)) returns defaults on *any* deserialization error, and the next 5 s autosave overwrites the stored data. Many `Widget`, `Pane`, `Preferences` and `Saved` fields have no `#[serde(default)]` (`min`, `max`, `factor`, `confirm`, `width` …). Adding a required field in a future release would silently reset every Profile and dashboard. | Version the blob (`schema: u32`) with explicit migrations. Put `#[serde(default)]` on containers. On failure, back up the raw blob (`dshub-native-v1.bak-<ts>`) and show a recovery dialog instead of defaulting. Store Profiles as separate files under the config dir; they are user documents, not UI state. |
| M2 | P1 | **Map editor marks the draft dirty just because a metadata section was opened.** `meta.entry(name).or_default()` runs when the collapsing body draws ([panes.rs:756](../../src/ui/panes.rs:756)). `maps_differ` compares metadata JSON, so the pane refuses to close ("Save or Revert…") after you only looked. | Use `get_mut` and insert only on edit. Compare with empty metadata pruned. |
| M3 | P2 | **The domain model is stringly typed.** `Entry.data_type`, `Threshold.op/role`, `DirectionTarget.direction` and colour roles are all `String`. Row-style thresholds are edited as free text, so a typo in `role` silently renders grey. | `enum DataType`, `enum Op`, `enum Role`, `enum Direction`, with serde renames that keep the v1 format. |
| M4 | P2 | **`Widget` is one struct with 35 fields covering all 16 kinds.** Most fields are meaningless for a given kind, which makes the config UI and defaults error-prone. | Use `Widget { id, label, geometry, kind: WidgetSpec }` with `enum WidgetSpec { Gauge{min,max,..}, Button{command,value,..}, .. }`. The compat layer already translates, so this is internal. |
| M5 | P2 | **Map Editor drafts are persisted in layouts.** `Pane.draft: Option<Profile>` is serialised into the current layout, every per-Profile layout and every named Workspace. That duplicates whole Profiles in storage and can bring back stale drafts. | Keep drafts in memory, or in one dedicated "unsaved drafts" slot keyed by Profile ID. |
| M6 | P2 | **Deletes have no undo or confirmation**: Profile delete, Workspace delete, dashboard delete, widget "×", plot trace "×", Reset layout. | Add confirmation for Profile and dashboard deletes, and a short undo toast for the rest. |
| M7 | P3 | Profile names can be empty or duplicated. `unique_id` is time + counter. Imported Profiles are built from `default_profiles().remove(0)`, which builds every bundled dashboard just to get a template. | Validate names. Use a `Profile::empty()` constructor. |
| M8 | P3 | `parse_map` pushes `bytes[i] as char`, so non-ASCII text mangles. Error messages give only line numbers; they don't say what was wrong. | Iterate over `char_indices`. Include the offending text in errors. |

---

## 5. UI implementation (egui / eframe)

### 5.1 Correctness and behaviour

* **P1 — The confirm dialog is not modal** ([mod.rs:715](../../src/ui/mod.rs:715)). It is a normal `egui::Window` that can be hidden behind panes or another viewport, the rest of the UI stays live, and it opens only in the main viewport. A confirm triggered from a daughter window appears in a different OS window. Use `egui::Modal` (egui 0.31) and show it in the viewport that raised it. Put the details in it (entry, address, current value → new value, unit), with focus on **Cancel** for destructive commands.
* **P1 — Sync file dialogs block the event loop.** Import Profile, Import command map and Import map/header call `rfd::FileDialog::pick_file()` on the UI thread. Export does the opposite and runs a *sync* dialog on a background `std::thread` ([session.rs:452](../../src/ui/session.rs:452)), which is unsupported on macOS (NSSavePanel must run on the main thread). Use `rfd::AsyncFileDialog` from the Tokio runtime for both directions, and deliver results back through the event channel.
* **P2 — "Pause" is global and drops data.** `session.paused` is shared by every Plot pane, and while it is set `drain` stops recording history ([panes.rs:507](../../src/ui/panes.rs:507)). Pausing should freeze the *view* of one pane and keep recording.
* **P2 — Follow-live pins the Y range.** `set_plot_bounds` reuses the current Y bounds, so the Y axis stops auto-fitting to new data while following. Use `set_plot_bounds_x` plus `auto_bounds([false, true])`.
* **P2 — Esc anywhere exits Focus mode**, including Esc pressed to close a combo box or cancel a text edit. Consume the key only when nothing has focus.
* **P2 — Histories are recorded for every polled address**, not only for plotted ones (`drain` pushes for any valid reading). A 500-row "Live" table with `max_points` = 20 000 uses up to about 160 MB. Record only for addresses that have a plot or mini-plot consumer.
* **P2 — Settings apply inconsistently.** Log settings need **Apply**. Everything else applies immediately, including theme and poll interval. The rate-limit slider can't reach 0. Sliders are used for millisecond and count values where a typed field is more precise.
* **P2 — The custom command range is a leftover.** The UI restricts custom codes to 100–64999 ([panes.rs:353](../../src/ui/panes.rs:353)), but they are sent as `SYS_COMMAND` with the code in the address field, where 0–64999 are all valid application commands (the CNC catalog uses 0–25). The restriction comes from the old "type ≥ 100" model in `send_command`.
* **P3 — `ctx.set_visuals(..)` runs every frame** ([mod.rs:781](../../src/ui/mod.rs:781)). Set it only when the preference changes. That also enables a custom theme (§6).
* **P3 — Daughter viewports use `show_viewport_immediate`.** That is simple, because everything shares `&mut self`, but every daughter re-renders whenever the main window does and the other way round. That multiplies per-frame cost (see §7). Deferred viewports with `Arc<Mutex<…>>` state, or at least repainting only the viewport that received input, are worth considering if users run 3 or more windows.
* **P3 — Mini-plots allow drag and zoom by default** inside a scrolling dashboard. Disable `allow_drag`, `allow_zoom` and `allow_scroll` on mini-plots.

### 5.2 Hand-rolled dashboard canvas

`canvas_layout.rs` plus the drag/resize code in `widgets.rs` is about 1 000 lines of custom interaction: move, five resize handles, soft snap, container reparenting, insertion lines and collision planning. It works according to the docs, but:

* State is spread across about 10 `ctx.data` temp keys per widget (`config-open`, `raw-resize`, `resize-targets`, `content-fit`, `active-widget` …) plus one global `Frame` keyed by a constant ID. That is hard to reason about and leaks entries for deleted widgets.
* The `Frame` is cloned out of `ctx.data` for each widget, every frame (the `floating` check), which makes it O(widgets × frame size).
* It has no keyboard support (arrow-key nudge, Delete), no multi-select, no undo, and no visible grid. Snapping to an 8 px grid would remove much of the bespoke neighbour-snap logic.

Recommended: move the canvas into a `DashboardEditor` struct that owns its interaction state and is stored once per pane. Snap to a visible grid. Add an undo stack (dashboard edits are cheap to clone). Consider [`egui_tiles`](https://github.com/rerun-io/egui_tiles) for tiled layouts if free positioning isn't essential.

---

## 6. UI design review — dated or weak elements and better choices

The CLAUDE.md direction is *calm, precise, dark-first, dense, tonal hierarchy, restrained cyan, stable numeric alignment*. Today the app uses stock `Visuals::dark()/light()` with the default proportional font and Unicode glyphs as icons.

| Element | Current | Problem | Better choice |
|---|---|---|---|
| **Global theme** | `Visuals::dark()` / `light()` unchanged; the accent is used only for some text | Looks like an egui demo; no tonal surfaces; selection and focus colours are egui blue, not the brand cyan | Build a `Theme` that sets `panel_fill`, `window_fill`, `extreme_bg_color` and `faint_bg_color` as 3–4 tonal steps; `selection.bg_fill` = accent at low alpha; widget `corner_radius` 4; 1 px strokes from a neutral ramp; `override_text_style` sizes for Small/Body/Heading. Keep the semantic roles from `colors.rs` but make them an `enum Role`. |
| **Typography** | Default egui font plus DejaVu for symbols | The default proportional font is light and thin, which hurts dense dark UIs; mixed fallback fonts render uneven glyphs | Bundle **Inter** (UI) and **JetBrains Mono** or **IBM Plex Mono** (values). Right-align numeric columns and use a fixed-width font for values so digits don't shift as they change. |
| **Icons** | `⚠ × ≡ ● ○ ↑ ↓` as text | Inconsistent sizes and baselines; "×" buttons are tiny | Use an icon font such as `egui-phosphor` or `egui_material_icons`, with consistent 16 px icons and tooltips. |
| **Header** | Three stacked rows (brand + menus / device / profile) | Uses about 110 px of vertical space in a dense tool and scatters connection state | One 36 px toolbar: app menu · **device chip** (status dot, name/IP, transport, control badge; clicking opens the connection popover) · Profile selector · Review badge · spacer · settings. Move counts and notices to the bottom status bar. |
| **Connect form** | Text field and radio buttons inside a `menu_button` | Menus close on outside clicks, focus is fragile, and the discovered list shows only name and IP | A **Connection dialog or side panel**: a table of discovered devices (name, IP:port, board type, FW, MAC, last seen) with double-click to connect, a manual entry with validation (`ip[:port]`), a TCP/UDP segmented control, recent devices, and "Connect + Take Control". |
| **Register/parameter tables** | Each row is `ui.horizontal` with fixed `add_sized` widths, no header, a permanent text box and Write/Read/Plot buttons on every row | No column headers, no sorting or resizing, values left-aligned, visually noisy, and wasteful at 1 000+ rows | `egui_extras::TableBuilder` with a sticky header and resizable columns *Addr · Name · Type · Value · Unit · Age/Status*; striped rows; **edit in place** (double-click or Enter on the value cell, then Enter to write, Esc to cancel, showing the outcome icon in the cell); row actions in a hover strip and context menu (Read · Plot · Inspect · Copy). A Live toggle per pane, with the interval in the pane header. Optionally poll only *visible* rows when Live is on, since `show_rows` already gives the range. |
| **Format selector** | Three selectable labels per pane | Takes a whole row | A compact segmented control `DEC HEX BIN` in the table header, with a per-row override in the context menu. |
| **Activity log** | Free-flowing labels, Unix-epoch seconds, a collapsible section per packet | Hard to scan; not virtualised; timestamps unreadable | A virtualised table: `HH:MM:SS.mmm` · level icon · category · message. Level and category filter chips, a "pause autoscroll" button, and a packet inspector panel that shows a hex view grouped as `type | addr | value` with decoded fields side by side. |
| **Plot** | X axis "Unix time (seconds)", no cursor readout, global pause, no decimation | Axis labels like `1.7307e9` are meaningless; values can't be read at a point | A relative-time axis (`-60 s … now`) or an `HH:MM:SS` formatter; a crosshair with a tooltip of every trace's value at the cursor; a per-trace colour swatch with visibility toggle; optional per-trace Y axis or normalisation; "Fit Y" and "Follow" toggles; min/max decimation to the pixel width; PNG export. |
| **Gauge widget** | Hand-drawn 40-segment arc and a needle line, with no scale | No ticks, min/max labels or threshold bands; the needle is hard to read | A filled arc gauge: track, value arc in the threshold colour, threshold bands drawn on the track, min/max labels, the big value centred, and the unit underneath. |
| **LED / State LED** | Text `●`/`○` at 24 pt | Glyph rendering varies by font; there is no ring for the off state | A painted circle (`circle_filled` plus a 1 px ring) and a label, with a distinct shape or label for *unknown* (not just grey). |
| **Status matrix** | 32 cells labelled `00 ●` | Bit numbers without names | Show bit names from metadata `value_list` (or a new `bits` field), shade only set bits, and give a tooltip per bit. Allow 8/16/32 bit layouts. |
| **Value readout** | Fixed 32 pt | Too large in small widgets, too small in big ones | Scale the font to the widget rect. Show the unit smaller beside the value. |
| **Dropdown** | Combo box labelled "Select value" plus the raw value | Doesn't show the *current* option label | Show the current mapped label in the combo, mark the matching option, and show a pending/confirmed icon. |
| **Widget config window** | One long vertical list; many text fields have no label (label, LED on/off text, secondary unit); row thresholds use free-text `op`/`role` | Hard to understand; typos fail silently | Use sections (**Binding · Display · Range & thresholds · Behaviour · Geometry**), each a two-column `Grid` with labels; combo boxes for op and role everywhere; a live preview; the binding picker as a proper searchable popup listing space/address/type columns. |
| **Notices** | One status-bar string that each new notice overwrites | Errors are lost; nothing records them | Stacked toasts by severity (info auto-dismisses; errors stay until dismissed), each also written to the Activity log. |
| **Confirmations** | Non-modal window, generic text ("Send command 14 with value 0?") | Too easy to miss or click through | A modal with the command *name*, description and target device. For codes flagged critical (Reset Firmware, Write Flash), use a stronger visual and "type to confirm" or a hold-to-confirm button. |
| **Profiles / Workspaces / Settings** | Floating windows with button rows | Look like debug panels | One tabbed **Preferences** window (General · Connection · Logging · Performance) and a **Profile manager** with a list on the left and details on the right (maps summary, dashboards, export/import, duplicate/delete with confirmation). |
| **Empty states** | "Click Plot beside an entry to add a trace." | Fine, but inconsistent elsewhere (dashboards show nothing) | Give each empty pane one line of guidance and a primary action button. |
| **Daughter windows** | Title "DSHub · Plot" | When there are many windows, it isn't clear which device or Profile each belongs to | Include the device name or IP and the Profile in the title. |

---

## 7. Performance analysis (static estimate)

The estimates assume 60 fps during interaction and 20 fps idle (`request_repaint_after(50ms)` runs every frame).

### 7.1 Hot spots, ranked

1. **Map re-parsing on every lookup (largest issue).** `Profile::entries(s)` ([model.rs:340](../../src/model.rs:340)) re-parses the map text each call: lowercasing every line, scanning comments, running a regex per line and allocating each `Entry`. It is called from:
   * `Binding::matches` → once per bound widget per frame, once per Live table row per frame, once per plot series per frame, and recursively for every binding in `review::count`, which runs **every frame from the header** ([mod.rs:474](../../src/ui/mod.rs:474)).
   * `render_widget` (another `entries().find()` after `matches`), `drain()` (once per incoming reading), the Overview pane (7 calls per frame) and the binding picker.
   * Cost is O(bindings × map lines) per frame. A Live table is **O(N²)**: N rows × an N-line parse. With the bundled 44-line CNC map that is a few thousand regex matches per frame, which is tolerable. With a realistic 500–2 000-entry firmware map it becomes 250 k–4 M regex evaluations per frame, and the UI stops responding.
   * **Fix:** cache the parsed maps in `Profile` (`Arc<ParsedMap { entries, by_name: HashMap, by_address: HashMap }>` per space, rebuilt only when that map's text changes; keep a generation counter or parse in the setters). That turns `matches`/`resolve` into O(1) hash lookups.
2. **Unconditional 20 Hz repaint, multiplied by viewports.** Even idle and disconnected, the app redraws every 50 ms. Each redraw runs the full UI of the main window and of every immediate daughter viewport. Better: put an `egui::Context` into `AppHandle` and call `ctx.request_repaint()` when an event arrives (it coalesces itself). Request timed repaints only when something time-based is visible (staleness badges, pending-outcome timeouts, a following plot).
3. **Whole-Profile clone per Dashboard pane per frame.** `let snapshot = profile.clone()` ([widgets.rs:74](../../src/ui/widgets.rs:74)) copies all map strings, metadata and *all dashboards*. `review::show` does the same while open. Fix by splitting the borrow (pass `&ParsedMaps` separately from `&mut Vec<Dashboard>`).
4. **Plot tessellation.** For every series, every frame: iterate up to 20 000 points, `collect` a new `Vec`, and hand all of them to egui_plot to tessellate. Several 20 k series at 60 fps is a lot of work. Fix by binary-searching the window start in the (time-sorted) `VecDeque` and passing slices; decimate to about 2 × plot width in pixels (min/max per bucket, or LTTB); cache the decimated result until new data arrives.
5. **The Activity log isn't virtualised.** Up to 10 000 entries are laid out every frame, each `to_lowercase()`d for the filter, plus a collapsing header per packet entry. With packet logging on this dominates. Fix with `show_rows` and a filtered index rebuilt only when the logs or the query change.
6. **The event pipeline goes through JSON.** Per reading: `serde_json::to_value` (backend), a `String` name allocation, a `Mutex` push, then `from_value`, a `p.entries(s)` parse and a linear `find` (UI). Use typed events and an address-indexed entry lookup.
7. **canvas_layout `Frame` cloning** (§5.2) costs O(W²)-ish per frame while editing large dashboards.
8. **Map Editor table** rebuilds `rows.clone()`, `generate()` and `parse_map()` every frame just to decide whether the Export buttons are enabled. Compute it on change.
9. **Autosave every 5 s serialises the whole `Saved` struct to RON on the UI thread**, including all workspaces, per-Profile layouts and persisted drafts (M5). It grows with use. Save on change (dirty flag) and move Profiles to their own files.
10. **Minor:** `set_visuals` every frame; `src.ip().to_string()` per UDP datagram; `Profile::commands()` allocates per frame; `format!` for every visible table cell (fine at visible-row counts).

### 7.2 Backend throughput model

* Stop-and-wait means throughput is about 1/RTT: roughly 1 000–3 000 req/s on a wired LAN to an MCU, and 50–300 req/s over Wi-Fi or VPN. The default 2 000 req/s limit is therefore rarely the bottleneck; RTT is.
* A Live table subscribes **all filtered rows**, not only visible ones. 200 rows at 250 ms = 800 req/s, which saturates many links. Writes and commands then queue behind up to 100 polls (see §3.2 P0).
* Per-address Tokio tasks are cheap, so thousands are fine. The global `tokio::sync::Mutex` in the rate limiter is acceptable at these rates.
* Memory: histories (§5.1), logs (≤ 10 k entries with hex strings) and the 20 k event queue are bounded, but they are generous.

### 7.3 Expected wins

| Change | Effort | Expected effect |
|---|---|---|
| Cache parsed maps and index lookups | S–M | Removes the dominant per-frame cost; makes large maps usable |
| Event-driven repaint | S | Idle CPU drops to near zero; lower latency for updates |
| Remove per-frame Profile clone | S | Large allocation churn gone |
| Plot slicing and decimation | M | Smooth plots with many long traces |
| Virtualised log | S | Packet logging becomes usable |
| `TCP_NODELAY` | XS | Removes possible 40–200 ms stalls per request on some stacks |
| Poll only visible rows in Live tables | S | Lower link load and lower write/command latency |

---

## 8. Things that may not have occurred to you

1. **Spec and emulator drift is a process risk.** The emulator echoes write values, uses status `-4`, and binds TCP to `127.0.0.1` only (so it is unusable from another machine). PROTOCOL.md still links to `src-tauri/` paths. Add a protocol conformance test that runs the same frame vectors against the emulator and documents the contract.
2. **Field diagnostics.** Only `env_logger` to stderr, and the Windows release has no console (`windows_subsystem = "windows"`), so users there have no logs at all. Add `tracing` with a rolling log file in the config dir, a "Open log folder" action, and a panic hook that writes a crash report and flushes state.
3. **Session recording and replay.** Engineers often want to record polled values or raw frames to a file (CSV/Parquet or pcap-like) for hours and replay them offline into the same plots and dashboards. The event layer is close to supporting this once it is typed.
4. **Multi-device.** "One device connection per application" is an invariant today. If operators supervise several boards, plan the `Session` around `DeviceId` keys early; it is cheap now and expensive later.
5. **Control arbitration visibility.** The heartbeat reads `CONTROL_INTERFACE`. When another client (CLI, USB) takes control, the UI should say *who* took it ("Control taken by USB") and not just disable widgets.
6. **Units and scaling belong to the map, not the widget.** Metadata already carries `unit`. Adding `scale`/`offset` and `min`/`max` to entry metadata would let tables, inspector, plots and widgets agree on engineering units, instead of each widget having its own `factor`.
7. **Write guards.** For parameters with metadata min/max, validate before sending, and show the device's value next to the proposed one in the confirm modal.
8. **Keyboard workflow.** Engineers live on the keyboard. Add a command palette (Ctrl+K) for opening panes, jumping to entries and running commands; `/` to focus search; Enter to write.
9. **Security posture.** The protocol has no authentication; any host on the LAN can take control. That is a firmware matter, but the UI could at least show a warning badge when connected over UDP or to a non-private subnet, and document the risk.
10. **Packaging.** No signed Windows build (SmartScreen warnings), no macOS notarization (Gatekeeper blocks it), and the AUR recipe still points at 0.2.4. These block real operator deployment more than any UI issue.
11. **CI gaps.** CI runs clippy without `--all-features` (CLAUDE.md requires it), so the `native-smoke` code is never linted in CI. The emulator integration test (`--ignored`) never runs in CI, although it needs only Python and loopback.
12. **Repository weight.** `client/` (307 MB on disk) and `src-tauri/` (1.6 GB on disk including build output) remain. Once acceptance is done, delete them on a tagged commit so history keeps them, and fix the docs that link into them.
13. **Accessibility.** `accesskit` is enabled, which is good. Many custom-painted widgets (gauge, LEDs, canvas) expose no accessible labels; `response.widget_info(...)` can provide them.
14. **HiDPI and multi-monitor.** Window positions are persisted in logical points from `outer_rect`. Restoring onto a monitor that no longer exists can place a daughter window off-screen. Clamp restored positions to the available monitors.

---

## 9. Suggested order of work

1. **Safety and data integrity (P0):** a priority control channel and jog coalescing/cancel; versioned persistence with backup and no silent default; separate Profile files.
2. **Protocol correctness (P1):** MAC offset, discovered ports, cancel-safe TCP framing, write-ack semantics (decide the spec and align the emulator), separate write-ack events from readings, status-echo correlation, `TCP_NODELAY`, reconnect timeout, out-of-band Disconnect, lossless control events.
3. **Performance foundation:** parsed-map cache, event-driven repaint, typed events, no per-frame Profile clone, a virtualised log, plot decimation.
4. **UI foundation:** a theme module (tonal surfaces, Inter/Mono, icon font), a single-row toolbar with a device chip, a modal confirm, toasts, async file dialogs.
5. **UI surfaces:** a `TableBuilder` entry table with edit-in-place, a log table, plot time axis and crosshair, a redesigned gauge/LED/matrix, a sectioned widget config.
6. **Hygiene:** remove Tauri leftovers (dead commands, `base64`, `#[path]` re-exports), enum-typed model fields, a `WidgetSpec` enum, CI with `--all-features` plus an emulator job, removal of `client/` and `src-tauri/` after acceptance.
