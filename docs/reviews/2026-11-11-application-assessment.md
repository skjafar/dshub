# DSHub 0.3.1 — application assessment

Date: 2026-11-11 · Commit: `9c73c08` (v0.3.1) · Scope: the whole root crate (`src/`, about 15,700 lines of Rust), the Python emulator, CI and packaging.

Companion document: [2026-11-11-improvement-instructions.md](2026-11-11-improvement-instructions.md) turns each finding below into a task for an implementing agent. Finding IDs (C1, S2, …) are the same in both.

## Status on 2026-11-12

Every findings table below now has a **Status** column. Of the 48 findings, 42 are done and 6 are open.

**Open:**

| ID | Finding | Why it is open |
|---|---|---|
| C4 | One lost packet stalls everything for 5 s | Changes when a connection is declared lost; needs your decision on the timeout numbers (task T12). |
| P3 | Per-frame allocation in lookups | After the repaint cap, busy dashboards use 1.3–1.8 % CPU, so the gain is small. |
| P4 | Dashboards poll every widget | Acceptable for monitoring; a per-dashboard interval is optional. |
| P5 | Autosave serialises every Profile | Costs a few milliseconds every five seconds; low value. |
| Q4 | Large files and one widget struct | A larger refactor, to be scheduled. |
| Q5 | Release coverage (macOS Intel, Linux ARM, Windows installer) | Add when someone needs them. |

**Done, with a caveat:**

- **S3** — the CI changes (cargo-deny, pinned actions, checksums) are written but have not run yet; the first push will show whether cargo-deny passes. Windows signing still depends on a certificate secret.
- **U9** — plots got a per-plot time window, a Normalise view and Undo for Clear data. A true second Y axis was not added.
- **Measured after the changes:** CPU on the CNC Operator dashboard fell from 3.1 % to 1.3 %, on the all-widgets dashboard from 4.0 % to 1.8 %, and threads from 30 to 16. The scorecard and measurement tables below describe the application **before** the fixes.

## How this was done

- **Code review.** I read the backend (`src/backend/`), the session actor, the application shell, persistence, the model and the pane and widget code.
- **Measurement.** I built the release binary and ran it against the emulator on loopback, in an isolated network namespace, on a 16-core Linux machine under Wayland. CPU, memory and wake-ups come from `/proc`; request rates come from the emulator's packet counter.
- **Colour.** I computed WCAG contrast ratios for every palette pair in `theme.rs` and `colors.rs`.
- **Screens.** I rendered the main panes in both themes with the smoke harness and reviewed the screenshots.

What I did not do: test against physical hardware, test on Windows or macOS, run a dependency vulnerability scan (`cargo audit` is not installed here), or run a profiler. Findings marked *by analysis* come from reading the code, not from a failing run.

Severity: **P1** wrong behaviour a user will hit · **P2** noticeable problem in quality, safety margin, performance or UX · **P3** polish or hygiene. There are no P0 (data loss or unsafe by default) findings.

## 1. Summary

DSHub is in good shape. The architecture is sound, the write path is careful, and the app is cheap to run: 0.1 % CPU when idle and 1–4 % of one core on the bundled dashboards. Most of what the 7 November review found has been fixed.

The findings that matter most:

1. **A read the device refuses is shown as a valid value (C1, P1).** The value appears with a healthy status, is plotted and is recorded. This is the one correctness bug I would fix before anything else.
2. **The request rate limit does not limit (C2, P2).** With 107 values polled at 50 ms, the app sent 2,140 requests a second against a limit of 2,000.
3. **The interface repaints once per device reading, with no cap (P1, P2).** Under heavy polling the main thread woke 630–960 times a second. It is affordable on this machine and wasteful on a small one.
4. **Imported Profiles and discovery replies are trusted (S1, S2, P2).** A discovery reply can name any IP address, and an imported dashboard can hide what a button sends.
5. **Status is carried by hue alone in several places (V2, P2).** Green and amber have almost the same brightness, so a colour-blind operator cannot tell an unlabelled lamp's state.
6. **Pushes to `master` are not tested by CI (Q1, P2).** CI runs only on tags and pull requests.

### Scorecard

