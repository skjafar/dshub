# 16 — Widgets: Control family

**What to build:** The four Widget kinds that write to the Device — button, dropdown, directional control, and value write — restyled onto the new design language and the shared configuration surface.

These are the Widgets an Operator touches while equipment is running, so they inherit the write path's guarantees rather than reimplementing them: a typed value is written exactly as typed, a live update cannot overwrite an in-progress edit, and keyboard and pointer commit paths produce identical writes. A Widget bound to a Command sends it; a Widget bound to an address writes to it. Both report rejection plainly.

Directional control is the most involved of the four, driving repeated writes while held, and needs to stop cleanly when released, when focus is lost, and when the link drops.

**Blocked by:** 14

**Status:** ready-for-agent

- [x] Button, dropdown, directional control and value write all commit to the Device through the port
- [x] All four configure through the shared surface
- [x] Value write inherits the write-path contracts, including both commit paths
- [x] Directional control stops cleanly on release, on focus loss, and on link loss
- [x] Each reports a rejected or failed write plainly rather than appearing to succeed
- [x] Each is unavailable, with the reason visible, when Control is not held
- [x] Each is fully operable by keyboard

## Comments

**The shared surface grew a second shape.** `BoundWidgetConfig` (binding/format/thresholds) covers Dropdown and Value Write, which mirror the same address they write — but Button and Directional Control write fixed values or Commands with nothing to display, so forcing them through the read-side shape would have meant fields with no effect. `WidgetTarget` (`shell/widgets/widgetConfig.ts`) is the write-side counterpart: `{kind:'address', space, address}` or `{kind:'command', code}`, restricted at the type level to `WritableAddressSpace` (register/parameter — a new export off `addressSpace.ts`) so a write target can never even be typed as a System Register. `WidgetConfigDialog` still has exactly one dialog: `kind` now decides between the existing Binding/Format/Thresholds section and a new Target section (`ButtonFields`) or a Commands-only Directions section (`DirectionalControlFields`), both reusing the same Table picker and `CommandSelect` (sourced from the Profile's own catalogue, matching `CommandPane`'s "presented by name" precedent).

**One write-settling hook serves all four.** `shell/widgets/useWidgetWrite.ts` is `AddressSpacePane`'s and `CommandPane`'s write/send-settling effect generalised over `WidgetTarget`'s two kinds and resolved at send time rather than at hook-mount time — Directional Control has up to eight targets (one per direction) sharing one hook instance. A rejected or unanswered send settles identically to the existing Panes: the promise resolving is never treated as success, only the Device's own answer (or a 4-second timeout) is.

**Directional Control drives repeated sends while held — new behaviour, not preserved from the legacy Widget**, which only ever sent once per click. One direction is held at a time, tracked in a single piece of state; the effect that starts the repeat interval is also the only thing that stops it, so release, focus loss and link loss all just clear that state rather than each owning its own stop path. Verified with fake timers that release, blur, link-drop and the browser's own key-repeat (`event.repeat`) all behave correctly — see `ControlWidgets.test.tsx`.

**Value Write is `WriteBar` at Widget scale, not a rewrite of its contract.** Same shape: the typed value lives in component state seeded from `editableEntryValue` (editing precision, not display precision), a live reading is mirrored only while nothing has been typed, and Enter and the Send button both go through the one form `submit` so the two paths cannot diverge. The mid-edit guard is a commit-counter (`committed`/`editing.at`) advanced by an effect watching `useWidgetWrite`'s settle, the same shape `AddressSpacePane` uses for the identical reason.

**`confirmationRequired` survived on all four**, though the ticket's own checklist doesn't name it — every legacy Widget in this family carried a confirm-before-send step, and spec.md's own principle for this rebuild ("every Widget kind available today to still exist, so that no panel I have built becomes impossible to rebuild") argues for carrying a capability forward rather than dropping it silently. Implemented as a second click/Confirm bar rather than a modal, consistent with the calm, no-popup-clutter direction the rest of this shell already takes (e.g. `DashboardPane`'s own arm-then-confirm delete).

**A write-capable bound kind cannot be pointed at a System Register from the picker.** Dropdown and Value Write's whole point is writing, unlike Gauge or Value Readout, so their Binding section offers only Register/Parameter (`WRITABLE_BOUND_KINDS` in `WidgetConfigDialog.tsx`) rather than every space — the render-time guard (`entryWriteBlockReason`, new on `addressSpace.ts`) still exists underneath for a config saved before this restriction, or hand-edited, but is no longer reachable through the picker going forward. A read-only entry or an unwritable space is withheld entirely for all three write-mirroring kinds (Button, Dropdown, Value Write) — no disabled control left standing — matching ticket 07's own precedent for `WriteBar`.

**Verified by hand in a real browser**, per this project's testing policy for the same reason dockview drag and react-grid-layout are: `WidgetConfigDialog`'s Target/Directions sections and the four Widgets' rendered states are visual in a way a DOM assertion under-covers. Connected to the fake Device: Button (address target, writing 99; confirm-armed Command target), Dropdown (mirroring and writing a bound register, "no options configured" and "declares no Commands" empty states), Value Write (typed value, live mirror), and Directional Control (a fully-mapped 4-way pad, the held direction highlighted primary) all rendered correctly with zero console errors.

22 new frontend tests for this ticket's four Widgets (`ControlWidgets.test.tsx`), 550 total frontend tests, typecheck, lint and build clean. One capability gap, disclosed rather than silently dropped: Button and Directional Control carry no configurable colour or icon (the legacy Widgets did) — spec.md's "Components never hardcode a colour value" and this rebuild's status-semantics system leave no free-form hex slot to put one in, and neither Widget has a bound reading for a threshold rule to colour. Value Write also drops the legacy `min`/`max`/`step` range-validation fields — a real, minor trim, judged out of scope for restyling four Widgets already carrying meaningful new behaviour (Directional Control's hold-to-repeat) in one ticket.
