# 06 — Profile-wide binding scanner

**What to build:** A pure function that enumerates every read binding, address-kind write target, and Plot series belonging to a Profile — across every Dashboard and every Workspace's saved Pane state — independent of what is currently open in any Window. This is what makes the eventual review (ticket 07) exhaustive rather than limited to whatever happens to be on screen when a Map is edited.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Given a Profile's persisted settings, returns every read binding and every address-kind write target from every Widget in every Dashboard belonging to that Profile.
- [ ] Also returns every Plot series from every Plot Pane's saved state in every Workspace belonging to that Profile, including Panes not currently open in any Window.
- [ ] Each returned item identifies which Dashboard (and Widget) or which Workspace/Pane (and series) it belongs to, sufficient to group and label it in a later review.
- [ ] Bindings/targets/series belonging to a different Profile are never included.
- [ ] Command-code write targets are never included (no snapshot, not subject to drift).
- [ ] Unit tests over a hand-built settings blob containing: a Dashboard with multiple Widget kinds including a control Widget's address-bound target; a Workspace with both an open and a not-currently-open Plot Pane's saved state; and a second Profile's data, asserted absent from the results.
