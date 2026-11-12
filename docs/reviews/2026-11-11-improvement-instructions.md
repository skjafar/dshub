# DSHub 0.3.1 — improvement instructions

For: an implementing agent (Claude Opus) working in this repository.
Source: [2026-11-11-application-assessment.md](2026-11-11-application-assessment.md). Every task names the finding IDs it resolves (C1, S2, …). Read the finding before starting its task.

## Status (2026-11-12)

The task index below has a **Status** column, and each task heading ends in DONE or OPEN.

- **Done:** T1–T11 and T13–T22, plus U9, U10, U11 and S6 from Phase 8.
- **Open — T12** (read timeouts and UDP retry, finding C4): needs the user's decision on the numbers first.
- **Open — P3 and P5** from T21 (per-frame allocations, autosave serialisation): left out because busy dashboards now measure 1.3–1.8 % CPU.
- **Open — P4, Q4, Q5** from Phase 8.
- **To confirm:** T8's CI changes have not run yet. The first push shows whether cargo-deny passes.

## How to use this document

Work through the phases in order. Inside a phase, tasks are independent unless a task says otherwise. Do one task at a time: implement, run its checks, add a changelog line, then report. Stop and ask the user when a task says **Decision needed**.

### Rules that apply to every task

These come from `CLAUDE.md`, the user's standing instructions and this assessment. They override anything a task seems to imply.

1. **No request priority.** Never add priority lanes, and never exempt any request from the rate limiter or the queue. The heartbeat, commands and E-stop use the same queue as polls. Tasks T10 and T11 are written to respect this.
2. **Never block the egui thread on network I/O.** Device work goes through `Action`s to the session actor.
3. **Protocol behaviour stays in `src/backend/`.** Do not redesign the wire protocol.
4. **System registers are read-only everywhere.**
5. **Writes and commands need Control.** Queuing is not acknowledgement. Keep the Sending / Confirmed / Refused / Unknown states.
6. **Persistence compatibility.** New fields on stored types need `#[serde(default)]`. Old settings and Profile files must load unchanged. The version-one portable Profile format must keep importing all sixteen former widget kinds.
7. **Run only the tests a change touches.** Do not run the whole suite by habit. Never run `tests/native-smoke.sh` without naming scenes.
8. **Never run smoke fixtures or the emulator tests against a physical device.** Use an isolated network namespace so a user's own emulator on ports 2009/2011 is not disturbed:
   ```bash
   unshare -rn sh -c 'ip link set lo up && cargo test --locked --test emulator -- --ignored'
   ```
9. **Do not commit or push unless the user asks.**
10. **Line endings:** LF for shell and source, CRLF for `.bat`. Keep line-ending-only changes out of diffs.
11. **After each task:** `cargo fmt`, `cargo clippy --locked --all-targets --all-features -- -D warnings`, the task's own tests, and one line in `CHANGELOG.md` under a new unreleased heading.
12. **UI changes need a look.** Render the named smoke scenes and read the screenshots before calling a UI task done:
    ```bash
    unshare -rn sh -c 'ip link set lo up && bash tests/native-smoke.sh target/native-smoke cnc registers light'
    ```

### Task index

| Phase | Task | Resolves | Size | Status |
|---|---|---|---|---|
| 1 Correctness | T1 Refused reads | C1 | S | Done |
| | T2 Rate limiter | C2 | S | Done |
| 2 Safety margin | T3 Profile switch guard | C5 | S | Done |
| | T4 Discovery source address | S1 | S | Done |
| | T5 Imported Profile review | S2, C8 | M | Done |
| | T6 Commands pane | U3 | S | Done |
| 3 Cheap wins | T7 Repaint cap and worker threads | P1, P2 | S | Done |
| | T8 CI on master, supply chain | Q1, S3 | M | Done — first CI run will confirm |
| | T9 First read on connect | U1 | S | Done |
| 4 Throughput and loss | T10 Emulator fault options | Q2 | S | Done |
| | T11 One read in flight per address | C3 | M | Done |
| | T12 Timeouts and UDP retry | C4 | M | **Open** — decision needed |
| 5 Colour and accessibility | T13 Control outlines | V1 | S | Done |
| | T14 Status shapes and amber | V2, A3 | M | Done |
| | T15 Theme-aware extra and trace colours | V3, V4 | S | Done |
| | T16 Keyboard hold and segmented state | A1, A2 | S | Done |
| 6 Usability | T17 Status bar metrics | U5 | M | Done |
| | T18 Disconnect, shortcuts, scale | U6, U7, U8 | M | Done |
| | T19 Profile board types | U2 | M | Done |
| | T20 Read-only bundled dashboards | U4, R3 | M | Done |
| 7 Hygiene | T21 Small fixes | C6, C7, C9, S4, S5, R1, R2, P3, P5, V5 | M | Done except P3, P5 |
| | T22 Layout render test | Q3 | S | Done |
| 8 Later | T23 Larger items | Q4, Q5, U9, U10, U11, P4, S6 | — | U9–U11, S6 done; P4, Q4, Q5 open |

