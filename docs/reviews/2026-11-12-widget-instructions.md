# DSHub dashboard widgets — improvement instructions

For: an implementing agent (Claude Opus) working in this repository.
Source: [2026-11-12-widget-review.md](2026-11-12-widget-review.md). Every task names the finding IDs it resolves (W1, W2, …). Read the finding before starting its task.

## Status on 2026-11-12

All eighteen tasks are done (uncommitted). The user chose the three button styles (WT9) and the Encoder merge (WT11). WT8 follows the user's rule instead of step 1: choosing an entry fills the Unit field from the map, or empties it; the user may edit it. Details are in the review's Status section.

## How to use this document

Work through the phases in order. Tasks inside a phase are independent unless one says otherwise. Do one task at a time: implement, run its checks, render, add a changelog line, then report. Stop and ask the user when a task says **Decision needed**.

### Rules for every task

The general rules in [2026-11-11-improvement-instructions.md](2026-11-11-improvement-instructions.md) ("Rules that apply to every task") all apply: no request priority, no network I/O on the egui thread, serde defaults on new stored fields, targeted tests only, named smoke scenes only, an isolated network namespace for anything that starts the emulator, no commits unless asked.

Rules specific to widget work:

1. **Stored dashboards must keep loading.** New `Widget` fields need `#[serde(default)]` (or a default function). A removed or merged kind is converted on load in `Dashboard`'s `From<DashboardData>` (`src/model.rs`), the way `LedIndicator` is. The version-one portable format must keep importing all sixteen former kind names (`src/profile_compat.rs`).
2. **Heights live in two places.** `src/dashboard_kit.rs::height` estimates what `src/ui/widgets.rs` draws. Whenever a task changes a widget's height, update the estimate. The test `built_in_dashboard_widgets_fit_their_boxes` in `src/ui/tests.rs` fails when they drift; run it after every task:
   ```bash
   cargo test --locked --lib built_in_dashboard_widgets
   ```
3. **Built-in dashboards changed? Raise `BUNDLED_LAYOUTS`** in `src/ui/mod.rs`, so stored copies are refreshed. Built-in dashboards are read-only, so this loses nothing.
4. **Look at it.** Every task ends with renders in both themes. The smoke fixture draws the CNC Operator dashboard (`cnc`), a copy in edit mode (`cnc-edit`) and one of every kind (`dashboard`); `light` is the light theme:
   ```bash
   unshare -rn sh -c 'ip link set lo up && bash tests/native-smoke.sh target/native-smoke cnc cnc-edit dashboard light'
   ```
   To see the Widget showcase, or the offline and no-Control states, temporarily make `configure_smoke` in `src/ui/smoke.rs` select the Default Profile or skip `Action::Connect` / `Action::Control`, render, and restore the file from a copy. Never leave such a change in the tree; check with `git diff --stat src/ui/smoke.rs`.
5. **Colour changes come with a contrast test.** `src/ui/theme.rs` has a `contrast` test module (WCAG ratio and luminance). New tones are asserted there.
6. **Text size applies.** Any fixed pixel size a task adds inside a widget is multiplied by `w.text_size.clamp(0.5, 4.)`.

### Task index

| Phase | Task | Resolves | Size | Status |
|---|---|---|---|---|
| 1 Defects | WT1 Value Write fits its box | W12 | S | Done |
| | WT2 Visible tracks on the light theme | W13 | S | Done |
| 2 Quick consistency | WT3 Say why a control is disabled | W6 | S | Done |
| | WT4 Centre the Gauge; full-width Dropdown | W9 | S | Done |
| | WT5 Text size reaches every part | W8 | S | Done |
| | WT6 Status mark only when not OK | W10, W11 | S | Done |
| 3 Shared anatomy | WT7 One inset, one caption style, no nested borders | W3, W4, W21 | M | Done |
| | WT8 Units from the entry | W2 | M | Done |
| | WT9 Button styles | W5 | M | Done |
| | WT10 One write-outcome mark | W7 | M | Done |
| 4 Merge | WT11 Encoder Display becomes Value Readout | W1 | M | Done |
| 5 Polish | WT12 Mini-Plot | W14 | S | Done |
| | WT13 Digit grouping | W15 | S | Done |
| | WT14 Status Matrix bit meaning | W16 | M | Done |
| | WT15 Gauge zones and ticks | W17 | S | Done |
| | WT16 Progress Bar | W18 | S | Done |
| | WT17 Data Table editing and header | W19 | M | Done |
| | WT18 Label options | W20 | S | Done |

Sizes: S under half a day, M about a day.

---

## Phase 1 — Defects

