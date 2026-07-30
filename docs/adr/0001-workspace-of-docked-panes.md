# A Workspace of docked Panes replaces the sidebar and view router

DSHub presented twelve full-screen views behind a fixed sidebar, so an Engineer debugging a fault could never see a plot and the register driving it at the same time, and an Operator saw twelve entries when three mattered. We replaced that with a Workspace: a dockview-driven arrangement of Panes that can sit side by side, several of the same kind at once, each with its own filter and selection. A Profile owns several named Workspaces so rearranging panes to chase a bug does not destroy the arrangement used for monitoring.

## Considered Options

A tiered flat sidebar and a task-verb grouping were both rejected: they reorganise the twelve views without letting two of them be visible together, which was the actual complaint. Explicit Operator/Engineer modes were rejected because the two personas differ by task, not by which surfaces they are allowed to see; one navigation with progressive disclosure serves both without a mode switch to get lost in.

For the engine, `flexlayout-react` was the lighter option and `allotment` plus `@dnd-kit` the fully-owned one. dockview won on completeness — tab groups, drag-to-dock overlays, floating groups and a documented serialization API — and because it themes through CSS variables, which plugs into the custom-property bridge `App.tsx` already publishes rather than fighting it.

## Consequences

Layout persistence is dockview's serialization format, so a Workspace stored in user settings is shaped by a third-party library. Migrating off dockview later would invalidate every saved Workspace, which is the real lock-in — not the API surface.

The Dashboard is deliberately *not* dissolved into panes. It keeps its own internal widget grid and remains a discrete artifact belonging to a Profile, reachable full-canvas and locked as Focus Mode. Two layout systems coexist on purpose, separated by scale: the Workspace arranges tools, the Dashboard composes instruments.

Panes are multi-instance, so several may poll overlapping addresses. `pollRegistry` coalesces by address and issues one request per distinct address at the fastest requested interval, so this is safe — but it is a heavier load pattern than the single-view app ever produced, and it is the first thing to measure if the link feels slow.