Sizes: S under half a day, M about a day.

---

## Phase 1 — Correctness

### T1 — A refused read must not look like a value (C1) — DONE

**Problem.** `process_response` emits `Register`, `Parameter` and `SysRegister` events for reads without looking at the status, and `reading()` sets `valid: true` always.

**Files.** `src/backend/communicator.rs`, `src/ui/colors.rs`, `src/ui/session.rs`, `emulator/dshub_emulator.py` (no change expected), tests.

**Steps.**

1. In `reading()` (about line 310) take the status and set `valid: status_ok(status)`. Keep the struct shape of `RegisterData`; many tests build it literally.
2. In the three read arms of `process_response`, pass the status. When the status is negative and `req.origin == Origin::Manual`, log one warning through `emit_log` in the Register or Parameter category: `Read of {name} ({space} {address}) refused by the device: status={n} ({status_name})`. Do **not** log refused polls or heartbeats: a refused address polled ten times a second would flood the log, and errors bypass the category filter.
3. `Session::reading` already ignores invalid readings for recording, plotting and the Control state. Check that an invalid reading replaces the stored one, so tables and widgets stop showing the last good value as current.
4. In `colors::reading`, the `!r.valid` branch says "Read failed". Timeouts never produce a reading, so this state now means refusal only. Rename the label to "Read refused".
5. Widgets and tables already filter on `r.valid`; confirm by search that nothing formats `r.value` without that check (`grep -n "\.value" src/ui/widgets.rs src/ui/panes.rs`).

**Tests.**

- Unit, in `communicator.rs`: call `process_response` with status −4 for each read command, drain the `AppHandle`, and assert the event has `valid == false`. Add the matching success case.
- Emulator, in `tests/emulator.rs`: read a register address past the end of the map and assert the `Register` event is invalid.
- Update `colors.rs`'s existing test for the new label.

**Run.** `cargo test --locked --lib communicator colors` and the emulator test in a namespace.

**Done when** a read of an out-of-range address shows "Read refused" in the Registers table and never appears in a plot.

### T2 — Make the rate limit hold under concurrency (C2) — DONE

**Problem.** `RateLimiter::acquire` lets every concurrent caller sleep the same deficit, so N poll tasks pass together. Measured 2,140 requests/s with the limit at 2,000.

**File.** `src/backend/commands.rs` (about lines 37–78).

**Steps.**

1. Replace the token bucket with a schedule: keep one `next: Instant` behind a `std::sync::Mutex` (no `.await` happens while it is held).
   ```rust
   pub async fn acquire(&self, limit: u32) {
       if limit == 0 { return; }
       let interval = Duration::from_secs_f64(1. / limit as f64);
       let at = {
           let mut next = self.next.lock().unwrap_or_else(|e| e.into_inner());
           let now = tokio::time::Instant::now();
           let at = (*next).max(now);
           *next = at + interval;
           at
       };
       tokio::time::sleep_until(at).await;
   }
   ```
   Each caller reserves its own slot, so admissions are spaced by `interval` however many callers wait.
2. A change of limit takes effect on the next call; no extra handling is needed.
3. Do not exempt any caller. The heartbeat, polls and manual requests all keep calling `acquire`.

