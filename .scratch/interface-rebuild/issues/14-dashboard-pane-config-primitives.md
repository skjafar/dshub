# 14 — Dashboard Pane and shared Widget configuration

**What to build:** The Dashboard as a Pane, keeping its own internal Widget grid rather than dissolving into Panes. Two layout systems coexist on purpose, separated by scale: the Workspace arranges tools, the Dashboard composes instruments. A Dashboard belongs to a Profile, and a Profile may have several.

Alongside it, the configuration surface every Widget shares. Today each of the sixteen Widget kinds re-implements address binding, value formatting and threshold evaluation, and that duplication is the sprawl this rebuild exists to escape. Built once here, it means learning one Widget teaches an Operator the others.

This ticket delivers the Dashboard, the grid, and the shared configuration — with a single simple Widget kind as proof that the whole path works end to end. The other fifteen follow in the three batches after it.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] A Dashboard Pane hosts a Widget grid where Widgets can be placed and resized
- [ ] A Profile can hold several Dashboards, switchable within the Pane
- [ ] Address binding, value formatting and threshold evaluation are configured through one shared surface
- [ ] Configuring a Widget uses the same vocabulary and layout regardless of Widget kind
- [ ] A Widget whose Device data goes stale says so plainly rather than showing a frozen value as live
- [ ] One Widget kind is delivered end to end as proof of the path
- [ ] Behaviour tests exercise binding, formatting, thresholds and the stale state through the shared surface
