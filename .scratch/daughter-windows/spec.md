# Daughter Windows

**Status:** ready-for-agent

**Gated on issue 01.** The mechanism depends on `window.open` working inside Tauri's webview on all three platforms the build matrix targets. If it cannot be made to work on all three, this feature is dropped rather than shipped on one. Nothing here is implemented until that spike returns a verdict. See ADR 0004.

## Problem Statement

A Workspace is one arrangement in one window, and the window is the ceiling. An Operator with two monitors cannot park a Plot and the Overview on the second screen and leave them there for a shift — everything they want to watch has to share a rectangle with everything they are not currently watching. An Engineer debugging a board cannot pull the Activity Log out to full height on a spare screen while keeping Registers and the Inspector in front of them; they can only make it a bigger tile in the same grid, which costs them the thing they were comparing it against.

Both personas already own the screen space. DSHub simply cannot use it. The result is that Panes get opened, squinted at, and closed again, when they should have been left visible.

## Solution

A Workspace can span more than one operating-system window. A Pane is dragged out of the Main Window — or sent out by a command on its tab — into a **Daughter Window**, where it can be joined by others and arranged into a grid exactly as it would be in the Main Window. Panes drag freely in both directions and between Daughter Windows.

A Daughter Window is deliberately not a second copy of the application. It shows the Device's link and Control state so a dropped link on a second monitor is never missed, and it offers one control: add a Pane. Connection, Control, Workspaces, Profiles, theme and Settings all stay in the Main Window, so there is exactly one place any of them can be changed from.

The windows belong to the Workspace. They are saved with it at their position and size, restored with it, and closed when a different Workspace is loaded — so "my shift setup" is one named thing that survives a restart, rather than an arrangement the user rebuilds each morning.

## User Stories

1. As an Operator, I want to drag a Pane out of the Main Window onto my second monitor, so that I can use screen space DSHub currently ignores.
2. As an Engineer, I want a "Move to new window" command on a Pane's tab, so that I can pop a Pane out without having to land a precise drag.
3. As an Operator, I want to drag a Pane from the Main Window into a Daughter Window that is already open, so that I can group everything I watch onto one screen.
4. As an Engineer, I want to drag a Pane from a Daughter Window back into the Main Window, so that re-docking costs me no more than popping out did.
5. As an Engineer, I want to drag a Pane from one Daughter Window to another, so that I can reorganise across three monitors without going through the Main Window.
6. As an Engineer, I want to split and resize Panes inside a Daughter Window, so that it is as capable an arrangement surface as the Main Window rather than a tab strip.
7. As an Engineer, I want a Pane to keep its filter and its selection when it moves between Windows, so that relocating it does not cost me the state I set up.
8. As an Operator, I want to add a Pane from the Daughter Window's own top bar, so that I do not have to go back to the Main Window and drag the result across.
9. As an Engineer, I want a Pane I add from a Daughter Window to open in that Daughter Window, so that the control does what its location implies.
10. As an Engineer, I want a singleton Pane that is already open elsewhere to appear disabled and labelled with the Window it lives in, so that I learn where it is instead of clicking an item that appears to do nothing.
11. As an Engineer, I want the Main Window's menu to use that same labelling, so that the two menus tell me the same thing in the same words.
12. As an Operator, I want the Device's link state visible in every Daughter Window, so that a dropped connection on a second monitor is never missed.
13. As an Operator, I want Control state visible in every Daughter Window, so that I know whether we hold Control before I act on what I am reading.
14. As an Operator, I want the Daughter Window's Device info to be read-only, so that I cannot fumble a disconnect while reaching for something on a screen I am not looking directly at.
15. As an Operator, I want my Daughter Windows saved as part of my Workspace, so that a shift setup survives closing the application.
16. As an Operator, I want them restored at the position and size I left them, so that they come back on the monitor I put them on.
17. As an Engineer, I want switching Workspace to close the outgoing Workspace's Daughter Windows and open the incoming one's, so that a Workspace means the whole arrangement and not just part of it.
18. As an Engineer, I want a Workspace with no Daughter Windows to open with none, so that switching to a single-screen layout actually clears my screens.
19. As an Operator, I want never to silently lose my arrangement because a window failed to open, so that I can trust the Workspace to hold what I put in it.
20. As an Operator, I want to be told when windows could not be reopened and offered a retry that works, so that a failed restore is a moment's inconvenience rather than a rebuild.
21. As an Operator, I want the Panes from a window that failed to open to still be visible and usable in the Main Window, so that nothing is unreachable while I deal with it.
22. As an Engineer, I want a Daughter Window that loses its last Pane to close itself, so that I am not left with empty windows to tidy up.
23. As an Engineer, I want closing a Daughter Window to close the Panes inside it, so that the window behaves the way every other window I use behaves.
24. As an Engineer, I want to reopen Panes I closed that way from the Main Window's menu, so that closing a window is recoverable.
25. As an Operator, I want the Main Window to list my open Daughter Windows, so that one buried behind other applications is still reachable.
26. As an Operator, I want to focus a Daughter Window from that list, so that I can bring it forward without hunting the taskbar.
27. As an Operator, I want to close a Daughter Window from that list, so that one restored onto a monitor I have since unplugged is not stranded.
28. As an Engineer, I want to be warned before creating a fifth Daughter Window, so that I understand the cost before I pay it.
29. As an Engineer, I want to be able to proceed past that warning, so that a soft limit does not become a hard one when my bench genuinely needs it.
30. As an Engineer, I want a saved Workspace holding more than four Daughter Windows to load all of them, so that the warning governs creation and never silently discards my work.
31. As an Operator, I want to enter Focus Mode from a Dashboard and have it affect only that Dashboard's Window, so that focusing one screen does not blank another.
32. As an Operator, I want Focus Mode in a Daughter Window to leave the Main Window untouched, so that I can run a locked panel on one screen while still working on the other.
33. As an Engineer, I want Focus Mode on the Main Window to leave my parked Daughter Windows alone, so that the two features compose instead of trading off.
34. As an Operator, I want to leave Focus Mode by Escape or an explicit button in whichever Window I am in, so that leaving is deliberate but never a puzzle.
35. As an Operator, I want connection and Control state to stay visible in Focus Mode, so that the calmest surface is still the honest one.
36. As an Operator, I want a Daughter Window in Focus Mode to hide its add-Pane control, so that a locked panel really is locked.
37. As an Engineer, I want a theme change to apply to every open Window at once, so that my screens do not disagree with each other.
38. As an Engineer, I want a menu or dropdown opened inside a Daughter Window to appear in that Window, so that clicking a control does not make its menu appear on a different monitor.
39. As an Engineer, I want tooltips and dialogs raised from a Daughter Window to behave the same way, so that the rule has no exceptions I have to learn.
40. As an Operator, I want status colours to mean the same thing in every Window, so that my read of machine state does not depend on which screen I am looking at.
41. As an Engineer, I want no extra Device traffic from having several Windows open, so that spreading out costs me nothing in latency.
42. As an Engineer, I want a Plot in a Daughter Window and a Pane in the Main Window watching the same address to share one read, so that the link is not polled twice for one value.
43. As an Engineer, I want an Inspector living in a Daughter Window to follow selections I make in the Main Window, so that the split does not break the thing the Inspector is for.
44. As an Engineer, I want the feature to behave identically on Windows, macOS and Linux, or not to be offered at all, so that a saved Workspace never means something different on a colleague's machine.

