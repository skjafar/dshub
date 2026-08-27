# 06 — Profile-wide binding scanner

**What to build:** A pure function that enumerates every read binding, address-kind write target, and Plot series belonging to a Profile — across every Dashboard and every Workspace's saved Pane state — independent of what is currently open in any Window. This is what makes the eventual review (ticket 07) exhaustive rather than limited to whatever happens to be on screen when a Map is edited.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] Given a Profile's persisted settings, returns every read binding and every address-kind write target from every Widget in every Dashboard belonging to that Profile.
- [x] Also returns every Plot series from every Plot Pane's saved state in every Workspace belonging to that Profile, including Panes not currently open in any Window.
- [x] Each returned item identifies which Dashboard (and Widget) or which Workspace/Pane (and series) it belongs to, sufficient to group and label it in a later review.
- [x] Bindings/targets/series belonging to a different Profile are never included.
- [x] Command-code write targets are never included (no snapshot, not subject to drift).
- [x] Unit tests over a hand-built settings blob containing: a Dashboard with multiple Widget kinds including a control Widget's address-bound target; a Workspace with both an open and a not-currently-open Plot Pane's saved state; and a second Profile's data, asserted absent from the results.

## Comments

**Resolved.** `shell/bindingScanner.ts`'s `scanProfileBindings` walks every
Dashboard's Widgets (recursing into a Container's own children, and each
Data Table row / Alarm List entry, addressed by its own `BindingCoordinate`
since a row carries no id of its own) and every Workspace's saved
`paneStates` (both the Main Window's own and every Daughter Window's),
picking out Plot Panes by `kindOfPaneId` and reading their `series`
directly from the persisted blob — independent of what dockview currently
has open, exactly as the ticket asks. Profile isolation is structural: the
function takes already-scoped `ProfileDashboards`/`ProfileWorkspaces`
rather than a Profile id, so a caller (`settingsMigration.ts`,
`AppShell.tsx`) can only ever hand it one Profile's own collections.
Command-code targets are excluded by construction (only `button`'s
`target.kind === 'address'` branch is scanned); an unbound or
snapshot-less binding is skipped too, since there's nothing to diff a Map
edit against. `bindingsNeedingReview` (scanner + resolver composed) is the
one function both issue 07's review and issue 08's indicator build their
list from. Unit tests cover every Widget kind, Container nesting, Data
Table rows, an open and a backgrounded Plot Pane, a Daughter Window's own
Plot Pane, and confirm nothing leaks from a Profile's collections that
were never passed in.
