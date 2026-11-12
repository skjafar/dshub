# DSHub dashboard widgets — consistency and appearance review

Date: 2026-11-12 · Scope: the sixteen dashboard widget kinds in `src/ui/widgets.rs`, their configuration, and how they look together on the built-in dashboards.

Companion document: [2026-11-12-widget-instructions.md](2026-11-12-widget-instructions.md) turns each finding into a task for an implementing agent. Finding IDs (W1, W2, …) are the same in both.

## Status on 2026-11-12

**20 of 21 findings are done and W16 is mostly done** (uncommitted). Each findings table has a Status column. Differences from the recommendations:

- **W1:** Encoder Display is merged into Value Readout, as recommended. The Value Readout has a "Multiply by a factor" option (scale factor, decimals, raw value). Stored Encoder Displays load as scaled readouts and export as `encoderDisplay` for the former application. There are now fifteen kinds.
- **W2:** As the user decided, the Unit field is **filled from the map when an entry is chosen** and left empty when the map has none. It is an ordinary field the user can edit; it is not inherited at draw time. Data Table and Alarm List still show the map's unit per row.
- **W5:** Button has a Style: Action, Neutral or Danger. Buttons whose first threshold was in the error role load as Danger, idle ones as Neutral, and their thresholds are dropped. Exports add a matching first threshold so the former application keeps the colour.
- **W10/W11:** A healthy widget shows no mark. When a table's rows all share one status that is not OK, the status shows once in the title; with every row healthy the mark column is left out.
- **W16:** The widget-level "A set bit is" option is done. The optional role per named bit in the map metadata is not.
- **W19:** The Data Table input is 64 px and appears on the hovered row; two built-in tables got shorter row names so they fit.

Found while fixing: the title row reserved space for an empty status area, and the layout test assumed a fixed title height. The test now measures the drawn title row and checks widths as well as heights; the built-in layout estimates were corrected.

## How this was done

- **Code.** I read the card code (title row, margins, outlines) and the drawing code of every kind.
- **Renders.** I rendered the Widget showcase and the CNC Operator dashboard against the emulator in five states: connected with Control, connected without Control, offline, light theme, and stretched with Fit width.
- **Not done:** I did not test with a real device, on Windows or macOS, or with a screen reader.

Severity: **P2** noticeable inconsistency or defect · **P3** polish. There are no P1 findings: every widget works.

## 1. Summary

The widgets work and the recent changes (borderless controls, text size, status shapes, the layout helper) moved them in the right direction. What holds them back is that each kind was drawn on its own. They do not share one anatomy, so small differences add up when they sit side by side:

1. **Two widgets do the same job.** Value Readout and Encoder Display both show one large number, with different options and a different frame (W1).
2. **Units come from two places, and Value Write shows none** (W2).
3. **Left edges do not line up** between widgets with a card and widgets without (W3).
4. **Buttons look different in every widget** that has one (W5).
5. **Two visible defects:** Value Write is a few pixels too wide for its box, and bar and gauge tracks disappear on the light theme (W12, W13).
6. **A green dot on every widget** is the largest source of visual noise on a healthy dashboard (W10).

Fixing the six above would do more for the look than any new feature. The rest of this report lists everything found, then a short proposal for one shared anatomy.

## 2. What is already good

| Area | Practice |
|---|---|
| Numbers | Values are monospaced and sized to fit their box. |
| Status | A reading that is stale, refused or offline says so in words, and now carries a shape. |
| Borderless controls | Buttons, labels, readouts and lamps no longer sit in a card inside a card. |
| Compactness | One-line widgets shrink to one line. |
| Screen readers | Custom-drawn lamps, bars and bit cells carry labels. |
| Safety | Writes ask first when configured; drifted bindings stop and say "Needs review". |
| Layout | Built-in dashboards are placed by a helper, and a test checks that content fits its box. |

## 3. Per-widget assessment

