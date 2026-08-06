# 18 — Focus Mode

**What to build:** A single Dashboard shown full-canvas with its layout locked and the chrome minimised — the state left running on a screen beside equipment. This is what gives an Operator a genuinely calm surface without reintroducing persona modes.

Entering and leaving are both deliberate, single actions. Locked means locked: a stray drag during a shift must not rearrange the panel. Leaving must be possible but never accidental.

Status semantics carry more weight here than anywhere else in the application, because this is the surface read from across a room by someone who will act on what it says.

**Blocked by:** 14

**Status:** done

- [x] A Dashboard can be shown full-canvas with chrome minimised
- [x] Layout is locked in Focus Mode; Widgets cannot be moved, resized or reconfigured
- [x] Entering and leaving are each a single deliberate action, and leaving is not accidental
- [x] Connection and Control state remain visible despite minimised chrome, so a dropped link is never missed
- [x] Which Dashboard is shown is remembered across sessions
- [x] The mode is fully operable by keyboard, including leaving it

## Comments

Implemented as a full-canvas view (`shell/FocusModeView.tsx`) that replaces the chrome and Workspace entirely rather than overlaying them — `AppShell.tsx` unmounts `<Workspace>` for as long as Focus Mode is active (flushing the autosave first), so there is never a hidden dockview instance polling the Device behind Focus Mode's own Widget tree, and leaving remounts the Workspace exactly as a fresh launch would restore it.

The Dashboard grid itself is shared with `DashboardPane` via a new `DashboardGrid` component (extracted, no behaviour change) so Focus Mode's locked rendering can never drift from the editable one — Focus Mode simply never offers a way to flip `editing` to `true`. `LinkStatus`/`ControlBadge` were similarly extracted out of `AppChrome` so the minimised strip reads Control and link state through the exact same components as the full chrome.

Two entry points: a "Focus Mode" action on `DashboardPane` itself (picks *which* Dashboard), and a chrome-level "Focus Mode" button that reopens the Profile's remembered Dashboard directly (`focusDashboardIdByProfile` in settings), satisfying "remembered across sessions" even with no Dashboard Pane open. Both go through a `FocusModeContext` so `AppShell` — the only thing that may unmount the Workspace — owns entering, without widening `PaneProps` for every other Pane kind.

Leaving is Escape or an explicit "Exit Focus Mode" button, both single deliberate actions. Escape defers twice before it will exit: to a focused text field (`ValueWriteWidget`/`WriteBar`'s own Escape-abandons-the-draft handling doesn't call `preventDefault`), and to `event.defaultPrevented` generally (Radix's `Select`, under a Dropdown Widget, closes its own open picklist on Escape through a capture-phase handler that runs — and calls `preventDefault` — before this window-level one ever sees the key). Both are pinned by regression tests in `FocusModeView.test.tsx`. The Exit button itself carries its "(Esc)" hint as plain text rather than a `Tooltip`, for the same reason: a `Tooltip` opens on the focus the button gets on mount and dismisses itself on Escape through that identical capture-phase mechanism, which would otherwise cost an Operator's first Escape to closing a tooltip instead of leaving.