**Tests.** In `commands.rs`, with `#[tokio::test(start_paused = true)]`: spawn 50 tasks that each call `acquire(100)`, and assert the virtual time elapsed is at least 0.49 s. Add a test that `acquire(0)` returns at once.

**Run.** `cargo test --locked --lib commands`.

---

## Phase 2 — Safety margin

### T3 — Ask before changing Profile while connected (C5) — DONE

**Problem.** Choosing another Profile, or importing one, takes effect at once even while connected with Control held. An import sets `self.saved.active` at `src/ui/mod.rs:1633`.

**Files.** `src/ui/mod.rs` (`profile_controls`, `profile_manager`, the import loop in `ui()`), tests in `src/ui/tests.rs`.

**Steps.**

1. Add `pending_profile: Option<String>` to `Desktop`.
2. Wherever the active Profile is set from user input (search `self.saved.active =`), route it through one function. If `self.session.connected()`, store the id in `pending_profile` instead of switching.
3. In `dialogs`, when `pending_profile` is set, show an `egui::Modal`: "Switch to **{name}** while connected to {device}? Tables and dashboards will address this device through that Profile's maps." Buttons: Cancel (focused by default) and Switch.
4. Import while connected: add the Profile, do **not** activate it, and toast "Imported {name}. It is not active because a device is connected."
5. Start-up selection and deletion of the active Profile are not user switches; leave them direct.

**Tests.** Extend the UI harness tests: with a connected session, selecting another Profile leaves `saved.active` unchanged until Switch is clicked; disconnected, it switches at once.

**Run.** `cargo test --locked --lib ui::tests`. Render `profiles`.

### T4 — Use the discovery reply's real source address (S1) — DONE

**Problem.** `scan_devices` ignores `_src` and trusts the IP in the payload (`src/backend/scanner.rs:79`).

**Files.** `src/backend/scanner.rs`, `src/backend/types.rs`, `src/ui/mod.rs` (connection panel), `src/ui/panes.rs` (Overview), one literal in `src/ui/tests.rs`.

**Steps.**

1. Add `claimed_ip: Option<String>` to `DiscoveredDevice`, with `#[serde(default)]`.
2. In the receive loop, pass the source address to the parser. Set `ip_address` to the source IP. Set `claimed_ip` to the payload's address only when it differs.
3. In the device list, when `claimed_ip` is set, show a warning glyph beside the address and a hover text: "This reply came from {source} but reports {claimed}. DSHub will connect to {source}."
4. Deduplication in `Session::drain` is by `ip_address`; it keeps working.

**Tests.** Unit test in `scanner.rs`: a response whose payload IP differs from the source yields the source in `ip_address` and the payload in `claimed_ip`; a matching one yields `None`.

**Run.** `cargo test --locked --lib scanner`.

### T5 — Review what an imported Profile can do (S2, C8) — DONE

**Problem.** An imported dashboard's buttons can send any command or write under any label, with confirmation off. Malformed command or metadata sections are dropped silently.

**Files.** `src/model.rs`, `src/ui/mod.rs` (import loop), tests.

**Steps.**

1. Add `Profile::require_confirmation(&mut self) -> usize`. It walks every dashboard, including container children, and sets `confirm = true` on Button, Dropdown, Value Write, Directional Control and Data Table widgets. It returns how many it changed.
2. Call it only on the user's file import path in `Desktop::ui`. Do not call it from `Profile::import` (round-trip tests and the Profile store use that), from bundled Profiles, or when loading stored Profiles.
3. Make `Profile::import` report what it skipped. Return the Profile together with a list of notes, or add `Profile::import_with_notes`. A section that is present but fails to parse (`sysCommands`, either metadata map, `nativeDashboards`) adds a note such as "Commands could not be read and were left out".
4. After a successful import, show one toast: "Imported {name}: {n} dashboards, {m} commands. {k} widgets that write or send commands now ask first; turn that off per widget once you have checked them." Append any notes.
5. Check that every confirmation message names the target: the entry name for a write, and the command name **and code** for a command. `Session::command` already does this; verify the write path in `Session::write_raw`.