## Implementation Decisions

**Mechanism.** dockview's popout windows, not a Tauri `WebviewWindow`. The reasoning is recorded in ADR 0004 and is not reopened here: a popout shares the Main Window's JavaScript realm, so there is exactly one poll registry, one application context and one pane-state store across every Window, and ADR 0003's frozen data path is untouched. A second Tauri webview would be a second realm with a second registry issuing duplicate polls, and would have no mechanism for cross-window drag at all.

**One seam, and it already exists.** `WorkspaceDockApi` — the narrow interface the workspace store already uses to talk to dockview — grows to cover popout lifecycle: learning that a popout failed to open, and enumerating the open Daughter Windows. Every decision derived from that (what to restore, what to save, whether to suppress a save, what the Windows list contains) stays a pure function in the workspace store over that interface. The shell wires events to it and owns no logic of its own.

**No new persistence.** `SerializedDockview` already carries a `popoutGroups` field holding each window's nested grid and its screen position, and the stored Workspace's dock layout is already that type, filled by the dock api's own serialization. Daughter Windows persist without a schema change, a migration, or a new settings key.

**Ownership is the Workspace.** Not the Profile, not the session. Switching Workspace closes the outgoing Workspace's Daughter Windows and opens the incoming one's. This follows from the persistence above rather than being enforced separately.

**Two behaviours deliberately override dockview's defaults.** Closing a Daughter Window destroys its Panes, where dockview would relocate them into the main grid. And a Daughter Window losing its last Pane is disposed rather than left empty. Both are explicit overrides and must be kept consistent with the recovery path below, which deliberately does the opposite.

**Blocked restore is the data-loss path and gets the most care.** Restoring a Workspace at launch has no user gesture behind it, so the popout may be refused. dockview redocks the orphaned groups into the main grid; autosave then fires on that layout change and, within its debounce, overwrites the stored Workspace with an arrangement that no longer contains the Daughter Windows. Autosave is therefore suppressed when a restore was blocked, and the user is offered an explicit retry — which succeeds precisely because the click supplies the gesture the automatic attempt lacked. The Panes remain visible and usable in the Main Window throughout.

**Drag-out is the only novel code.** dockview has no drag-outside-the-window gesture. It is built from the drag-end screen coordinates tested against the window bounds, yielding either nothing or a position at which to open a popout. The geometry is a pure function taking a point and a bounds and returning a decision; the shell calls dockview with the result. Tauri's native drag-drop is already disabled in the app configuration, which is the setting this needs — it would otherwise swallow the HTML5 drag.