| Area | Grade | One-line reason |
|---|---|---|
| Architecture | A− | One actor owns I/O; the UI never blocks; explicit outcome states. |
| Protocol correctness | B+ | Careful framing and correlation; refused reads slip through (C1). |
| Performance | B+ | Very cheap at normal load; repaint rate and rate limit need a cap. |
| Security | B− | No `unsafe`, safe file handling; trusts imports and discovery; no supply-chain checks. |
| Reliability and data safety | B+ | Unreadable settings are preserved; bundled dashboards can overwrite edits. |
| UX and usability | B | Dense and capable; weak first-run, few shortcuts, thin status bar. |
| Visual design and colour | B | Text contrast is excellent; borders and status hues are weak. |
| Accessibility | C+ | Screen-reader labels exist; colour-only status and pointer-only hold button. |
| Tests and CI | B | 107 unit tests plus emulator and conformance; no CI on `master`, no loss or latency tests. |
| Maintainability | B− | Two files over 2,000 lines; one widget struct for 17 kinds. |

## 2. What is done well

Keep these as they are.

| Area | Practice |
|---|---|
| Concurrency | The UI submits actions to one Tokio actor and never awaits the network. Disconnect cancels whatever the actor is doing. |
| Framing | TCP reads keep partial frames across timeouts, so a late byte never shifts the stream. |
| Correlation | Responses are matched on operation code and address; stale replies are discarded and logged. |
| Write outcomes | Sending, Confirmed, Refused and Unknown are distinct. A write is confirmed from its status and then read back. |
| Control | Writes and commands are blocked without Control at three layers. Losing Control raises a warning. |
| Reconnect | Exponential backoff with jitter; a replaced stop token means an old supervisor cannot revive itself. |
| Events | A bounded queue sheds telemetry only; state transitions are never dropped. One wake per burst. |
| Idle cost | Event-driven repaint: 5 wake-ups a second and 0.1 % CPU when disconnected. |
| Tables and plots | Tables are virtualised and poll only visible rows. Plots decimate with min/max buckets. |
| Persistence | Profiles are separate files written atomically. Unreadable settings and Profiles are set aside, never deleted. |
| Binding identity | Drifted bindings stop polling and block writes until reviewed. |
| Safety UI | Critical commands need press-and-hold. Confirmations show the device value and the new value. |
| Code hygiene | Zero `unsafe`. `--locked` builds, `fmt`, `clippy -D warnings`. Comments explain why guards exist. |
| Text contrast | Body text is 9.7:1 to 15:1 on every surface in both themes; weak text never drops below 4.3:1. |

## 3. Measurements

Release build, emulator on loopback. Smoke-fixture poll interval is 100 ms unless stated.

| Scenario | Total CPU (one core = 100 %) | Main-thread wake-ups / s | Device requests / s |
|---|---|---|---|
| Disconnected, idle | 0.1 % | 5 | 0 |
| Registers table | 1.6 % | 133 | — |
| Plot pane | 1.4 % | 110 | — |
| CNC Operator dashboard (15 polled) | 3.1 % | 282 | — |
| All-widgets dashboard | 4.0 % | 210 | — |
| SCE2 setup (107 polled) at 1,000 ms | 1.6 % | 120 | 108 |
| SCE2 setup (107 polled) at 100 ms | 8.9 % | 629 | 1,071 |
| SCE2 setup (107 polled) at 50 ms | 16.6 % | 957 | 2,140 |

Other figures:

- **Memory:** 165 MB resident, of which about 25 MB is private. The rest is shared graphics libraries (92 MB `libLLVM`, 24 MB Mesa).
- **Threads:** 30. Tokio starts one worker per core.
- **Binary:** 23 MB stripped. Clean release build: 82 s.
- **Dependencies:** 301 crates in the tree.

Two things stand out. Wake-ups track the request rate, which is finding P1. And 2,140 requests a second were sent with the limit at 2,000, which is finding C2.

## 4. Correctness and device communication