**Tests.** Model test: a Profile with a non-confirming Button, including one nested in a Container, has both set after `require_confirmation`. Import test: a file with a malformed `sysCommands` section imports with a note.

**Run.** `cargo test --locked --lib model profile_compat`.

### T6 — Make critical commands visible in the Commands pane (U3) — DONE

**File.** `src/ui/panes.rs`, function `commands` (about line 656).

**Steps.**

1. List the Profile's own commands first. Put the three library commands (65000–65002) in a separate group below, under a caption "Library".
2. For a command with `critical == true`, show a warning glyph before its name in the warning role colour, with hover text "Critical: asks for press-and-hold". Colour its Send button text in the warning role.
3. Keep the single Argument field, but show the value it will send in each row's Send hover text: "Send with argument {value}".
4. Do not change how commands are sent.

**Check.** Render `commands`. The top rows must be the Profile's commands, and Write Flash and Reset Firmware must be marked.

---

## Phase 3 — Cheap wins

### T7 — Cap repaints from device events; two worker threads (P1, P2) — DONE

**Problem.** `set_notifier(move || ctx.request_repaint())` at `src/ui/mod.rs:577` repaints on every drain. With vsync off on Wayland the main thread woke 629–957 times a second under heavy polling.

**Steps.**

1. Change the notifier to `ctx.request_repaint_after(Duration::from_millis(25))`. egui keeps the earliest requested time, and `AppHandle` already notifies once per drain, so device data repaints at most about 40 times a second. Input still repaints immediately.
2. In `Session::new` (`src/ui/session.rs:152`) add `.worker_threads(2)` to the runtime builder.
3. Leave the 500 ms connected tick and the screenshot cadence as they are.

**Checks.**

- `cargo test --locked --lib runtime ui::tests`.
- Measure with the script in the appendix, before and after, on scenes `cnc` and `dashboard`. Main-thread wake-ups must drop to roughly 40–60 a second and thread count to about 16 or fewer. Values on screen must still update smoothly; render `cnc` to confirm it still draws.

### T8 — Run CI on master; add supply-chain checks (Q1, S3) — DONE

**File.** `.github/workflows/build.yml`; new `deny.toml`.

**Steps.**

1. Add `push: branches: [master]` to the triggers, keeping `tags: ['v*']`.
2. Give the build job `contents: read` by default. Move "Publish tagged release" into a job, or a step, that has `contents: write` and runs only for tags.
3. Pin every third-party action to a full commit SHA with the version in a comment. Resolve each SHA from the tag, for example `git ls-remote https://github.com/actions/checkout v4`. Actions used: `actions/checkout`, `dtolnay/rust-toolchain`, `Swatinem/rust-cache`, `actions/upload-artifact`, `softprops/action-gh-release`.
4. Add a Linux-only step running `cargo deny check advisories licenses sources` through `EmbarkStudios/cargo-deny-action` (pinned). Write `deny.toml` to allow the licences the tree already uses; run it locally first if `cargo-deny` can be installed, and report anything it flags instead of silencing it.
5. After archiving, write a checksum file per platform (`sha256sum dshub-* > dshub-<label>.sha256`, or `Get-FileHash` on Windows) and add `*.sha256` to the uploaded and released files.
6. Update `aur-bin/README.md` only if release asset names change. They should not.

**Check.** The workflow file must parse: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/build.yml'))"`. The real proof is the next push; tell the user that.

**Decision needed** if `cargo deny` reports an advisory: report it and ask before changing dependencies.

### T9 — Read visible rows once on connect (U1) — DONE

**Problem.** After connecting, entry tables show "Unread" everywhere until the user enables Live or presses Read all.

**Files.** `src/ui/session.rs`, `src/ui/panes.rs` (`entries`).

**Steps.**

1. Add `pub connection_epoch: u64` to `Session`. Increment it in `drain` when a `ConnectionStatus` arrives with `connected == true`.
2. In `entries`, after the table body has filled `visible`, compare the epoch with one stored in egui temp data under the pane id. If it differs, the session is connected and Live is off, send one `Action::Read` per visible row and store the epoch.
3. Reads still go through the normal queue and rate limiter.

