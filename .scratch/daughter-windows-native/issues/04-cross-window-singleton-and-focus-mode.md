# 04 — Singleton location and per-Window Focus Mode resolve correctly across windows

**What to build:** the two menus — the Main Window's and every Daughter Window's — correctly show a singleton Pane already open elsewhere as disabled and labelled with its location, and Focus Mode entered in one Window affects only that Window.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] Opening a singleton Pane that's already open in a different Window shows it disabled and labelled with that Window's name, in both the Main Window's menu and every Daughter Window's menu
- [x] Picking a singleton already open in the *same* Window focuses it rather than doing nothing
- [x] Entering Focus Mode from a Dashboard in a Daughter Window affects only that Window — the Main Window and any other Daughter Window are untouched
- [x] Entering Focus Mode on the Main Window leaves parked Daughter Windows untouched
- [x] This all still holds after a Pane has moved between Windows (issue 05) — location tracking isn't stale after a move

## Comments

No shared JS realm means no live cross-window object query. This needs a broadcast (`paneId → windowId`, kept up to date by every window announcing its own panel set on layout change) that each window aggregates locally — eventually consistent rather than always-live, an accepted consequence of the realm split. Issue 05 reuses this same broadcast for its own handoff.

**Resolved.** New `shell/paneLocations.ts`: `usePaneLocations(ownWindowId,
ownPaneIds, stillOpen)` broadcasts this Window's own open panel ids via
`@tauri-apps/api/event`'s `emit` (`capabilities/default.json`'s existing
`core:default` grant already covers `emit`/`listen` — confirmed against
`gen/schemas/desktop-schema.json`, no capability change needed) whenever
they change, listens for every other Window's own broadcast, and returns
one aggregated `ReadonlyMap<WindowId, readonly string[]>`. This Window's own
entry always comes straight from `ownPaneIds` — known synchronously from
this Window's own dockview state — never from its own broadcast round-
tripping back to it, so a Window's dedup check against itself never lags a
tick behind its own layout. `stillOpen` (`daughterWindows.ts`'s new
`knownWindowIds`, fed by `daughterWindowNative.ts`'s existing
`useDaughterWindows`) is applied where the aggregate is *read*, in the same
`useMemo` that merges this Window's own entry in — not by writing a pruned
copy back into state from a second effect — so a Window that has since
closed cannot leave its last announcement lingering forever, and the effect
that would otherwise call `setState` synchronously from a purely-derived
value never exists in the first place (`react-hooks/set-state-in-effect`'s
own backlog, which this addition keeps at zero net new rather than growing).