| ID | Sev | Finding | Evidence | Recommendation | Status |
|---|---|---|---|---|---|
| C1 | **P1** | **A refused read is displayed as a valid value.** The read arms of `process_response` never check the status, and `reading()` hard-codes `valid: true`. A device that answers `ADDRESS_OUT_OF_RANGE` (−4) with value 0 produces a healthy-looking `0`, which is also plotted and recorded. The "Read failed" state in `colors::reading` can never occur. | [communicator.rs:310](../../src/backend/communicator.rs:310), [communicator.rs:350](../../src/backend/communicator.rs:350) | Set `valid` from `status_ok(status)` and carry the status. Show "Read refused" with the status name. Do not plot or record invalid readings (the UI already skips those). | Done |
| C2 | P2 | **The rate limiter over-admits under concurrency.** When the bucket is empty, each caller resets it and sleeps the same deficit, so N concurrent pollers all pass after one interval. Measured: 2,140 requests/s with the limit at 2,000. | [commands.rs:53](../../src/backend/commands.rs:53) | Schedule against a shared "next free" instant, so each caller reserves its own slot. Add a test with many concurrent callers. | Done |
| C3 | P2 | **The request queue saturates when polling outruns the device** (*by analysis*). Each poll task enqueues on its own timer, whether or not its previous read was answered. When demand exceeds what a stop-and-wait link can serve, the 100-slot queue stays full and every manual read, write or command waits behind it. Loopback hides this; a device that takes 5 ms per request reaches it at 200 requests/s. | [poll.rs:179](../../src/backend/poll.rs:179), [commands.rs:22](../../src/backend/commands.rs:22) | Without adding priority: let each address have at most one read outstanding, and skip a tick while one is. Queue depth then never exceeds the number of polled addresses. Show queue depth and round-trip time in the status bar (U5). | Done |
| C4 | P2 | **One lost packet stalls everything for 5 s** (*by analysis*). The timeout is fixed at 5 s for every request, and UDP has no retry. Three losses in a row drop the connection after 15 s. | [communicator.rs:32](../../src/backend/communicator.rs:32) | Derive the read timeout from the measured round-trip time, with a floor and the current 5 s ceiling. Keep 5 s for commands. Over UDP, retry reads once; never retry writes or commands. | Open — needs your timeout numbers |
| C5 | P2 | **Switching or importing a Profile while holding Control has no guard.** An import makes the new Profile active at once. Dashboards and tables then address the same device through a different map. | [mod.rs:1633](../../src/ui/mod.rs:1633) | Ask before changing the active Profile while connected. Do not auto-activate an import while connected. See also U2. | Done |
| C6 | P3 | **A write can end as "Unknown" although it succeeded.** The 5 s outcome clock starts at the click, not when the request is sent, and a late acknowledgement is ignored once the state is Unknown. | [session.rs:775](../../src/ui/session.rs:775) | Let a late acknowledgement move Unknown to Confirmed or Refused. | Done |
| C7 | P3 | **Recording depends on the window.** Readings are recorded as the UI drains them, so a stalled or hidden window that sheds telemetry leaves gaps. Write errors are silent. | [recording.rs:44](../../src/ui/recording.rs:44) | Report the first write error. Longer term, record in the backend. | Done |
| C8 | P3 | **Profile import drops malformed sections silently.** Commands and metadata that fail to parse become empty. | [model.rs:762](../../src/model.rs:762) | Report what was skipped in the import toast. | Done |
| C9 | P3 | **A full event queue costs a linear scan per event.** Once 20,000 events are queued, each new one scans for a droppable entry. | [runtime.rs:94](../../src/runtime.rs:94) | Keep only the latest reading per address while the queue is over a threshold. | Done |

## 5. Security

DSHub's protocol has no authentication or encryption. That is a property of the datastream library, not of this application, and the app already says so: the device chip warns for UDP and for addresses outside a private network. The findings below are about what the application itself trusts.