**Tests.** UI harness test: after a connected status event, one frame of a Registers pane queues reads for the visible rows only, and a second frame queues none.

**Run.** `cargo test --locked --lib ui::tests`.

---

## Phase 4 — Throughput and loss

Do T10 first; T11 and T12 need it for their tests.

### T10 — Emulator fault options (Q2) — DONE

**File.** `emulator/dshub_emulator.py`, `emulator/README.md`.

**Steps.**

1. Add `--latency-ms N` (sleep before each reply, both transports), `--drop-rate F` (probability of not replying; UDP only — over TCP use `--latency-ms` to simulate a stall), and `--seed N` for repeatable drops.
2. Defaults keep today's behaviour exactly. `tests/protocol-vectors.json` must still pass.

**Run.** `python3 tests/test_cnc_emulator.py` if it covers the CLI, and the conformance test in a namespace.

### T11 — At most one outstanding read per polled address (C3) — DONE

**Problem.** A poll task enqueues on every tick, answered or not. When demand exceeds what the link serves, the 100-slot queue stays full and manual requests wait behind it. The fix must not add priority.

**Files.** `src/backend/communicator.rs` (`DeviceRequest`), `src/backend/poll.rs`, `src/backend/commands.rs` (literals).

**Steps.**

1. Add a guard type:
   ```rust
   /// Marks a poll's read as outstanding until the request is dropped,
   /// whether it was answered, timed out or discarded with the connection.
   pub struct InFlight(pub Arc<AtomicBool>);
   impl Drop for InFlight {
       fn drop(&mut self) { self.0.store(false, Ordering::Release); }
   }
   ```
2. Add `pub in_flight: Option<InFlight>` to `DeviceRequest`. Every existing constructor passes `None`.
3. In `spawn_address_poll_task`, create one `Arc<AtomicBool>` per task. On each tick, `if flag.swap(true, Ordering::AcqRel) { continue; }` skips the tick while the previous read is outstanding; otherwise build the request with `Some(InFlight(flag.clone()))`. If `tx.send` fails, the returned request is dropped and the flag clears by itself.
4. Take the rate-limiter slot only after the flag check, so skipped ticks do not consume slots.
5. The request is dropped at the end of each loop iteration in both communicators, after `settle`. Confirm nothing keeps it alive longer.

**Tests.**

- Unit: a poll task against a channel nobody reads enqueues exactly one request however long it runs (paused time).
- Emulator with `--latency-ms 20`: subscribe 20 addresses at 50 ms, then send a manual read; assert it is answered within about 0.6 s. Before this change it waits behind a full queue.

**Run.** `cargo test --locked --lib poll` and the emulator test in a namespace.

### T12 — Timeouts that follow the link; one UDP read retry (C4) — OPEN

**Decision needed before starting.** This changes when a connection is declared lost. Ask the user to confirm the numbers below, and whether any of their devices stall for more than a second during normal operation (for example while writing flash).

**Proposed behaviour.**

- Keep a smoothed round-trip time per connection (`srtt = 0.875·srtt + 0.125·sample`).
- Read requests (commands 1, 3 and 6) time out after `clamp(10 × srtt, 1 s, 5 s)`. Writes, Take Control and commands keep 5 s.
- A connection is lost after three consecutive timeouts **and** at least 5 s without any valid response. This keeps today's worst case and stops a short stall from forcing a reconnect.
- Over UDP only, a read that gets no reply by half its deadline is sent once more. Writes and commands are never resent: a duplicate could act twice.

**Files.** `src/backend/communicator.rs` only. Factor the deadline choice into a pure function and test that.

**Tests.** Unit tests for the deadline function and the loss rule. Emulator test with `--drop-rate 0.2 --seed 1` over UDP: polling continues without a reconnect for 10 s.

---

## Phase 5 — Colour and accessibility

Measured values and the method are in section 8 of the assessment. Add a small contrast helper in the test module of `src/ui/theme.rs` (relative luminance and ratio per WCAG 2.1) and use it in the tests below, so the palette cannot regress.

### T13 — Give input controls a visible outline (V1) — DONE

**Problem.** Resting outlines are 1.3–1.4:1 and strong outlines 1.7–2.2:1.