**Found by hand after the first pass, not by the checklist itself: a
late-joiner gap.** A pure push broadcast has no persistent registry
anywhere, so a freshly-mounted Window's own `listen` has nothing to catch
it up on a Window that already announced its panes *before* the new one
existed — reproduced by hand: open a singleton in the Main Window, then
open a Daughter Window, and its own menu did not show that singleton as
disabled until *something else* in the Main Window changed and re-announced
it. `usePaneLocations` now also registers a second listener, for
`PANE_LOCATIONS_REQUEST_EVENT`, and — only once both listeners are
confirmed registered — emits one request of its own; every Window
(including itself, harmlessly, since the "changed" listener's own
self-check still filters that out) answers by re-announcing its current
panes. This closes the gap without a Rust-held registry, staying inside
spec.md's "no new Rust command" decision. Covered by two new tests:
one asserting the request itself goes out once listening is confirmed, and
one running two real `usePaneLocations` instances against a shared in-
memory event-bus stand-in (`paneLocations.test.ts`'s own `installEventBus`)
to exercise the actual catch-up handshake end to end — a late-mounted
"Window B" instance ends up correctly reporting an already-open Window's
panes with no interaction anywhere else. That second test's first draft
crashed the test worker with an out-of-memory infinite loop: passing plain
array literals inline as `ownPaneIds`/`stillOpen` to two *simultaneously
live* hook instances meant each instance's own broadcast-triggered
re-render recreated a "new" (but content-identical) array reference every
time, which `usePaneLocations`'s own `[ownWindowId, ownPaneIds]` change
detection cannot tell apart from an actual change — each instance kept
re-announcing in response to the other's re-announcement, forever. Fixed by
hoisting those arrays to stable `const`s outside the render callback in
that one test; real callers never hit this, since `AppShell.tsx`/
`DaughterWindowShell.tsx` only ever produce a fresh `openPaneIds` array from
dockview's own `onDidLayoutChange` — an external event untouched by this
hook's own state changes, so nothing in production ever feeds back into
itself the way two unstable inline literals did here.

`daughterWindows.ts`'s `paneMenuEntries` dropped its old `api: WindowLocatable`
and `openKinds` parameters for a single `paneLocations` map — a singleton's
panel id is its bare kind (`paneRegistry.ts`), so `pane.kind` doubles as the
key to look up. `windowIdForPane`/`WindowLocatable` (`focusMode.ts`) and
their `fakeWindowLocatable.ts` test fake are deleted outright, not left
inert: they resolved a panel's Window by asking a single realm's own
`getPopouts()`, which has had nothing to report since issue 02 and no longer
compiles against anything meaningful.

`AppShell.tsx` and `DaughterWindowShell.tsx` each now track `openPaneIds`
(replacing the `openKinds`/`kindOfPaneId` machinery `paneMenuEntries` no
longer needs) and call `usePaneLocations` with their own identity —
`MAIN_WINDOW_ID` for the former, `getCurrentWindow().label` for the latter,
already the same value `windowRole.ts`'s `MAIN_TAURI_WINDOW_LABEL` uses, so
a Window's own Tauri label is always directly usable as its `WindowId`.
Both `paneMenuEntries` call sites lost their old `apiRef.current ? … : []`
guard along with it: the function no longer touches the dock api at all, so
it's safe to call unconditionally, and doing so incidentally fixed four
pre-existing `react-hooks/refs` ("Cannot access refs during render")
warnings that the old `apiRef.current` read directly in the render body had
been tripping.

Per-Window Focus Mode isolation (the third and fourth checklist items)
needed no new code: each Window has composed its own, independent
`FocusModeProvider`/`FocusModeView` since issue 02, so a Dashboard Pane
entering Focus Mode is, by construction, always acting on the Window it
already renders in. Confirmed by reading `AppShell.tsx`'s and
`DaughterWindowShell.tsx`'s own `enterFocusMode`/`exitFocusMode` — each a
plain local `useState`, nothing shared — and fixed one stale doc comment in
`FocusModeContext.tsx` that still described the deleted
`windowIdForPane`-based cross-window resolution this never actually needed
once issue 02 shipped.

The fifth checklist item ("still holds after a Pane has moved between
Windows") is a structural property of the broadcast rather than something
end-to-end testable yet: issue 05 (the actual move mechanism) doesn't exist.
Every Window re-announces its full panel set on every `onDidLayoutChange`,
so whichever Window a moved Pane lands in next simply reports it on its own
next broadcast — no per-move bookkeeping for issue 05 to inherit or work
around.

**Verification.** Typecheck, lint (0 new errors or warnings — net *fewer*
warnings than baseline, per the `react-hooks/refs` fix above and one stale
test fixture removed with the old `windowIdForPane` tests) and the full
Vitest suite (62 files, 760 tests, up from 61/753 at issue 03 —
`paneLocations.test.ts` pins `usePaneLocations` directly via `renderHook`, mocking
`@tauri-apps/api/event` the same way `daughterWindowNative.test.ts` already
does for `listen` alone: this Window's own entry staying current outside
Tauri, broadcasting on mount and on change, the catch-up request firing
once listening is confirmed, merging another Window's broadcast, ignoring a
broadcast carrying this Window's own id, pruning a Window once it drops out
of `stillOpen`, unsubscribing both listeners on unmount, and the two-
instance catch-up handshake itself) all clean. `daughterWindows.test.ts`'s
`paneMenuEntries` suite rewritten
against a hand-built `ReadonlyMap` fixture instead of the deleted
`fakeWindowLocatable`, plus new coverage for `knownWindowIds`. **Not
hand-verified against a packaged binary** — confirming the broadcast
actually reaches a second and third real `WebviewWindow` (not just the
mocked unit tests above) wants the same by-hand pass issue 02's own native-
window mechanics got, no interactive desktop session being available in
this environment. `docs/adr/0005-daughter-windows-are-genuine-webviewwindows.md`
amended in place (its own established pattern for this directory, matching
issue 03) rather than superseded; `CLAUDE.md`'s Daughter Windows section
updated to describe the shipped mechanism instead of the interim no-op.