| Widget | Looks and works well | Weak points | Findings | Status |
|---|---|---|---|---|
| Value Readout | Large, clean number. | Ignores Decimals. Unit only from the widget's own field. | W1, W2, W15 | Done |
| Encoder Display | Scaling and decimals. | Duplicates Value Readout, with a card where that has none. Ignores Display format. | W1 | Merged into Value Readout |
| Gauge | Clear arc and centred value. | Sits left in a wide box. No threshold zones or ticks. Unit and limit text ignore Text size. Track invisible on light theme. | W8, W9, W13, W17 | Done |
| Progress Bar | Compact. | 8 px bar is thin. No limits shown. Track invisible on light theme. | W13, W18 | Done |
| State LED | Lamp with a state shape and label. | — | — | — |
| Status Matrix | Bit names from the map; MSB first. | A set bit is always green, even for a fault. Cell height ignores Text size. | W8, W16 | Done, except per-bit roles (W16) |
| Button | Fills its box; centred label; outcome mark. | Colour comes from a hidden trick (the first threshold). No hint when disabled. | W5, W6 | Done |
| Dropdown | Shows the current named value. | Menu stops at 220 px while other widgets fill the width. No hint when disabled. Outcome adds a row. | W6, W7, W9 | Done |
| Value Write | Read-back above the input. | A few pixels too wide (scroll bar appears). No unit. Plain Write button. Outcome adds a row. | W2, W5, W7, W12 | Done |
| Directional Control | 3×3 compass. | Buttons are plain while Button widgets are accent-coloured. No outcome shown. | W5, W7 | Done |
| Data Table | Aligned columns with units. | An input and Write button on every writable row, always visible. No column header. No write outcome. "Offline" repeated per row. | W7, W11, W19 | Done |
| Alarm List | State labels and colours. | "Offline" repeated per row. | W11 | Done |
| Device Info | Clear key/value grid. | — | — | — |
| Container | Titled group. | A carded widget inside it draws a second border. | W4 | Done |
| Mini-Plot | Compact trend. | Height is the box minus a fixed 70 px. Line is text-coloured. No current value. | W14 | Done |
| Label | Plain text; scalable. | No alignment, weight or colour. | W20 | Done |

## 4. Findings — consistency

