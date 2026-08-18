# 05 — "Move to Window" menu action relocates a Pane between any two open Windows

**What to build:** a Pane's tab gets a "Move to Window ▸ [target]" command listing every currently-open Window, and picking one relocates the Pane there with its filter and selection intact. This is the initial-implementation answer to cross-window Pane movement — menu-driven, not live drag, per the confirmed scope decision.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] A Pane's tab context menu offers "Move to Window" with a submenu listing every open Window, using the same numbering already used for singleton location labelling
- [ ] Picking a target relocates the Pane into that Window's dock, removing it from the source Window
- [ ] The Pane's filter and selection state survive the move
- [ ] Moving the last Pane out of a Daughter Window closes that Window, consistent with issue 02's close-on-empty behavior
- [ ] Works in both directions — Main → Daughter and Daughter → Main — and between two Daughter Windows
