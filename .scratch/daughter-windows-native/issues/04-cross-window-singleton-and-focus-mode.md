# 04 — Singleton location and per-Window Focus Mode resolve correctly across windows

**What to build:** the two menus — the Main Window's and every Daughter Window's — correctly show a singleton Pane already open elsewhere as disabled and labelled with its location, and Focus Mode entered in one Window affects only that Window.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Opening a singleton Pane that's already open in a different Window shows it disabled and labelled with that Window's name, in both the Main Window's menu and every Daughter Window's menu
- [ ] Picking a singleton already open in the *same* Window focuses it rather than doing nothing
- [ ] Entering Focus Mode from a Dashboard in a Daughter Window affects only that Window — the Main Window and any other Daughter Window are untouched
- [ ] Entering Focus Mode on the Main Window leaves parked Daughter Windows untouched
- [ ] This all still holds after a Pane has moved between Windows (issue 05) — location tracking isn't stale after a move

## Comments

No shared JS realm means no live cross-window object query. This needs a broadcast (`paneId → windowId`, kept up to date by every window announcing its own panel set on layout change) that each window aggregates locally — eventually consistent rather than always-live, an accepted consequence of the realm split. Issue 05 reuses this same broadcast for its own handoff.