| ID | Sev | Finding | Evidence | Recommendation | Status |
|---|---|---|---|---|---|
| W1 | P2 | **Value Readout and Encoder Display are the same widget twice.** Both draw one large number with a unit. Value Readout is borderless and honours Display format but ignores Decimals. Encoder Display has a card, a scale factor, decimals and a raw-value line, but ignores Display format. | [widgets.rs:2109](../../src/ui/widgets.rs:2109), [widgets.rs:2221](../../src/ui/widgets.rs:2221) | Merge them into Value Readout, with optional scale factor, decimals and raw-value line. Convert stored Encoder Displays on load, as was done for the LED Indicator. | Done: merged into Value Readout |
| W2 | P2 | **Units have two sources.** Readout, Gauge, Progress Bar and Encoder use the widget's own Unit field. Data Table and Alarm List use the map's metadata. Value Write and Dropdown show no unit. A widget bound to an entry that has a unit shows none until it is typed again. | [widgets.rs:1938](../../src/ui/widgets.rs:1938), [widgets.rs:2350](../../src/ui/widgets.rs:2350) | Use the entry's metadata unit by default everywhere. Keep the widget's Unit field as an override (empty means "use the entry's"). Show the unit in Value Write beside the read-back and the input. | Done: Unit filled from the map when an entry is chosen |
| W3 | P2 | **Left edges do not line up.** A carded widget insets its content 6 px; a borderless one starts at 0. In a CNC axis group the "Position" title is inset and the "Driver" title below it is not. | [widgets.rs:996](../../src/ui/widgets.rs:996) | Give borderless widgets the same horizontal inset as cards, or remove the card's inset inside containers (see W4). One rule, so every title and value starts on the same vertical line. | Done |
| W4 | P2 | **Cards inside groups draw a second border, and title style follows nesting, not meaning.** A Gauge or Encoder inside a Container is a box in a box. A widget's title is semibold at the top level and small and weak inside a Container, whatever the widget is. | [widgets.rs:1030](../../src/ui/widgets.rs:1030) | Inside a Container, draw carded widgets without a border (the group is the frame). Use one caption style (small, weak) for every bound widget's title at any depth; keep semibold for Container titles only. | Done |
| W5 | P2 | **Four button looks.** The Button widget has accent-coloured strong text and fills its box. Directional Control buttons are plain. Value Write and Data Table "Write" buttons are small and plain. The Button widget's colour is set by a hidden rule: its first threshold. | [widgets.rs:2052](../../src/ui/widgets.rs:2052), [widgets.rs:2328](../../src/ui/widgets.rs:2328) | Define three button styles — action (accent), neutral and danger — and use them in every widget. Give the Button widget a visible Style choice instead of the threshold trick; convert existing ones. | Done: Action, Neutral, Danger |
| W6 | P2 | **Disabled controls do not say why.** Without Control, dashboard buttons, Value Write, Dropdown options, jog buttons and table Write buttons are greyed with no explanation. The Registers table says "Take Control to write". | [widgets.rs:2480](../../src/ui/widgets.rs:2480) | One helper that adds the reason as hover text: no connection, no Control, read-only entry, or editing mode. | Done |
| W7 | P3 | **Write feedback differs by widget.** Button shows a mark at its right edge. Value Write and Dropdown append a status row under their content, which changes their height and can overflow a one-line box. Data Table and jog buttons show nothing. | [widgets.rs:2441](../../src/ui/widgets.rs:2441) | One inline outcome mark beside the control that sent the write, in every widget, with the outcome as hover text. No extra row. | Done |
| W8 | P3 | **Text size does not reach everything.** Gauge unit (11 px) and limits (10.5 px) are fixed. Status Matrix cells stay 18 px high while their labels scale. Bar thickness and jog row height are fixed. | [widgets.rs:2170](../../src/ui/widgets.rs:2170), [widgets.rs:2273](../../src/ui/widgets.rs:2273) | Scale every fixed size in a widget by its Text size. | Done |
| W9 | P3 | **Width use differs.** The Gauge is at most 260 px and sits at the left of a wider box. The Dropdown menu stops at 220 px. Value Write, bars and buttons fill the width. | [widgets.rs:2117](../../src/ui/widgets.rs:2117), [widgets.rs:2387](../../src/ui/widgets.rs:2387) | Centre the Gauge in its box. Let the Dropdown fill the width like the other controls. | Done |
| W10 | P2 | **Every bound widget carries a green dot.** CNC Operator shows fifteen. When everything is healthy the dots say nothing, and they are the busiest element on the screen. | [widgets.rs:1045](../../src/ui/widgets.rs:1045) | Show the status mark only when the reading is not OK (stale, refused, unread, offline). A healthy widget shows none. Keep the status in the hover text and for screen readers. | Done |
| W11 | P3 | **Offline and stale are repeated per row.** Data Table and Alarm List print "Offline" on every row. | [widgets.rs:1908](../../src/ui/widgets.rs:1908) | When every row shares one status, show it once in the widget's title row and keep only the mark per row. | Done |

## 5. Findings — defects seen in the renders

