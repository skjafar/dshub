# 14 — Dashboard Pane and shared Widget configuration

**What to build:** The Dashboard as a Pane, keeping its own internal Widget grid rather than dissolving into Panes. Two layout systems coexist on purpose, separated by scale: the Workspace arranges tools, the Dashboard composes instruments. A Dashboard belongs to a Profile, and a Profile may have several.

Alongside it, the configuration surface every Widget shares. Today each of the sixteen Widget kinds re-implements address binding, value formatting and threshold evaluation, and that duplication is the sprawl this rebuild exists to escape. Built once here, it means learning one Widget teaches an Operator the others.

This ticket delivers the Dashboard, the grid, and the shared configuration — with a single simple Widget kind as proof that the whole path works end to end. The other fifteen follow in the three batches after it.

**Blocked by:** 07

**Status:** ready-for-agent

- [x] A Dashboard Pane hosts a Widget grid where Widgets can be placed and resized
- [x] A Profile can hold several Dashboards, switchable within the Pane
- [x] Address binding, value formatting and threshold evaluation are configured through one shared surface
- [x] Configuring a Widget uses the same vocabulary and layout regardless of Widget kind
- [x] A Widget whose Device data goes stale says so plainly rather than showing a frozen value as live
- [x] One Widget kind is delivered end to end as proof of the path
- [x] Behaviour tests exercise binding, formatting, thresholds and the stale state through the shared surface

## Comments

**The Dashboard Pane is a parallel system, not a rebuild of the legacy one in place.** `client/src/components/dashboard/*`, `DashboardPanel.tsx` and `types/dashboard.ts` stay exactly as they are — still wired into the old sidebar view router — until ticket 22 contracts the old view layer away. The new Pane lives under `shell/`, keyed by a new settings field (`dashboardsByProfile`) that starts empty per the rebuild's own migration decision: Dashboards are not carried across, only Profiles are.

**The shared surface is `BoundWidgetConfig`** (`shell/widgets/widgetConfig.ts`): a label, a nullable `{space, address}` binding narrowed from the existing `AddressSpace` type (not `DataSource` — a Widget binds to an addressable space, never a Command), a `DisplayFormat` reusing `shell/valueFormat.ts`, and an ordered list of threshold rules. `WidgetConfigDialog` is the one place all three are edited, for every Widget kind there will ever be — it takes no `kind` parameter at all, which is what makes "same vocabulary regardless of kind" true by construction rather than by convention.

**Threshold evaluation (`shell/widgets/threshold.ts`) returns `null` when no rules are configured**, not `'ok'` — a Widget nobody has set a threshold on has no condition to report, which reads differently from reporting a good one. Once a rule exists, an unmatched value reads as `'ok'`, since threshold rules are authored as "warn past here, error past there" and everything below the lowest bound is implicitly fine.

**Staleness is the existing `linkState` derivation, not a Widget-local heuristic.** `useWidgetReading` (`shell/widgets/useWidgetReading.ts`) composes the same four primitives every other new-shell surface already uses — `useMapEntries` for the name behind an address, `useSpaceBinding` for the live readings table, `usePolledTargets` for the coalesced subscription, `linkState.isStale` for whether a reading is current — so a Widget's stale state cannot drift from a Pane's.

**`valueRead` is the Widget kind delivered end to end**, chosen because it appears first in ticket 15's own "Value and Indicator" family and needs nothing beyond the shared config shape — no write path, no kind-specific fields — making it the cleanest proof that binding, formatting, thresholds and staleness all reach a Widget through the shared surface alone.

**Widget placement uses a fixed 12-column grid** (`GRID_COLS` in `DashboardPane.tsx`) rather than columns derived from the measured container width, which the legacy Dashboard did. `react-grid-layout`'s `correctBounds` clamps against the column count at mount, so a variable column count meant the legacy grid could not safely mount before its container was measured, without risking a saved layout being silently rewritten. A fixed column count makes that hazard structural rather than something to work around: `correctBounds` never depends on pixel width, so the new grid mounts immediately (useful in its own right for testability) and is still safe.

**Verified by hand in a real browser**, per this project's testing policy for the same reason dockview drag is: react-grid-layout's own drag and resize are genuinely visual. Screenshots confirmed the empty state, an unconfigured Widget's affordance, the config dialog's binding/format/threshold controls, and — connected to the fake Device — a live reading rendered in its threshold-warn colour.
