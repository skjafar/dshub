# 07 — Dragging a Pane's tab past a Window's edge creates a new Daughter Window

**What to build:** in addition to issue 02's menu-driven "Move to new window," dragging a Pane's tab outside every currently-open Window's bounds and releasing it creates a new Daughter Window there, sized and positioned at the drop point — restoring the original spec's headline gesture.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Dragging a Pane's tab and releasing it outside every open Window's bounds creates a new Daughter Window centered on the release point
- [ ] Releasing inside an already-open Window's bounds is unaffected — dockview's own in-window drop handles a same-window drop, and issue 05's menu action remains the way to move a Pane into a *different* already-open Window
- [ ] The 5th-window warning from issue 02 still applies to windows created this way
- [ ] The dragged Pane's state (filter, selection) survives into the new window
