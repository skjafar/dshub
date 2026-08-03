# A Workspace of docked Panes replaces the sidebar and view router

DSHub presented twelve full-screen views behind a fixed sidebar, so an Engineer debugging a fault could never see a plot and the register driving it at the same time, and an Operator saw twelve entries when three mattered. We replaced that with a Workspace: a dockview-driven arrangement of Panes that can sit side by side, several of the same kind at once, each with its own filter and selection. A Profile owns several named Workspaces so rearranging panes to chase a bug does not destroy the arrangement used for monitoring.

## Considered Options

A tiered flat sidebar and a task-verb grouping were both rejected: they reorganise the twelve views without letting two of them be visible together, which was the actual complaint. Explicit Operator/Engineer modes were rejected because the two personas differ by task, not by which surfaces they are allowed to see; one navigation with progressive disclosure serves both without a mode switch to get lost in.

For the engine, `flexlayout-react` was the lighter option and `allotment` plus `@dnd-kit` the fully-owned one. dockview won on completeness — tab groups, drag-to-dock overlays, floating groups and a documented serialization API — and because it themes through CSS variables, which plugs into the custom-property bridge `App.tsx` already publishes rather than fighting it.

## Validated by the shell slice

The dock engine was the one genuinely unproven element of the rebuild, and the
shell slice existed so that discovering it was the wrong choice would be cheap.
It was the right choice, and the decision stands.

What was actually exercised: Panes dock to all four edges as independent
regions, a shared border resizes them by pointer drag, tabs and close work, and
a watermark slot covers the everything-closed case. Theming needed no JavaScript
at all — twenty-odd `--dv-*` custom properties map onto the design tokens in one
stylesheet, which is the integration this ADR predicted and the reason the engine
was picked over the lighter options. The imperative api (`addPanel`, `getPanel`,
`panels`, `onDidLayoutChange`) gave the shell everything it needed to own which
Panes are open without keeping a second copy of dockview's state.

Two things a future reader should know. The React bindings are a **separate
package**: `dockview` v7 is the vanilla engine with no React in it at all, and
`dockview-react` is what a React application needs — the original dependency
install added only the former. And dockview rejects a duplicate panel id by
throwing, which matters because panels are opened from the chrome, outside any
Pane's error boundary; ids are assigned centrally in `shell/paneRegistry.ts` for
that reason.

## Confirmed once the slice was complete

The shell slice landed without the Register Pane, so the multi-instance half of
this decision — the actual reason the engine was chosen over a plain splitter —
was still unexercised. The Register Pane completes it, and the verdict stands.

What that added: several Panes of one kind open at once with independent state,
each renaming its own tab, dragged between groups and re-docked. All of it worked
through the imperative api without a second copy of dockview's state.

One thing changed how Panes are written. **dockview unmounts a Pane's component
whenever it is not the visible tab in its group, and again when it is dragged to
another group.** Component state is therefore not per-instance state: a filter
held in `useState` is lost by clicking a neighbouring tab. Per-instance state
lives in `shell/paneState.ts`, keyed by panel id, and the shell prunes it when
dockview stops reporting the panel — necessary because panel ids reuse the lowest
free instance number, so a reopened Pane would otherwise inherit its
predecessor's filter. This is also the shape ticket 08 needs, since a stored
Workspace is dockview's serialized layout *plus* each Pane's own state.

## Consequences

Layout persistence is dockview's serialization format, so a Workspace stored in user settings is shaped by a third-party library. Migrating off dockview later would invalidate every saved Workspace, which is the real lock-in — not the API surface.

The Dashboard is deliberately *not* dissolved into panes. It keeps its own internal widget grid and remains a discrete artifact belonging to a Profile, reachable full-canvas and locked as Focus Mode. Two layout systems coexist on purpose, separated by scale: the Workspace arranges tools, the Dashboard composes instruments.

Panes are multi-instance, so several may poll overlapping addresses. `pollRegistry` coalesces by address and issues one request per distinct address at the fastest requested interval, so this is safe — but it is a heavier load pattern than the single-view app ever produced, and it is the first thing to measure if the link feels slow.