**The Daughter Window's chrome composes existing parts.** Link state and Control state come from the same two components the Main Window's chrome uses, so the two can never drift. The add-Pane control reads the same Pane registry the Main Window's menu reads. Nothing is duplicated.

**Singleton resolution becomes location-aware.** A pure function maps an open Pane to the Window that holds it; both menus render a singleton that is open elsewhere as disabled and labelled with that location. Picking it neither moves the Pane nor changes window focus.

**Theme and portals reuse machinery built for another reason.** The existing theme-scope component and its portal-container context were written so the primitives page could show two themes at once; they are exactly what keeps an overlay opened inside a Daughter Window from portalling to the Main Window's document. Theme variables are applied per popout document, which the existing helper already supports by taking its root element as a parameter.

**Focus Mode becomes per-Window presentation state.** Entered only from a Dashboard, affecting only that Dashboard's Window, with the Main Window's chrome losing its Focus Mode button. The Workspace stays mounted while Focus Mode is active rather than being unmounted and restored. This is issue 02 and lands before the feature itself.

**Build.** A second HTML entry point is added as a Vite build input and bundled by Tauri. If the spike's second phase requires it, the frontend is served over local HTTP from the Rust side on every platform so the popout origin is acceptable — that decision is deferred to the spike and is not assumed here.

## Testing Decisions

A good test here asserts what a user or a caller can observe, not how it was achieved. For the workspace store that means: given a stored Workspace and a dock api, what gets restored, what gets saved, and — the important one — what does *not* get saved after a blocked restore. It does not mean asserting which methods were called in which order. Tests that pin dockview's internals would fail on a dockview upgrade that changed nothing a user could see.

**Primary seam — the workspace store over `WorkspaceDockApi`.** Prior art is the existing workspace store test, which builds a fake dock api by hand and exercises snapshot, restore, sanitize and the named-Workspace operations without loading dockview at all. The new cases join it directly: a layout carrying Daughter Windows round-trips; a blocked restore leaves the stored Workspace untouched; a retry after a blocked restore reopens what was stored; switching Workspace produces the incoming Workspace's windows and not the outgoing one's. This is where the data-loss path is pinned, and it is the reason the recovery logic was pushed down to this seam rather than left as shell wiring.

**Pure functions, no seam.** Drag-out geometry, the window-count predicate behind the warning, and the singleton location labelling are data in, data out. Prior art is the existing focus-mode, entry-filter and link-state tests.

**Component level, in jsdom against the fake device port.** The Daughter Window's chrome — that it shows link and Control state and offers exactly one control — and per-window Focus Mode. Prior art is the existing Workspace, AppChrome and Focus Mode view tests. The Workspace test is also the precedent for pinning dockview's own third-party behaviour through our component rather than trusting its documentation, which is the right instinct to carry into popout.

**Regression.** The existing Focus Mode view tests must continue to pass unchanged. Their Escape-deferral cases — deferring to a focused text field and to an already-prevented event from a capture-phase handler — are load-bearing and were each written against a real defect.

**What cannot be unit tested, and must not be faked into looking tested.** Real popout behaviour needs a real `window.open`, which jsdom does not provide; dockview itself anticipates this and degrades in jsdom. Whether a popout actually opens under Tauri, renders adopted DOM, receives the opener's stylesheets, and accepts a dragged Pane is established by the spike and confirmed by hand against the packaged desktop app on each platform — with the Python Device emulator when protocol-level behaviour matters, since a plain browser session always gets the fake port regardless.

## Out of Scope

Daughter Windows are not individually nameable and inherit the application title. There is no way to create an empty one — they only ever come into being holding a Pane. They never gain Connect, Control, Workspace, Profile, theme or Settings controls; those stay singular in the Main Window by design, not by omission.

Tearing a Widget out of a Dashboard into its own window is not this feature. Nor is any monitor-awareness beyond restoring the coordinates that were saved: DSHub does not reason about which display a window belongs on, detect that one has been unplugged, or reposition anything to fit.

Nothing in the Device data path changes. The port, the poll registry, response correlation and every reducer are untouched, and the shared JavaScript realm is what makes that possible rather than a constraint worked around.

## Further Notes

The two ADRs this must respect are 0003, which freezes the device data path and is the reason the mechanism was chosen, and 0004, which records the mechanism decision and its gate.

The glossary terms — Window, Main Window, Daughter Window — are deliberately not yet in `CONTEXT.md`. That file describes what DSHub is, and none of this exists. They graduate when issue 03 completes.

One honest note on the odds. The spike's first phase is genuinely uncertain. Its second phase is already known to fail as things stand: dockview's origin assertion rejects Tauri's custom scheme unconditionally, so on macOS and Linux the local-HTTP-server change is not a contingency but a prerequisite. If that change is unacceptable, the answer to this feature is already no and can be given without running anything.