**Steps.**

1. Add an `outline` token to `Palette`: a colour with at least 3:1 against `surface`, `raised` and `well` in its theme. Starting points: dark `#70757d`, light `#868b93`. Adjust until the test passes.
2. Apply it to controls a user must find to operate: text inputs, drag values, combo boxes and checkboxes. In egui these draw with `visuals.widgets.inactive.bg_stroke`; buttons use the same stroke, so set a lighter stroke on buttons where the heavier outline makes dense toolbars noisy. Find the least intrusive way; do not restyle every call site by hand.
3. Leave separators, card borders and table grids faint.

**Tests.** Theme test: `outline` is at least 3.0:1 against `surface`, `raised` and `well` in both themes.

**Check.** Render `registers`, `editor`, `preferences` and `light`. Inputs must be clearly bounded; the interface must still read as calm.

### T14 — Status that does not depend on hue (V2, A3) — DONE

**Steps.**

1. Add `colors::role_glyph(role) -> &'static str` using icons already in the Phosphor font: check for ok, warning triangle for warn, cross for error, info for info, dot for idle and accent. Add them to `src/ui/icons.rs` and extend the glyph-coverage test in `fonts.rs`.
2. Use the glyph wherever a role is shown without text:
   - `lamp()` in `widgets.rs`: draw the glyph centred in the lit lamp, in the theme's `well` colour, when the lamp radius is 7 px or more. A threshold with a custom colour uses its role's glyph.
   - Data Table and Alarm List status dots: use the glyph instead of "●" when the role is not ok.
   - The device chip dot and write-outcome dots: same rule.
3. Change the dark theme's warning colour so it is clearly darker or lighter than the ok green. Starting point `#f59e0b`. In the light theme, pick ok, warning and error colours whose luminances differ from each other.
4. Keep every existing text label.

**Tests.** `colors.rs`: every role colour is at least 4.5:1 on `surface` and `raised` in both themes; ok and warning differ in relative luminance by at least 20 % in both themes.

**Check.** Render `cnc`, `dashboard`, `registers` and `light`.

### T15 — Theme-aware extra colours and plot traces (V3, V4) — DONE

**Steps.**

1. In `widgets.rs`, `EXTRA_COLOURS` holds one RGB per name. Give each a dark and a light variant (light variants at least 4.5:1 on the light `surface`). Stored thresholds keep the dark value; `colors::threshold` maps a stored value that equals a preset's dark variant to its light variant when the theme is light. Colours from the free picker are left as chosen.
2. Add a trace palette of eight colours per theme to `theme.rs`. In `panes.rs` `plot` and the Mini-Plot widget, assign `Line::color` from it by trace index, and alternate solid and dashed styles after the first four.

**Tests.** Theme test: every preset and trace colour is at least 3:1 on its theme's `well`.

**Check.** Render `plot` and `light`.

### T16 — Keyboard hold-to-confirm; segmented selected state (A1, A2) — DONE

**File.** `src/ui/controls.rs`.

**Steps.**

1. `hold_button`: treat Space or Enter held down while the button has keyboard focus the same as the pointer held on it. Releasing early cancels.
2. `segmented`: pass `selected` to the button (`Button::selected`) so AccessKit reports it, and draw a 2 px accent underline on the selected segment.

**Tests.** UI harness: focusing the hold button and holding Space for the hold time confirms; releasing early does not.

---

## Phase 6 — Usability

### T17 — Status bar: round-trip time, rate and backlog (U5) — DONE

**Files.** `src/backend/commands.rs` (`AppState`), `src/backend/communicator.rs` (`settle`), `src/ui/mod.rs` (`chrome`).

**Steps.**

1. Add lock-free metrics to `AppState`: last round-trip in microseconds, a request counter and a timeout counter (atomics).
2. Update them in `settle`. Queue depth is `QUEUE_CAPACITY - tx.capacity()`, read from the sender in `communicator_tx` with `try_lock`; never block the UI on it.
3. In the status bar show `{rtt} ms · {n} req/s` beside the existing counts, computed from the counter once a second. When the queue is more than half full for over a second, add a warning-coloured "Queue backing up" with hover text explaining that polling is faster than the device answers.

