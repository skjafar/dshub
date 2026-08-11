# 03 — Daughter Windows

**What to build:** the feature itself — Panes pop out into Daughter Windows that belong to the Workspace, arrange Panes freely, and exchange Panes with the Main Window by drag.

**Blocked by:** 01, 02

**Status:** ready-for-agent

Read `spec.md` for the behaviour and `docs/adr/0004-panes-pop-out-through-dockview-popout-windows.md` for why the mechanism is dockview's popout rather than a Tauri `WebviewWindow`. The short version of the why: a popout shares the Main Window's JavaScript realm, so there is exactly one `pollRegistry`, one `DSHubProvider` and one `paneState` store across every Window, and the frozen data path (ADR 0003) is untouched. A second Tauri webview would be a second realm, a second registry, and duplicate polls on a strictly request/response link.

Most of the persistence is already there and should not be rebuilt. `SerializedDockview` carries `popoutGroups` with each window's nested grid and screen position, `StoredWorkspace.dockLayout` is already that type, and `api.toJSON()` already fills it.

Three things need care.

**Drag-out is the only novel code.** dockview has no drag-outside-the-window gesture — `onWillDragPanel` and `onDidDrop` exist but nothing detects a drag ending outside the bounds. Build it from `dragend` screen coordinates tested against the window, then `addPopoutGroup({ position })`. `dragDropEnabled: false` in `tauri.conf.json` is already the setting this needs; Tauri's native drag-drop would otherwise swallow the HTML5 drag.

**Destroy-on-close is an override.** dockview's `disposePopoutWindow` relocates member groups back to the main grid. The spec wants them destroyed, via `removeGroup`'s `skipPopoutReturn`. Keep this consistent with the blocked-restore path, which does the opposite deliberately.

**The blocked-restore trap is the one that loses user data.** A blocked popout redocks into the main grid, autosave fires on the layout change, and 400ms later the stored Workspace no longer contains the arrangement. Suppress autosave when a restore was blocked and offer an explicit "Reopen windows" retry — it succeeds because the click supplies the gesture the automatic attempt lacked.

This logic belongs in `workspaceStore.ts` as a pure decision over an extended `WorkspaceDockApi`, not as effect wiring in `AppShell.tsx`. That interface — today `toJSON`, `fromJSON`, `panels` — grows to cover learning that a popout failed and enumerating open Daughter Windows, which keeps the whole feature behind the one seam `workspaceStore.test.ts` already tests against with a hand-built fake. The highest-stakes path in this ticket should not be reachable only through a component test with a mocked dockview.

Theme and portals reuse existing seams rather than new ones. `ThemeScope` and its `PortalContainerContext` already exist so overlays cannot escape a themed subtree, and `applyThemeVariables` already takes its root element as a parameter — together they are what stops a Radix menu opened in a Daughter Window from portalling to the Main Window's `document.body` on another monitor.

- [ ] A Pane drags out of the Main Window to create a Daughter Window, and a "Move to new window" tab command does the same
- [ ] Panes drag between Main and Daughter Windows in both directions, and between Daughter Windows
- [ ] A Daughter Window arranges Panes in a grid, not just a tab strip
- [ ] Its top bar shows link and Control state read-only plus an add-Pane control, and nothing else
- [ ] Daughter Windows save and restore with the Workspace, at position and size; switching Workspace closes and reopens them
- [ ] Creating a fifth Daughter Window warns and allows; a Workspace holding more still loads all of them
- [ ] A Daughter Window losing its last Pane closes; closing one explicitly destroys its Panes
- [ ] A blocked restore does not overwrite the stored Workspace, and offers a retry that works
- [ ] Singleton Panes open elsewhere appear disabled and labelled with their Window, in both menus
- [ ] The Main Window's Panes menu lists open Daughter Windows with focus and close
- [ ] Radix menus, selects, tooltips and dialogs opened inside a Daughter Window render in that window
- [ ] Theme switching applies to every open Window
- [ ] `popout.html` is a Vite build input and is bundled by Tauri
- [ ] `CLAUDE.md`'s Workspace and Panes section describes Windows, and `CONTEXT.md` gains Window / Main Window / Daughter Window
