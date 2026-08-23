# 07 — Dragging a Pane's tab past a Window's edge creates a new Daughter Window

**What to build:** in addition to issue 02's menu-driven "Move to new window," dragging a Pane's tab outside every currently-open Window's bounds and releasing it creates a new Daughter Window there, sized and positioned at the drop point — restoring the original spec's headline gesture.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] Dragging a Pane's tab and releasing it outside every open Window's bounds creates a new Daughter Window centered on the release point
- [x] Releasing inside an already-open Window's bounds is unaffected — dockview's own in-window drop handles a same-window drop, and issue 05's menu action remains the way to move a Pane into a *different* already-open Window
- [x] The 5th-window warning from issue 02 still applies to windows created this way
- [x] The dragged Pane's state (filter, selection) survives into the new window

## Comments

**Resolved**, sharing `shell/useMoveToNewDaughterWindow.ts` with issue 02's
"Move to new window" rather than a second hook: both open a genuinely new
Daughter Window and only remove the source panel once that succeeds, so
they now share one pending-confirmation dialog and one 5th-window warning
instead of two copies of the same shape. `requestDragOut`/`attachDragOutListener`
are the two new entry points; `attachDragOutListener(api)` is called once
from each shell's own `handleReady`, mirroring how `onDidLayoutChange` and
the rest of that handler's dockview listeners are already registered there.

**Geometry.** `daughterWindows.ts`'s `dragOutTarget` needed no changes at
all — issue 02 already left it in place, unused, exactly for this. What
needed building was gathering *every* open Window's own screen bounds
across the realm split: `daughterWindowNative.ts`'s new `readWindowBounds`
resolves each by label (`knownWindowIds`, the same list `paneLocations.ts`
already uses) and reads `outerPosition`/`outerSize` — the whole frame, not
just content, since a drop point can land on a title bar — converted to
logical pixels the same way `readOwnWindowBounds` already does for the one
window a realm *can* read directly. dockview's own `onWillDragPanel` fires
at drag start, not drag end, so the native `dragend`'s own `screenX`/`screenY`
mark the actual release point, attached by hand to the dragged tab's own
`ownerDocument` (the drag may start in a Daughter Window, not this one) —
the same technique ADR 0004's own popout-era drag-out used, just now
compared against bounds gathered by IPC instead of read live off a shared
`window` object.

**State.** Unlike "Move to new window," which still opens empty by design
(ADR 0005), the dragged Pane's own `paneState.ts` state travels with it —
losing a filter mid-drag would read as a bug the user is watching happen.
Neither issue 04's broadcast nor issue 05's handoff fit: both assume their
target Window is already open and already listening, which a window this
same call is still in the middle of creating is not. The state instead
rides the new window's own URL — a new Rust command,
`open_daughter_window_at`, taking explicit bounds and an optional
JSON-stringified, percent-encoded `pane_state` string appended to the query
(`?pane=<kind>&paneState=<encoded>`), mirroring how `?pane=<kind>` and
`?restore=<index>` already carry their own payloads the same way — and read
back out by `DaughterWindowShell.tsx`'s new `initialPaneState`, seeded
before the Pane's own `usePaneState` ever mounts.

**Verification.** Typecheck, lint (0 errors, same 31-warning baseline) and
the full Vitest suite (64 files, 799 tests) all clean; `cargo check`/`cargo
test --lib` (21 tests) clean. New coverage: `useMoveToNewDaughterWindow.test.ts`'s
`attachDragOutListener` suite (opens outside every Window and carries
state; does nothing when the drop lands inside one; ignores a non-`DragEvent`
drag start; the 5th-window warning applying to a drag-out the same as the
menu command); `daughterWindowNative.test.ts`'s `openDaughterWindowAt`/
`readWindowBounds`; `DaughterWindowShell.test.tsx`'s `?paneState=` seeding
(valid and unparseable). jsdom implements no `DragEvent` at all — `setupTests.ts`
gained a thin `MouseEvent`-subclass stand-in, matching that file's existing
pattern of inert polyfills for DOM APIs jsdom is missing. Writing the
`?paneState=` tests also surfaced a latent, unrelated gap in
`DaughterWindowShell.test.tsx`'s own isolation — `paneState.ts`'s
module-level store was never reset between tests in that file, which
nothing had depended on until now — fixed with a `loadPaneStates({})` reset
in the file's own top-level `afterEach`.

**Not hand-verified against a packaged binary, and not verifiable from this
environment** (no packaged Windows binary, no second monitor, no way to
drive a real native drag session): whether a real WebView2 `dragend`'s own
`screenX`/`screenY` are actually logical (CSS) pixels — the unit
`readWindowBounds`'s physical-to-logical conversion produces — holds
across a multi-monitor setup where two displays carry different DPI scale
factors. Carried forward from ADR 0004's own same assumption about the
single-realm `window.screenX`/`outerWidth` its own drag-out compared
against directly, rather than re-derived; the same category of gap issues
01, 02 and 05 already carry their own documented, unconfirmed sections for.
Recommend a by-hand pass on a packaged build — drag a tab out on a single
monitor, then, if available, across two monitors at different scale
factors — before treating this as fully confirmed.
