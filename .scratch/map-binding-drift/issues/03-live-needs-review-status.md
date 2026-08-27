# 03 — Live "needs review" status blocks bad reads and writes

**What to build:** Wire the per-binding resolver into what a Widget, control Widget, and Plot series actually do at render/decode/poll time, so nothing ever shows or acts on a value read from an address that no longer means what it did when it was bound. This is the safety-critical slice of the whole effort — it protects an Operator watching a live Dashboard the moment a Map changes, in every open Window, without needing the review UI (ticket 07) to exist yet.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] A read Widget whose binding resolves to moved, removed, or type-changed against the currently active Map shows a distinct "needs review" status instead of a value, replacing today's behavior of silently displaying whichever entry now occupies the old address.
- [x] The existing "not found" status keeps working for the case it already covers; "needs review" is additive, covering the moved/type-changed cases that were previously indistinguishable from a healthy binding.
- [x] A control Widget (button, dropdown, value-write) whose write target resolves to moved, removed, or type-changed refuses to fire, with a visible reason, instead of writing to a guessed or ambiguous address.
- [x] A Plot series whose binding resolves to moved, removed, or type-changed pauses — stops decoding/plotting new points — instead of continuing to decode raw bytes under stale assumptions.
- [x] The status is derived live against the currently active Map every time it's checked, not cached from a past review — a Dashboard or Plot Pane that was not open when the Map changed still shows the correct status the first time it's viewed afterward.
- [x] The status is visible identically in the Main Window and any Daughter Window showing the same Widget or Plot.
- [x] Manually verifiable today without any new review UI: rename, delete, or retype an entry in the existing Map Editor, save, and observe every open Widget/Plot bound to it react immediately.
- [x] Unit/hook tests feed a mismatched snapshot against a fake active Map and assert the resulting status, mirroring how the existing "not found" status is already tested.

## Comments

**Resolved.** `useWidgetReading.ts` gained a `'needs-review'`
`WidgetReadingStatus`, computed via `isBindingDrifted` and checked *before*
the existing not-found fallback (see issue 02's own comment for why that
ordering matters). Every kind built on it — `ValueReadWidget` and friends
via `WidgetStatusNotice`, Data Table/Alarm List rows via `rowStatusText`,
`DropdownWidget`/`ValueWriteWidget`'s own write gating — inherited the fix
for free. `ButtonWidget.tsx` has no `useWidgetReading` of its own (its
target is write-only) so it runs the same `isBindingDrifted` check inline,
replacing the button with a notice entirely rather than a disabled one,
matching the existing "not configured"/"not in Map" precedent.
`PlotPane.tsx`'s claim effect calls the same check per series on every
(re)subscription, releasing (and not re-claiming) a drifted series — a
paused series' retained points are cleared along with the release, which
reads as an acceptable, documented side effect of "not continuing to
decode stale bytes" rather than a separate requirement. New hook-level
tests in `widgets/__tests__/useWidgetReading.test.tsx` (including the
shifted-address regression from issue 02's own fix) and component-level
coverage in `ControlWidgets.test.tsx`/`PlotPane.test.tsx`. Hand-verified
end-to-end against a real dev-server build via Playwright: bind → rename
the entry in the Map Editor → save → the Widget/indicator react
immediately, with zero console errors.