| ID | Sev | Finding | Evidence | Recommendation | Status |
|---|---|---|---|---|---|
| S1 | P2 | **Discovery replies are trusted.** The IP address shown and used for connecting comes from the reply's payload; the datagram's real source address is ignored. Any host on the network can advertise a device with a familiar name at an address of its choosing. | [scanner.rs:79](../../src/backend/scanner.rs:79) | Record the source address. Connect to the source, and flag a reply whose payload address differs. | Done |
| S2 | P2 | **An imported Profile can disguise device actions.** A dashboard button's label is free text, its confirmation can be off, and the "critical" flag on a command is set by the Profile's author. A shared Profile can carry a harmless-looking button that sends any command. | [model.rs:736](../../src/model.rs:736) | On import, list the commands and writes its dashboards can send. Require confirmation on imported write and command widgets until the user reviews them. Always show the command code and name in the confirmation. | Done |
| S3 | P2 | **No supply-chain checks.** GitHub Actions are pinned by tag, not commit. There is no `cargo audit` or `cargo deny` step for 301 crates. Releases carry no checksums. The Windows binary is unsigned unless a secret is configured. | [build.yml](../../.github/workflows/build.yml) | Pin actions by SHA. Add `cargo deny` (advisories, licences, sources). Publish `SHA256SUMS` with each release. | Done — first CI run will confirm |
| S4 | P3 | **The emulator is open to the network by default.** It accepts Take Control from any host. This was a deliberate choice for testing from other machines. | `emulator/dshub_emulator.py` | Print a clear one-line warning at start-up when not `--local`. | Done — warning already printed |
| S5 | P3 | **CSV exports are not escaped.** Names containing quotes break the file, and cells starting with `=` are formulas in a spreadsheet. | [panes.rs:282](../../src/ui/panes.rs:282) | Double embedded quotes; prefix cells that start with `=`, `+`, `-` or `@`. | Done |
| S6 | P3 | **Protocol-level protection is absent** (known limitation). | PROTOCOL.md | Document a deployment rule: devices on an isolated network or VLAN. If the firmware ever changes, add a session token to Take Control. | Done — README |

Positive: zero `unsafe`; Profile file names are sanitised so a crafted id cannot leave the folder; map parsing bounds array sizes at 65,536 entries; file dialogs and exports never block or run commands.

## 6. Performance and optimisation

| ID | Sev | Finding | Evidence | Recommendation | Status |
|---|---|---|---|---|---|
| P1 | P2 | **Repaint rate follows the device event rate with no cap.** Every reading requests an immediate repaint, and vsync is off on Wayland. Measured 629 wake-ups/s at 1,071 requests/s and 957 at 2,140. | [mod.rs:577](../../src/ui/mod.rs:577) | Coalesce backend wake-ups to at most 30–60 a second (`request_repaint_after` of 16–33 ms). User input still repaints at once. | Done |
| P2 | P3 | **Thirty threads.** The Tokio runtime starts one worker per core for a workload that is one socket and a few timers. | [session.rs:152](../../src/ui/session.rs:152) | Use two worker threads. | Done |
| P3 | P3 | **Per-frame allocation in lookups.** `entry_at` clones an `Entry` (with its name) on every call; `Profile::command` rebuilds the whole command list per button per frame; the interest set is rebuilt with owned names every frame; each map lookup compares the full map text. | [model.rs:716](../../src/model.rs:716), [model.rs:649](../../src/model.rs:649) | Return shared references (`Arc<ParsedMap>` plus index), cache the command list per Profile, and key the map cache by a revision counter. Do this only after P1; it is a smaller gain. | Open — small gain after P1 |
| P4 | P3 | **Dashboards poll every widget, visible or not.** Tables poll only rows in view; a dashboard polls all of its bindings. The SCE2 setup dashboard polls 107 values. | `widgets.rs` | Acceptable for monitoring. Consider a per-dashboard interval so a large setup page can poll slowly. | Open |
| P5 | P3 | **Autosave serialises every Profile on the UI thread.** Any click marks state as touched; five seconds later all Profiles are pretty-printed and compared. A 167 KB Profile costs a few milliseconds. | [profile_store.rs:87](../../src/ui/profile_store.rs:87) | Mark Profiles dirty individually and serialise only those. | Open — small gain |

Binary size and memory need no action. The 165 MB resident figure is almost all shared graphics drivers.

## 7. UX and usability

