# 02 — Focus Mode becomes a property of a Window

**What to build:** Focus Mode stops being an application state and becomes per-Window presentation state. It is entered only from a Dashboard, it affects only the Window whose Dashboard it was entered from, and the Main Window's chrome loses its "Focus Mode" button.

**Blocked by:** 01

**Status:** ready-for-agent

**Superseded, unclaimed.** The dockview-popout mechanism this ticket was scoped against (ADR 0004) was itself superseded by genuine Tauri `WebviewWindow`s (ADR 0005) before this ticket was picked up, so it was never implemented as written and its checklist below is left unchecked as a historical record. The intent shipped anyway, as a side effect rather than a deliverable of this ticket: `.scratch/daughter-windows-native/issues/04-cross-window-singleton-and-focus-mode.md`'s Comments record that per-Window Focus Mode isolation needed no new code once that directory's own issue 02 landed — each Window, Main or Daughter, already composes its own independent `FocusModeProvider`/`FocusModeView`, so entering Focus Mode from a Dashboard is, by construction, always scoped to the Window it renders in.

This is forced by daughter windows rather than chosen for its own sake, which is why it is gated on the spike rather than shipping ahead of it. `enterFocusMode` currently unmounts `<Workspace>` outright (`AppShell.tsx`), and `exitFocusMode` remounts it so it "restores from settings exactly as a fresh launch would" — see ticket 18 of the interface rebuild. With Daughter Windows in play that would destroy every one of them on entry and attempt to reopen them on exit through dockview's deliberately delayed restore, by which time the user-gesture window a popup blocker needs has expired. The Operator's real setup is a focus Dashboard on the main screen with Plots parked on a second monitor, so the two features have to compose rather than trade off.

Focus Mode must therefore hide its Window's dock rather than unmount it. `focusDashboardIdByProfile` stops meaning "the Profile's remembered focus Dashboard driving a global mode" and becomes per-Window state; what it should mean instead is part of this ticket.

`FocusModeView` is reusable as-is, but its Escape handling binds to the document and must bind to its own Window's document instead — the deferral logic it carries (to a focused text field, and to `event.defaultPrevented` for Radix's capture-phase handlers) is load-bearing and pinned by `FocusModeView.test.tsx`. Do not regress it.

- [ ] Focus Mode is entered only from a Dashboard, never from app chrome
- [ ] The chrome's "Focus Mode" button is removed, and `CLAUDE.md`'s description of `AppChrome` updated to match
- [ ] Entering Focus Mode affects only the Window it was entered from
- [ ] `<Workspace>` stays mounted while Focus Mode is active
- [ ] Escape and the Exit button both still leave, and both still defer to a focused text field and to `defaultPrevented`
- [ ] Connection and Control state remain visible in Focus Mode, as ticket 18 required
- [ ] Existing `FocusModeView.test.tsx` regression tests still pass
