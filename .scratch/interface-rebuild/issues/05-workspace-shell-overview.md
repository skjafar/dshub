# 05 — Workspace shell and Overview Pane

**What to build:** The new application shell. A Workspace of dockable Panes replaces the sidebar and the view router entirely. Panes can be dragged to a new edge, resized by their shared border, closed, and reopened from one visible affordance so closing is never a decision worth hesitating over.

The chrome carries what the whole application needs regardless of which Pane is focused: Device identity, connection state, which interface holds Control, and the theme. Connecting stops being a destination and becomes a flow launched from the chrome, because nobody returns to it once connected.

The first Pane is the Overview: the Device's own health — identity, uptime, link state, recent activity — unauthored, with nothing to compose.

**This is the slice that decides whether the dock engine was the right call.** Judge it explicitly before moving on. If it was wrong, this is the cheap place to find out.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] The application opens into a Workspace; the sidebar and view router are gone
- [ ] Panes can be dragged, docked to any edge, resized and closed
- [ ] A closed Pane can be reopened from one visible affordance
- [ ] Connection state and which interface holds Control are visible at all times
- [ ] Connecting and claiming Control are reachable from the chrome
- [ ] A dropped link is signalled clearly enough that a stale value is never read as current
- [ ] The Overview Pane reports Device identity, uptime, link state and recent activity
- [ ] A crash inside one Pane does not blank the application
- [ ] Verified both in a browser against the fake adapter and in the desktop application against the emulator
