# 03 — A Daughter Window persists across an app restart

**What to build:** a Daughter Window's arrangement — which Panes, in what layout, at what position and size — is saved as part of its owning Workspace and restored on the next launch, with no user gesture required for that to succeed.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] Closing and relaunching the app restores every Daughter Window that belonged to the active Workspace, at its saved position and size
- [x] Switching Workspace closes the outgoing Workspace's Daughter Windows and opens the incoming one's
- [x] A Workspace with no Daughter Windows opens with none
- [x] A Workspace saved under the old (pre-native) dockview-popout format resets cleanly on first load under the new format, rather than erroring or partially restoring
- [x] No blocked-restore / "reopen windows" recovery flow exists anymore — restoring a saved Daughter Window is not gated on a user gesture, since `WebviewWindowBuilder` doesn't need one
- [x] A window that genuinely fails to open at restore (an OS-level resource failure) surfaces an error to the user rather than silently vanishing

## Comments

**Resolved.** `docs/adr/0005-daughter-windows-are-genuine-webviewwindows.md`
amended in place (not superseded — this fills in what it already scoped as
this issue's own job, not a new decision).

**Data shape.** `StoredWorkspace.dockLayout` split into `mainDockLayout`
(the Main Window's own layout, unchanged in kind) plus
`daughterWindows: StoredDaughterWindow[]`, each entry `{ label, dockLayout,
paneStates, bounds }`. `isValidStoredWorkspace` requires both fields, so a
Workspace saved under the pre-issue-03 shape (a bare `dockLayout`, no
`daughterWindows` at all) fails validation outright and resets through the
existing drop-and-fall-back path — no separate migration code needed, the
shape check *is* the migration story, matching the confirmed "reset rather
than migrate" decision.

**Restore-time correlation.** `restore_daughter_window` (new Rust command,
sharing its window-creation body with `open_daughter_window` via a private
`open_and_register` helper) opens one `WebviewWindow` per saved entry, in
array order, each with `.position()`/`.inner_size()` set from the entry's
saved `bounds` (logical pixels — `daughterWindowNative.ts`'s
`readOwnWindowBounds` converts a live window's own physical
`outerPosition`/`innerSize` down to that unit before ever saving them). A
relaunch remints every label from `daughter-1` regardless of a previous
session's history, so a restored window cannot correlate to its saved entry
by label — its own URL instead carries `?restore=<index>`, and
`DaughterWindowShell` reads its saved `dockLayout`/`paneStates` back out of
the shared Settings blob itself (already back on one shared origin since
issue 02) rather than the payload riding in the URL. From that first restore
onward, the window's own debounced autosave (mirroring `AppShell.tsx`'s own)
keeps its entry current, matched by its own live label
(`upsertDaughterWindow`, which accepts a one-time `restoreIndex` for exactly
this label-bootstrap case and falls back to label matching — or appending —
every other time, including a freshly *created* window's very first save).

**Pruning on close.** Closing a Daughter Window from the Main Window's own
list, or a window losing its last Pane and closing itself, both prune that
window's own entry before the close call goes out (`withoutDaughterWindow`)
— both are unambiguous, deliberate closes with the closing window's own JS
still alive at that instant. A native title-bar close does not prune: there
is no reliable way to tell "this one window closed, app still running" apart
from "the whole app is quitting" from inside a single webview's own
`beforeunload`, and getting it wrong either overwrites a legitimate restore
(pruning during quit) or never fires (title-bar close while running) —
narrow-scoped out rather than guessed at; documented as a known gap in
`CLAUDE.md` rather than left silent.

**RestoreGuard removed outright**, not left inert: `WorkspaceDockApi.onDidOpenPopoutWindowFail`,
`RestoreGuard`/`createRestoreGuard`, the `restoreBlocked` banner and its CSS
are all gone from `workspaceStore.ts`/`AppShell.tsx`/`AppShell.module.css` —
it existed only for `window.open`'s user-gesture requirement, which
`WebviewWindowBuilder` never had.

**"Save Workspace As" does not carry currently-open Daughter Windows into
the new Workspace identity** — each keeps saving itself under whatever is
active at its own next autosave tick, which becomes the new Workspace the
moment it's made active. A narrow, deliberate scope cut (not tested by this
ticket's own checklist): full continuity here would need the Main Window to
read another window's live dockview state cross-process, which nothing
today provides a bridge for.

**A Daughter Window's own bounds are tracked live, not read only at flush
time.** The first implementation read `outerPosition`/`innerSize` fresh
(async, IPC-backed) inside `flushAutosave` itself — an independent review
pass caught two real problems with that: moving or resizing the window
alone never touches dockview's own layout, so nothing would have triggered
an autosave for a bare move/resize at all; and an async `flushAutosave`
fired from `beforeunload` has no guarantee of finishing before the page
actually unloads, racing `SettingsContext`'s own synchronous quit-time flush
for whichever runs first. `DaughterWindowShell.tsx` now subscribes to
`getCurrentWindow().onMoved`/`onResized`, keeping a `boundsRef` current and
scheduling autosave on each; `flushAutosave` reads that ref synchronously
instead of awaiting a fresh read, so the `beforeunload` flush is now a
genuinely synchronous write, matching `AppShell.tsx`'s own guarantee.

**`openWorkspaceDaughterWindows`/`closeAllDaughterWindows`/
`switchDaughterWindows` extracted to `useDaughterWindowLifecycle.ts`**, a
new hook, out of `AppShell.tsx` where they first lived — also review-driven:
this orchestration is exactly the "data-shaped, unit-testable without a
real dockview instance" category spec.md's own Testing Decisions calls for
(`upsertDaughterWindow`/`withoutDaughterWindow` already got this treatment
in `workspaceStore.test.ts`; this was the one piece of new issue-03 logic
that hadn't), but living inline in `AppShell.tsx` gave it nothing to mock
against. The extracted hook also now guards `openWorkspaceDaughterWindows`
behind `isTauri()` — the same review caught that `restoreDaughterWindow`'s
unguarded `invoke` (matching `openDaughterWindow`'s own existing, documented
exception to `daughterWindowNative.ts`'s "safe no-op outside Tauri" module
contract) would otherwise fire on every Main Window mount, including a
browser-dev session, whenever a stored Workspace happened to carry a
non-empty `daughterWindows` list.

**Verification.** Typecheck, lint (0 new errors or warnings across every
touched file) and the full Vitest suite (61 files, 753 tests, up from 731 at
issue 02) all clean; `cargo check`/`cargo test --lib` (21 tests) clean;
`npm run build` succeeds. The restore-at-launch and autosave round trip,
including a bare resize alone (no Pane change) actually reaching storage, is
exercised end-to-end in `DaughterWindowShell.test.tsx` against the real
`<Workspace>`/dockview component (not a fake); `useDaughterWindowLifecycle.test.ts`
covers the switch/close/restore orchestration itself, mocking
`daughterWindowNative.ts` the same way `useMoveToNewDaughterWindow.test.ts`
already does. A Playwright smoke pass against `npm run dev` confirmed the
Main Window still boots into its default arrangement with no console
errors. Reviewed via `/code-review` (Standards + Spec axes); every finding
either fixed (the two above, plus a small `restoreWorkspace`/
`restoreDaughterWindowContent` duplication factored into a shared
`restoreDockContent`, and a `CLAUDE.md` citation corrected) or explicitly
scoped out with reasoning (`updateWorkspaceContent`/
`updateWorkspaceDaughterWindows`'s milder structural overlap; the
"Save Workspace As" cut above). **Not hand-verified against a packaged
binary** the way issue 02's own native-window mechanics were (no interactive
desktop session available in this environment) — restoring N real OS
windows at real saved positions on a real multi-monitor setup, and the
close-vs-quit pruning distinction under a genuine process-wide quit, both
still want that pass before this is fully confirmed on this platform.