### WT1 — Value Write fits its box (W12) — DONE

**Problem.** In `render_widget`, the Value Write arm sizes the input as `ui.available_width() - 60` and then adds the Write button. Button plus spacing needs more than 60 px, so the row overflows and a horizontal scroll bar appears (visible on the light theme).

**File.** `src/ui/widgets.rs`, the `WidgetKind::ValueWrite` arm.

**Steps.**

1. Lay the row out right-to-left: add the Write button first, then the `TextEdit` with `desired_width(ui.available_width())`. Keep Enter-to-submit and the enabled rule.
2. Do the same in the Data Table row if its input can overflow at the widget's minimum width.

**Tests.** Extend the UI harness: render a 120 px wide Value Write for two frames and assert that the recorded content width (`fits::take()`, the second tuple element's `x`) does not exceed the box width. Add the same assertion for width to `built_in_dashboard_widgets_fit_their_boxes`.

**Check.** Render `light`-themed CNC Operator: no scroll bar under the axis groups.

### WT2 — Visible tracks on the light theme (W13) — DONE

**Problem.** Progress Bar and Gauge tracks are drawn in `palette.well`, which is white on the light theme, on a near-white surface.

**Files.** `src/ui/theme.rs`, `src/ui/widgets.rs` (`level_bar`, the vertical bar, the Gauge arc, the off state of `lamp`).

**Steps.**

1. Add `track: Color32` to `Palette`: the empty part of a bar, arc or lamp. Aim for **1.5:1 to 2:1 against `surface` and `raised`** in both themes: clearly visible, and clearly quieter than a filled bar. Starting points: dark `#34363b`, light `#c9ced6`.
2. Use it for the bar track, the Gauge's background arc and the off-lamp fill.

**Tests.** In the theme test: `track` is between 1.4:1 and 2.5:1 against `surface` and `raised` in both themes, and every status colour is at least 3:1 against `track` (a filled bar must stand out from its track).

**Check.** Render `dashboard` and `light`.

---

## Phase 2 — Quick consistency

### WT3 — Say why a control is disabled (W6) — DONE

**File.** `src/ui/widgets.rs`.

**Steps.**

1. Add a helper:
   ```rust
   /// Why a write or command control cannot be used now, if it cannot.
   fn blocked(session: &Session, editing: bool, writable: bool) -> Option<&'static str>
   ```
   returning, in this order: "Leave Edit dashboard to use this control", "Connect to a device first", "Take Control to write or send commands", "This entry is read-only".
2. Use it for the enabled flag (`blocked(..).is_none()`) and the hover text (`on_disabled_hover_text`) in: `filled_button` callers (both Button paths), Value Write's Write button, Dropdown options, Directional Control buttons, and the Data Table Write button.

**Tests.** UI harness: without Control, hovering a dashboard Button shows text containing "Take Control".

### WT4 — Centre the Gauge; full-width Dropdown (W9) — DONE

**Steps.**

1. Gauge: allocate the full available width and centre the arc in it. The arc's own width stays capped (260 px times text size).
2. Dropdown: `.width(ui.available_width())`.

**Check.** Render `dashboard`: the default Gauge sits in the middle of its 300 px box, and the Dropdown spans it.

### WT5 — Text size reaches every part (W8) — DONE

**Steps.** With `let scale = w.text_size.clamp(0.5, 4.)`:

1. Gauge: unit font `11. * scale`, limit font `10.5 * scale`; move the limit labels down by the scaled size.
2. Status Matrix: cell height `18. * scale`.
3. Progress Bar: thickness `8. * scale` (WT16 changes the base to 12).
4. Directional Control: row height `(interact_size.y + 12.) * scale`.
5. Update `dashboard_kit::height` for each: it already multiplies most rows by `scale`; make sure these match.

**Tests.** Extend `widget_text_is_optional_and_scalable`: a Status Matrix at 200 % is about twice as tall as at 100 %.

### WT6 — Status mark only when not OK (W10, W11) — DONE

**Problem.** Every bound widget shows a green dot in its title row. Tables repeat the status text on every row.

**Steps.**

1. In the title row (about line 1038), draw the status mark and text only when `role != Role::Ok`. Keep the status in the title's hover text ("Read OK") and in accessibility labels.
2. `titled` already hides the row when the label is empty and the status is OK; no change.
3. Data Table and Alarm List: when every row has the same non-OK status, show that status once at the right of the widget's title row and draw only the mark in each row. When rows differ, keep per-row text.
4. `dashboard_kit::height` is unaffected.

**Tests.** UI harness: a healthy bound Value Readout draws no "●" in its title row; a stale one draws the warning mark and "Stale".

**Check.** Render `cnc`: no green dots; render the showcase offline: each widget says "Offline" once.

**Decision needed** only if the user prefers to keep a healthy indicator: then make it a Preferences option, default off.

---

## Phase 3 — Shared anatomy

These four tasks touch the same code. Do them in order, and keep `render_widget` behaviour identical apart from what each task states.

### WT7 — One inset, one caption style, no nested borders (W3, W4, W21) — DONE

**Steps.**

1. **Tokens.** In `src/ui/theme.rs` add constants: `RADIUS_CONTROL = 3`, `RADIUS_CARD = 4`, `RADIUS_CELL = 2`, `WIDGET_INSET = 6.`. Replace the literal radii in `widgets.rs` with them.
2. **Inset.** Every widget's content starts `WIDGET_INSET` from its left and right edge, card or not. Exceptions: Button and Label keep filling their box edge to edge. Borderless widgets keep zero vertical margin so they still shrink to one line.
3. **Nested borders.** A carded widget whose parent is a Container (`depth > 0`) is drawn without fill or outline; the group is its frame. Top-level cards are unchanged.
4. **Caption style.** A bound widget's title uses one style at any depth: small, weak. Container titles stay semibold. Top-level borderless widgets therefore get the same quiet caption as nested ones.
5. Update `dashboard_kit.rs`: the `card` allowance still applies to carded kinds (their vertical margin is unchanged); adjust `inner()` users only if widths change. Raise `BUNDLED_LAYOUTS`.

**Tests.** `built_in_dashboard_widgets_fit_their_boxes`. A harness test that the title text and the value text of a carded and a borderless widget stacked in a Container start at the same x.

**Check.** Render `cnc`, `dashboard`, `light`. In an axis group, "Position", "Driver" and "Target position" must line up on the left, with no box around Position.

### WT8 — Units from the entry (W2) — DONE

**Steps.**

1. Add a helper `fn unit<'a>(w: &'a Widget, meta: Option<&'a Metadata>) -> &'a str`: the widget's `unit` when it is not empty, otherwise the entry's metadata unit, otherwise empty.
2. Use it wherever `w.unit` is read in `render_widget` (Readout, Gauge, Progress Bar, Encoder, accessibility descriptions).
3. Value Write: show the unit after the read-back value and, weakly, after the input.
4. Dropdown: no unit (its options are named values).
5. In Configure, the Unit field's hint becomes the entry's unit ("from the map: RPM"), so it is clear that empty means inherited.
6. Built-in dashboards (`cnc_dashboard.rs`, `showcase_dashboard.rs`, and the SCE2 generator) copy metadata units into widgets today; remove those copies where the metadata has the same unit. Raise `BUNDLED_LAYOUTS`.

**Tests.** Harness: a Value Readout with an empty Unit bound to an entry with metadata unit "RPM" draws "RPM"; with Unit "rpm" it draws "rpm".

### WT9 — Button styles (W5) — DONE

**Decision needed:** confirm the three styles and that existing E-stop-style buttons (first threshold in the error role) convert to "danger".

**Steps.**

1. Model: add `ButtonStyle { Action, Neutral, Danger }` (a `text_enum!`, fallback `Action`) and `Widget::style` with `#[serde(default)]`.
2. Conversion on load (in `Widget::convert_legacy`): a Button whose first threshold has role `error` becomes `Danger`, role `idle` becomes `Neutral`; then clear those thresholds. Keep importing version-one buttons the same way.
3. One drawing function for dashboard buttons, replacing the ad-hoc ones:
   - **Action:** accent text on the control fill (today's look).
   - **Neutral:** normal text on the control fill.
   - **Danger:** error-role text and an error-role outline at 3:1; never a solid red fill (CLAUDE.md: restrained colour).
4. Use it for: the Button widget (its Style), Directional Control (Neutral), Value Write and Data Table "Write" (Action, small).
5. Configure: a "Style" segmented control for Button; remove the thresholds section from Button.
6. `cnc_dashboard.rs`: EMERGENCY STOP uses `Danger`; drop its threshold. Raise `BUNDLED_LAYOUTS`.

**Tests.** Model: a stored Button with an error-role first threshold loads as `Danger` with no thresholds. Round-trip through `profile_compat`.

**Check.** Render `cnc`, `light`.

### WT10 — One write-outcome mark (W7) — DONE

**Steps.**

1. Add `fn outcome_mark(ui, outcome: Option<&WriteOutcome>)`: draws the role glyph (`colors::role_glyph`) in the role colour at the current position, with the outcome label as hover text; draws nothing for `None`.
2. Value Write: draw it between the input and the Write button (inside the right-to-left row from WT1). Remove the appended `outcome_inline` row at the end of `render_widget`.
3. Dropdown: draw it at the right end of the combo row.
4. Data Table: draw it after the row's Write button, from `session.writes`.
5. Directional Control: draw it in the empty centre cell of the compass for the last jog command sent (`session.commands`).
6. Button keeps its mark; make it use the same function.
7. Heights no longer change when a write is pending; no `dashboard_kit` change.

**Tests.** Harness: after a write is sent from a Value Write, the widget's fitted height equals its height before the write.

---

## Phase 4 — Merge

### WT11 — Encoder Display becomes Value Readout (W1) — DONE

**Decision needed:** confirm the merge with the user. It removes a kind from the Add widget menu and from the showcase (fifteen kinds).

**Steps.** Follow the LED Indicator merge in `src/model.rs` as the pattern.

1. Value Readout gains the Encoder's options: scale factor (`factor`, default 1), decimals, and "Show raw value" with its unit. With factor 1 and no decimals set, it formats with Display format as today; otherwise it formats `value * factor` with `decimals`. Add a `#[serde(default)]` flag such as `scaled: bool` so existing readouts keep their exact output.
2. `WidgetKind::EncoderDisplay` stays in the enum, hidden (`#[doc(hidden)]`), out of `WidgetKind::ALL`, and is converted to `ValueRead` with `scaled = true` in `Widget::convert_legacy`.
3. `profile_compat`: import `encoderDisplay` as a scaled Value Readout; export scaled readouts as `encoderDisplay` so the former application still shows them.
4. The merged widget is borderless, like Value Readout. Update `frameless()`, `min_height()`, `dashboard_kit::height` and the CNC dashboards (Position readouts). Remove the Encoder card from the showcase. Raise `BUNDLED_LAYOUTS`.
5. Update the tests that count kinds (`WidgetKind::ALL` length, showcase, `all_widget_kinds_roundtrip…`).

**Tests.** Model: a stored Encoder Display loads as a Value Readout that renders the same text. `profile_compat` round trip.

---

## Phase 5 — Polish

### WT12 — Mini-Plot (W14) — DONE

1. Plot height: `ui.available_height()` inside the widget's content, not `w.height - 70`.
2. Line colour: `theme::trace(dark, 0)`, or the matching threshold's colour.
3. Title row: latest value and unit at the right, weak, monospaced.
4. Update `dashboard_kit::height` only if the minimum changes.

### WT13 — Digit grouping (W15) — DONE

1. Add `fn grouped(text: &str) -> String` in `src/model.rs` near the formatting code: inserts a thin space (U+2009) every three digits of the integer part of a decimal number; leaves hexadecimal, binary and text alone. Unit-test it, including negatives and decimals.
2. Check that U+2009 exists in the bundled fonts (`fonts.rs` glyph test); fall back to a normal space if not.
3. Apply to Value Readout, Gauge, Data Table and Alarm List values. Add a Preferences → Data switch "Group digits", default on. Never group inside an input field.

### WT14 — Status Matrix bit meaning (W16) — DONE

1. Widget option "A set bit is" with choices ok, warning, error (store as a `Role`, `#[serde(default)]` = ok). Lit cells use that role's colour and, at widths that allow it, its glyph.
2. Optional, if the map metadata is being touched anyway: a role per named bit in `Metadata::bits`, overriding the widget's choice.
3. The SCE2 generator's interlock and warning matrices set error and warning.

### WT15 — Gauge zones and ticks (W17) — DONE

1. For each threshold with a comparator of `>`, `>=`, `<` or `<=`, draw a thin arc (2 px times text size) just outside the main arc over the range it covers, in its colour at reduced strength.
2. Draw a short tick at each threshold value.
3. Keep the value text colour rule as it is.

### WT16 — Progress Bar (W18) — DONE

1. Base thickness 12 px times text size.
2. Option "Show limits": minimum and maximum under the ends of the bar, weak and monospaced.
3. A 2 px notch on the bar at each threshold value.
4. Update `dashboard_kit::height`.

### WT17 — Data Table editing and header (W19) — DONE

1. Show a row's input and Write button only when the row is hovered, its input has focus, or text is typed in it; otherwise show nothing in those cells. Keep the cells allocated so columns do not move.
2. Option "Show header": a caption row "Name · Value · Unit".
3. Use WT10's outcome mark.

### WT18 — Label options (W20) — DONE

1. Add alignment (left, centre, right), weight (regular, semibold) and tone (normal, weak, accent), each `#[serde(default)]`.
2. Configure: three segmented controls under the text.
3. The showcase heading uses semibold.