| ID | Sev | Finding | Recommendation | Status |
|---|---|---|---|---|
| U1 | P2 | **After connecting, every table says "Unread".** Live is off by default, so a new user sees dashes until they find Live or Read all. | Read the visible rows once on connect, or default Live to on. | Done |
| U2 | P2 | **Nothing checks that the Profile matches the device.** Discovery reports a board type and firmware version, but the active Profile is never compared with them. A wrong Profile reads and writes the wrong addresses. | Let a Profile name the board types it is for. Warn in the device chip on a mismatch, and offer the matching Profile. | Done |
| U3 | P2 | **Critical commands look like any other.** In the Commands pane, Write Flash and Reset Firmware sit at the top with the same Send button as everything else. One Argument field applies to every row. | Mark critical commands (icon and colour), group library commands separately below the Profile's commands, and show the argument next to the row being sent. | Done |
| U4 | P2 | **Bundled dashboards overwrite the user's edits on update.** When a release changes a bundled layout, the stored copy is replaced. This was accepted for 0.3.1, but it will keep happening. | Make bundled dashboards read-only with "Duplicate to edit". | Done |
| U5 | P3 | **The status bar says little.** It shows "15 polled · 16 readings" and the version. Round-trip time, request rate, queue depth and timeouts are all known to the backend. | Add round-trip time and requests per second, and a warning when the queue is backing up. | Done |
| U6 | P3 | **Disconnect is hidden.** It is only inside the device chip's popup. | Show Disconnect in the top bar while connected, or in the chip's context menu. | Done |
| U7 | P3 | **Few keyboard shortcuts.** Ctrl+K, `/` and Esc exist. There is none for Save in the dashboard or map editor, for Connect, or for Take Control. | Add Ctrl+S for the focused draft, and list all shortcuts in the Guide. | Done |
| U8 | P3 | **No interface scale setting.** Body text is 13 px. On a 2,560-pixel-wide window it is small. egui's built-in Ctrl +/− zoom is on by default (I did not exercise it), but it is not in Preferences or the Guide. | Add "Interface scale" to Preferences and mention the shortcut. | Done |
| U9 | P3 | **Plots share one Y axis and one global time window.** A trace in counts flattens a trace in percent. "Clear data" clears every plot's history without confirmation. | Per-plot time window; optional second Y axis or per-trace normalising; confirm or undo for Clear data. | Done — normalise view instead of a second axis |
| U10 | P3 | **Dashboards are laid out for 1,200 px.** On a wide monitor half the canvas is empty; on a narrow one it scrolls. | Offer "Fit to width" scaling in view mode. | Done |
| U11 | P3 | **Number fields are drag-to-change.** Thresholds, sizes and intervals use drag values, which change on an accidental drag. | Keep drag for geometry; use plain numeric fields for thresholds and device values. | Done |

## 8. Visual design and colour

Measured contrast (WCAG 2.1; text needs 4.5:1, interface boundaries need 3:1):

| Pair | Dark theme | Light theme | Verdict |
|---|---|---|---|
| Body text on surfaces | 9.7 – 15.0 | 12.1 – 16.9 | Excellent |
| Weak text on surfaces | 4.6 – 7.2 | 4.3 – 6.1 | Passes; lowest on hovered controls |
| Accent on surfaces | 6.7 – 10.5 | 4.6 – 6.4 | Passes |
| Status colours on surfaces | 4.1 – 11.2 | 4.6 – 7.6 | Passes for text |
| Resting border (`ghost`) | 1.4 | 1.3 | **Fails 3:1** |
| Strong border (`ghost_strong`) | 2.2 | 1.7 | **Fails 3:1** |
| Adjacent surface steps | 1.04 – 1.16 | 1.07 – 1.16 | Very subtle |

| ID | Sev | Finding | Recommendation | Status |
|---|---|---|---|---|
| V1 | P2 | **Borders are too faint to mark a control.** Input fields, table grids and cards rely on 1.3–2.2:1 outlines and tonal steps of 1.04–1.16. On a dim or low-quality panel, inputs blend into the surface. | Raise the outline of interactive controls (inputs, combo boxes, buttons) to at least 3:1. Decorative separators can stay faint. | Done |
| V2 | P2 | **Status relies on hue.** In the dark theme, green and amber have relative luminance 0.55 and 0.58. In the light theme all six status colours sit between 0.09 and 0.11. Tables pair colour with text, but State LED lamps without labels, Status Matrix cells and data-table dots do not. | Give each role a shape as well as a colour (for example ✓ ok, ▲ warning, ✕ error, ● idle) wherever no text accompanies it. Pick an amber that is clearly lighter or darker than the green. | Done |
| V3 | P3 | **The four extra threshold colours do not adapt to the theme.** On the light theme, White is 1.2:1 and Orange, Violet and Pink are about 2.5:1, so a lamp in those colours is hard to see. | Store a dark and a light variant for each extra colour, like the roles. | Done |
| V4 | P3 | **Plot trace colours come from the plotting library.** They are not part of the palette and have not been checked for the light theme or for colour-blind users. | Define a trace palette of six to eight colours in `theme.rs` and vary line style as well. | Done |
| V5 | P3 | **The top and status bar separators are the heaviest lines on screen** in both themes, heavier than pane borders. | Use the same faint separator as the dock. | Done |
| V6 | P3 | **Small type.** Captions are 10.5 px uppercase in the weak colour; small text is 11 px. Contrast passes, but it is the first thing to become unreadable on a high-density display. | Covered by the scale setting (U8). | Done — via interface scale (U8) |