**Check.** Render `cnc`. With `--latency-ms 20` and many polled values the warning must appear.

### T18 — Disconnect button, shortcuts and interface scale (U6, U7, U8) — DONE

**Steps.**

1. **Disconnect:** in `device_controls`, when connected and holding Control, show a plain "Disconnect" button after the chip. When connected without Control, keep "Take control" as the primary action and put Disconnect in the chip's popup as today.
2. **Shortcuts:** Ctrl+S saves the dashboard draft or map-editor draft of the focused pane. Add a "Keyboard" section to the Guide listing Ctrl+K, `/`, Esc, Ctrl+S and Ctrl +/− zoom.
3. **Scale:** add `scale: f32` (`#[serde(default = …)]` 1.0) to `Preferences`. In Preferences → General add "Interface scale" with choices 90 %, 100 %, 110 %, 125 %, 150 %. Apply with `ctx.set_zoom_factor` when it changes and at start-up.

**Tests.** UI harness: Ctrl+S saves a dirty dashboard draft. Preferences round-trip keeps the scale.

### T19 — Tie Profiles to board types (U2) — DONE

**Decision needed:** confirm with the user that a Profile should be able to name its board types, and whether a mismatch should only warn (proposed) or block Take Control.

**Proposed steps.**

1. Add `board_types: Vec<u8>` to `Profile` with `#[serde(default)]`; empty means "any". Include it in the native export as an extra key, which older readers ignore.
2. Edit it in the Profile manager as a list of board types picked from the Profile's board-types map.
3. Remember the board type of the connected device: `Action::Connect` already has the address; look the device up in `session.devices`.
4. When the connected device's board type is known and not in a non-empty list, show a warning in the device chip: "{Profile} is not marked for {board}". If exactly one other Profile lists it, offer "Switch to {name}", which goes through T3's confirmation.

### T20 — Bundled dashboards become read-only templates (U4, R3) — DONE

**Decision needed:** confirm the behaviour change with the user.

**Proposed steps.**

1. Treat a dashboard as bundled when its id is one of the three `cnc-emulator-*-v2` ids or `default-widget-showcase`.
2. On a bundled dashboard, "Edit dashboard" is replaced by "Duplicate to edit", which copies it under a new id with the name "{name} (copy)" and opens the copy in edit mode.
3. `refresh_bundled` may then replace bundled dashboards on every revision without losing anything.
4. One-time migration: raise `BUNDLED_LAYOUTS`. If a stored bundled dashboard differs from the previous bundled layout, there is no way to know whether the user edited it, so keep it as "{name} (previous)" under a new id before replacing it.

---

## Phase 7 — Hygiene

### T21 — Small fixes — DONE except P3 and P5

Each is independent and small. Do them in any order.

| Finding | Change |
|---|---|
| C6 | In `Session::drain`, let a `WriteAck` or `CommandResponse` move an outcome from Unknown to Confirmed or Refused when its timestamp is later than `sent_at`. |
| C7 | In `Recorder::write`, remember the first error. `Session` toasts it once and stops the recording. |
| C9 | In `AppHandle::emit`, when the queue is full, drop the oldest droppable event without a full scan: keep a second deque of indices, or split telemetry into its own bounded deque. Keep the existing test passing. |
| S4 | In the emulator, print one warning line at start-up when not `--local`: it accepts Take Control from any host on the network. |
| S5 | In both `Export CSV` paths in `panes.rs`, double embedded quotes and prefix a cell with `'` when it starts with `=`, `+`, `-` or `@`. Add a unit test for the escaping function. |
| R1 | In `write_atomically`, open the temporary file, write, `sync_all`, then rename. |
| R2 | Before replacing a Profile file, rename the current one to `<id>.json.bak`. `load` already skips non-`.json` extensions. |
| P3 | Add `ParsedMap`-returning lookups that borrow (`parsed.at(address)`) at the hottest call sites in `widgets.rs` and `panes.rs` instead of `Profile::entry_at`, and cache `Profile::commands()` in the frame where it is called per row. Measure with the appendix script; drop this item if the change is below 0.5 % CPU. |
| P5 | In `ProfileStore::save`, skip serialising a Profile whose `PartialEq` comparison with the last saved value says it is unchanged; keep a clone or a hash per id. |
| V5 | Draw the top bar and status bar separators with the same stroke as dock separators. |

