# 13 — Cursor sync across Plot Panes

**What to build:** One crosshair, readable across every open Plot. Moving the cursor in one Plot Pane shows the same instant in all the others, so an Engineer correlating several signals during a single motion event reads them at one moment in time rather than eyeballing across separate charts.

This is the capability that makes several Plot Panes in a Workspace feel like one instrument rather than three separate charts, and it was a stated reason for choosing the plotting engine — treat it as a requirement, not an enhancement.

Plots showing different time spans must still align meaningfully, or must say plainly that they cannot.

**Blocked by:** 12

**Status:** ready-for-agent

- [ ] Moving the cursor in one Plot Pane positions it at the same instant in every other open Plot
- [ ] Each Plot reports its own series values at the shared cursor position
- [ ] Plots with different time spans either align correctly or indicate that they do not overlap
- [ ] Sync survives opening and closing Plot Panes during a session
- [ ] Paused and running Plots behave predictably together under a shared cursor
