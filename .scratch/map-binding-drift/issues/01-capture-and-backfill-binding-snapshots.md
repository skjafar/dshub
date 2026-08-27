# 01 — Capture and backfill binding identity snapshots

**What to build:** Every read binding, address-kind write target, and Plot series records a snapshot of what it was bound to — the entry's name and shape (type, array-ness, array size) — alongside the address it actually reads, writes, or polls. Anything persisted before this change gets its snapshot backfilled the first time it loads, from whatever entry currently sits at its stored address. This is the foundational data-model change every later ticket in this effort builds on.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] Binding a Widget to an entry via the existing address-picker records that entry's name, type, array-ness, and array size alongside the address.
- [x] Setting an address-kind write target (for a control Widget) records the same snapshot.
- [x] Adding a Plot series records the same snapshot alongside the address it already stores today (in addition to the name it already stores).
- [x] A Widget, write target, or Plot series saved before this change, once loaded under the new code, has its snapshot backfilled from whatever entry currently sits at its stored address — no crash, no data loss, no visible behavior change for anything that hasn't actually drifted.
- [x] A binding whose stored address has no entry at all (Map shrank since it was last saved) backfills without erroring — the pre-existing "not found" case keeps working exactly as it does today.
- [x] Command-code write targets are untouched by this change — they carry no snapshot.
- [x] Unit tests cover the backfill path against a hand-built Map and pre-snapshot binding/target/series shapes, including the "no entry at that address" case.

## Comments

**Resolved.** `shell/bindingIdentity.ts`'s `BindingSnapshot`/`snapshotFromEntry`/
`backfillSnapshot`/`isValidBindingSnapshot` are the foundation every later
ticket sits on. `WidgetBinding`, `WidgetTarget`'s `'address'` variant, and
`MiniPlotSeries` (`widgets/widgetConfig.ts`) each gained a `snapshot:
BindingSnapshot | null` field; `PlotSeriesConfig` (`panes/PlotPane.tsx`)
gained the same. Every address-picker call site in `WidgetConfigDialog.tsx`
now captures `snapshotFromEntry(entry)` on pick. `dashboardStore.ts`'s
validators accept `snapshot` as `undefined` (pre-feature data), `null` (a
backfill that found nothing), or a real object — never rejecting the
old shape outright, matching this codebase's own "additive field, not an
incompatible one" precedent. `dashboardStore.ts`'s new
`backfillDashboardWidgets` walks every Widget kind (including a Container's
children, and Data Table/Alarm List rows) recursively; `shell/bindingBackfill.ts`'s
`backfillProfileBindingSnapshots` does the same for a Workspace's (and every
Daughter Window's) saved Plot Pane state, and is the single entry point
`contexts/settingsMigration.ts` (for a `mapProfiles`-listed Profile) and
`SettingsContext.tsx`'s own effect (for the Default/CNC Profiles, whose Map
text is fetched separately) both call. Verified end-to-end against a real
running dev-server build (Playwright), not only unit tests: bind → edit the
Map → the drift shows up correctly.
