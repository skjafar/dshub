# 05 — Workspace shell and Overview Pane

**What to build:** The new application shell. A Workspace of dockable Panes replaces the sidebar and the view router entirely. Panes can be dragged to a new edge, resized by their shared border, closed, and reopened from one visible affordance so closing is never a decision worth hesitating over.

The chrome carries what the whole application needs regardless of which Pane is focused: Device identity, connection state, which interface holds Control, and the theme. Connecting stops being a destination and becomes a flow launched from the chrome, because nobody returns to it once connected.

The first Pane is the Overview: the Device's own health — identity, uptime, link state, recent activity — unauthored, with nothing to compose.

**This is the slice that decides whether the dock engine was the right call.** Judge it explicitly before moving on. If it was wrong, this is the cheap place to find out.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [x] The application opens into a Workspace; the sidebar and view router are gone
- [x] Panes can be dragged, docked to any edge, resized and closed
- [x] A closed Pane can be reopened from one visible affordance
- [x] Connection state and which interface holds Control are visible at all times
- [x] Connecting and claiming Control are reachable from the chrome
- [x] A dropped link is signalled clearly enough that a stale value is never read as current
- [x] The Overview Pane reports Device identity, uptime, link state and recent activity
- [x] A crash inside one Pane does not blank the application
- [x] Verified both in a browser against the fake adapter and in the desktop application against the emulator

## The dock engine verdict

**dockview was the right call. Keep it.** Recorded in ADR-0001 under "Validated
by the shell slice"; the short version:

Panes dock to all four edges as independent regions, a shared border resizes them
by pointer drag (800/800 → 580/1020 on a real drag), and tabs, close and the
everything-closed watermark all come free. Theming took no JavaScript — twenty-odd
`--dv-*` custom properties map onto the design tokens in one stylesheet, which is
exactly the integration the ADR chose it for. The imperative api gave the shell
what it needed without keeping a second copy of dockview's state.

One correction to ticket 01. `dockview` v7 is the **vanilla** engine and contains
no React at all — zero React references, no React peer dependency. The React
bindings are a separate package, `dockview-react`, which this ticket adds. Ticket
01 installed the engine but not the binding a React application needs.

## Comments

**Verified in both environments.** In a browser against the fake: the sidebar and
router are gone, the app opens into a Workspace, connect and Take Control work
from the chrome, closing the last Pane shows the watermark, the Panes menu
reopens it, and dropping the link puts the chrome into `RECONNECTING` with the
Overview stating in words that the readings are no longer current. In the desktop
application against the Python emulator: discovery over the real Tauri transport,
TCP connect, and `Take Control acknowledged (control_state=1)`.

**Three defects the review caught, all fixed here.**

- *The Overview could show another board's identity.* It fell back to the first
  discovered Device when the connected address matched none — so connecting by
  address to a board a scan never reached put someone else's name, MAC and
  firmware under a banner reading Online. That is the precise failure this
  surface exists to prevent. There is no fallback now; where there is no
  discovery record it reports the link and says what it does not know.
- *The chrome stopped reporting the link state once a Device name was known.* The
  name replaced the label, leaving a dropped link signalled by LED colour alone.
  Both are shown now.
- *Panel ids were the bare Pane kind.* Dockview rejects a duplicate id by
  throwing, and Panes are opened from the chrome — outside every Pane's error
  boundary — so the first multi-instance Pane in ticket 06 would have taken the
  whole application down. Ids are assigned centrally now, singletons keeping
  their bare kind so saved layouts still name them.

**Known, not fixed, and out of this ticket's scope.** Every device event is
logged twice in development. `DSHubContext` registers its event listeners in an
async `setup()` whose cleanup runs before the registrations complete, so React's
StrictMode double-mount leaves two live handler sets. A production build logs each
event exactly once — confirmed by comparing `vite preview` against the dev server
— so this is a development artefact only. The fix is in frozen code and is not the
mechanical port substitution ADR-0003's amendment permits.

**Scope note.** The spec's Delivery section defines the judged slice as "shell,
theme bridge, primitives, Overview Pane **and Register Pane**". This commit is
mid-slice: the old surfaces are unreachable until their own tickets port them,
and ticket 22 deletes them.