### T22 — Assert bundled layouts fit their boxes (Q3) — DONE

**Problem.** `dashboard_kit::height` repeats sizes the renderer decides.

**Steps.** In `src/ui/tests.rs`, render each bundled dashboard (the three CNC ones and the showcase) offline in the harness for two frames. Each widget stores its measured content size in egui temp data under `id.with("content-fit")`. Assert that no widget's fitted height exceeds its height by more than 2 px. Fix any estimate in `dashboard_kit.rs` the test exposes.

---

## Phase 8 — Later

These need a product decision or a larger block of time. Do not start them without the user asking.

| Finding | Outline |
|---|---|
| Q4 | Split `panes.rs` into one module per pane; follow the `WidgetSpec` plan in `2026-11-08-architecture-follow-ups.md`. |
| Q5 | Add macOS x86_64 or universal, Linux aarch64 and a Windows installer to CI. |
| U9 | Per-plot time window; optional second Y axis; undo for "Clear data". |
| U10 | "Fit to width" scaling for dashboards in view mode. |
| U11 | Plain numeric fields for thresholds and device values; keep drag for geometry. |
| P4 | A per-dashboard poll interval. |
| S6 | Document network isolation as a deployment requirement in README and PROTOCOL.md. A session token on Take Control needs a firmware change. |

---

## Appendix — load measurement script

Use this for T7, T17 and the P3 item. It needs the release build with the smoke fixture:

```bash
cargo build --locked --release --features native-smoke --target-dir target/native-smoke-build
```

Save as a scratch file (do not commit it) and run inside a namespace:

```python
import os, subprocess, sys, tempfile, time
BIN = 'target/native-smoke-build/release/dshub'
TCK = os.sysconf('SC_CLK_TCK')

def cpu(pid, task=None):
    path = f'/proc/{pid}/task/{task}/stat' if task else f'/proc/{pid}/stat'
    f = open(path).read().rsplit(')', 1)[1].split()
    return (int(f[11]) + int(f[12])) / TCK

def wakeups(pid):
    return int(open(f'/proc/{pid}/task/{pid}/schedstat').read().split()[2])

emulator = subprocess.Popen(['python3', '-u', 'emulator/dshub_emulator.py', '--local'],
                            stdout=subprocess.DEVNULL)
time.sleep(1)
try:
    for scene in sys.argv[1:]:
        with tempfile.TemporaryDirectory() as state:
            env = dict(os.environ, DSHUB_SMOKE_SCENE=scene,
                       XDG_DATA_HOME=state, XDG_CONFIG_HOME=state)
            env.pop('DSHUB_SCREENSHOT', None)
            app = subprocess.Popen([BIN], env=env, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL)
            time.sleep(6)
            c0, m0, w0, t0 = cpu(app.pid), cpu(app.pid, app.pid), wakeups(app.pid), time.time()
            time.sleep(10)
            dt = time.time() - t0
            threads = len(os.listdir(f'/proc/{app.pid}/task'))
            print(f'{scene:10} cpu {100 * (cpu(app.pid) - c0) / dt:5.1f}%  '
                  f'main {100 * (cpu(app.pid, app.pid) - m0) / dt:5.1f}%  '
                  f'wakeups/s {(wakeups(app.pid) - w0) / dt:6.1f}  threads {threads}')
            app.terminate(); app.wait(timeout=5)
finally:
    emulator.terminate()
```

```bash
unshare -rn sh -c 'ip link set lo up && python3 /path/to/measure.py cnc dashboard registers'
```

Baseline at commit `9c73c08` on a 16-core Linux machine under Wayland:

| Scene | CPU | Main-thread wake-ups / s | Threads |
|---|---|---|---|
| registers | 1.6 % | 133 | 30 |
| cnc | 3.1 % | 282 | 30 |
| dashboard | 4.0 % | 210 | 30 |