The design direction in CLAUDE.md — dark-first, dense, restrained cyan accent, stable numeric alignment — is implemented consistently. Values are monospaced and right-aligned, and the accent is used sparingly.

## 9. Accessibility

| ID | Sev | Finding | Recommendation | Status |
|---|---|---|---|---|
| A1 | P3 | **Hold-to-confirm is pointer-only.** A critical command cannot be confirmed from the keyboard. | Accept holding Space or Enter while the button has focus. [controls.rs:84](../../src/ui/controls.rs:84) | Done |
| A2 | P3 | **Segmented controls signal selection by colour only**, and expose no selected state to assistive technology. | Add a selected state to the widget info and a non-colour cue such as an underline. [controls.rs:59](../../src/ui/controls.rs:59) | Done |
| A3 | P2 | Colour-only status. | See V2. | Done — see V2 |

AccessKit is enabled, and custom-drawn widgets (lamps, bars, swatches) carry labels. That is better than most egui applications.

## 10. Reliability and data safety

| ID | Sev | Finding | Recommendation | Status |
|---|---|---|---|---|
| R1 | P3 | **Atomic writes do not sync.** A Profile is written to a temporary file and renamed, without `fsync`. A power cut at the wrong moment can leave an empty file on some file systems. | Sync the file before renaming. [profile_store.rs:109](../../src/ui/profile_store.rs:109) | Done |
| R2 | P3 | **No backup of previous Profile versions.** A mistaken Save in the map editor replaces the only copy. | Keep the previous version as `<id>.json.bak` on each write. | Done |
| R3 | P2 | Bundled dashboards overwrite edits. | See U4. | Done — see U4 |

## 11. Tests, CI and maintainability

| ID | Sev | Finding | Recommendation | Status |
|---|---|---|---|---|
| Q1 | P2 | **CI does not run on pushes to `master`.** The workflow triggers on tags and pull requests. Work pushed straight to `master` is first tested when a release is tagged. | Add `push: branches: [master]`. Build release artefacts only on tags. [build.yml](../../.github/workflows/build.yml) | Done |
| Q2 | P3 | **The emulator cannot misbehave.** It has no latency, loss or refusal options, so C1, C3 and C4 cannot be tested end to end. | Add `--latency-ms`, `--drop-rate` and a refusing address. | Done |
| Q3 | P3 | **Layout heights are estimated by hand.** `dashboard_kit::height` repeats numbers that the renderer decides, so they drift apart when a widget changes. | Add a render test that asserts no bundled widget's content exceeds its box. | Done |
| Q4 | P3 | **Large files and one widget struct.** `widgets.rs` is 2,512 lines, `panes.rs` 2,110, `mod.rs` 1,958. One `Widget` struct with about 38 fields serves 17 kinds. | Split panes into one module each. The `WidgetSpec` plan in `2026-11-08-architecture-follow-ups.md` still stands. | Open — larger refactor |
| Q5 | P3 | **Release coverage.** macOS builds are Apple-silicon only; there is no Linux ARM build and no Windows installer. | Add targets when someone needs them. | Open |

## 12. Suggested order of work

1. **Correctness first:** C1, then C2.
2. **Safety margin:** C5, S1, S2, U3.
3. **Cheap, high-value:** P1, P2, Q1, U1.
4. **Throughput and loss:** Q2 (emulator options), then C3 and C4 with tests.
5. **Colour and accessibility:** V1, V2, V3, A1, A2.
6. **Usability:** U2, U4, U5, U6, U7, U8.
7. **Hygiene:** S3, S5, R1, R2, C6–C9, P3–P5, Q3, V4–V6, U9–U11.
8. **Larger refactors when there is time:** Q4.