| ID | Sev | Finding | Evidence | Recommendation | Status |
|---|---|---|---|---|---|
| W12 | P2 | **Value Write is wider than its box.** The input is sized as "available width minus 60", and the Write button with its spacing needs more. A horizontal scroll bar appears, clearly visible on the light theme in the CNC axis groups and the showcase. | [widgets.rs:2359](../../src/ui/widgets.rs:2359) | Lay the row out right-to-left: place the button first, then give the input the rest. | Done |
| W13 | P2 | **Tracks vanish on the light theme.** Progress Bar and Gauge tracks use the `well` tone, which is white on the light theme against a near-white surface (about 1.1:1). An empty bar or gauge is invisible. | [widgets.rs:2140](../../src/ui/widgets.rs:2140), [widgets.rs:2584](../../src/ui/widgets.rs:2584) | Add a `track` tone that is clearly visible on both themes (about 1.5–2:1 against surfaces, with the filled part at least 3:1 against it) and use it for bars, the gauge arc and unlit lamps. | Done |
| W14 | P3 | **Mini-Plot height is a guess.** It is the widget height minus 70 px, whatever title and padding it has. Its line uses the text colour, not the trace palette, and it shows no current value. | [widgets.rs:2413](../../src/ui/widgets.rs:2413) | Size the plot from the space left. Use the first trace colour. Show the latest value and unit at the right of the title row. | Done |

## 6. Findings — capability and polish

| ID | Sev | Finding | Recommendation | Status |
|---|---|---|---|---|
| W15 | P3 | **Large numbers are hard to read.** `24000` and `1137180672` have no digit grouping. | An optional thin-space grouping for decimal values (`24 000`), on by default for readouts and tables. | Done |
| W16 | P3 | **A set bit is always green.** In an interlock or fault word a set bit means trouble, but the Status Matrix lights it in the ok colour. | A widget option "A set bit is: ok / warning / error", and optionally a role per bit in the map metadata. | Partly done: widget option done; per-bit roles from the map not done |
| W17 | P3 | **The Gauge shows no limits on its arc.** Thresholds colour the value only; nothing shows where the warning zone starts. | Draw threshold zones as thin coloured arcs outside the main arc, and a tick at each threshold. | Done |
| W18 | P3 | **The Progress Bar is thin and unlabelled.** 8 px, with no minimum, maximum or threshold marks. | A 12 px bar (scaled by Text size), optional min and max labels under it, and a notch at each threshold. | Done |
| W19 | P3 | **Data Table rows are always in edit mode.** Every writable row shows an empty input and a Write button, and there is no column header. | Show the input when the row is hovered, focused or has text typed, as the Registers table does. Add an optional header row. | Done |
| W20 | P3 | **Label has only text and size.** Headings cannot be centred, bold or muted. | Add alignment (left, centre, right), weight (regular, semibold) and tone (normal, weak, accent). | Done |
| W21 | P3 | **Corner radii and strokes vary** without a rule: cards 4, buttons 3, bit cells and bars 2. | Name three radii in the theme (control 3, card 4, cell 2) and use them by name. | Done |

## 7. Proposal — one widget anatomy

Every bound widget would be built from the same three optional rows, by shared helper functions instead of per-kind code:

| Row | Content | Rule |
|---|---|---|
| Caption | Label on the left; value-in-brief or status on the right. | Small, weak text. Status mark only when not OK (W10). Hidden when the label is empty and the status is OK. |
| Value | The number, lamp, bar, arc, bits or plot. | Monospaced numbers with the entry's unit (W2). Starts at the shared left inset (W3). |
| Control | Input, menu or buttons. | Shared button styles (W5), shared disabled hint (W6), inline outcome mark (W7). Fills the width (W9, W12). |

Shared tokens: one horizontal inset, one row gap, three radii (W21), a `track` tone (W13), and every fixed size multiplied by the widget's Text size (W8).

With that in place, merging Encoder Display into Value Readout (W1) and dropping borders inside groups (W4) are small steps, and new widget kinds get the same look for free.

## 8. Suggested order

1. **Defects:** W12, W13.
2. **Quick consistency:** W6, W9, W8, W10.
3. **Shared anatomy:** W3, W4, W2, W5, W7, W11, W21.
4. **Merge:** W1.
5. **Polish:** W14, W15, W16, W17, W18, W19, W20.
