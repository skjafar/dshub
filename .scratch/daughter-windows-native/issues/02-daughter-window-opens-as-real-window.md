# 02 — A Daughter Window opens as a real OS window, shows its Pane, and closes cleanly

**What to build:** using the existing "Move to new window" tab command, a Pane opens into a genuine, independent OS window — its own webview process, its own React tree — showing the same read-only link/Control chrome and add-Pane control the current mechanism already has. Closing it, natively or from the Main Window's Daughter Window list, or by losing its last Pane, behaves correctly. As part of the same change, the localhost HTTP server the previous mechanism required is deleted, and the Main Window reverts to loading over Tauri's own protocol.

**Blocked by:** `.scratch/rust-owned-polling/05`, `01` (this directory's own spike)

**Status:** ready-for-agent

- [x] "Move to new window" opens a Pane into a genuinely separate OS window, not a same-realm popout
- [x] The Daughter Window shows Device link state and Control state read-only, and offers exactly one control — add a Pane — nothing else
- [x] Live device values (register/parameter updates, connection status) reach the Daughter Window correctly
- [x] Closing the Daughter Window via its native OS close control destroys its Panes rather than relocating them to the Main Window
- [x] A Daughter Window that loses its last Pane closes itself, including when that happens via a Pane being moved elsewhere (not only via an explicit close of the window itself)
- [x] The Main Window's Daughter Window list can close and focus a Daughter Window correctly
- [x] Opening a 5th Daughter Window still warns first, unchanged from today
- [x] No localhost HTTP server starts on any build configuration; the Main Window loads over Tauri's own protocol
- [x] `capabilities/default.json` no longer contains a dynamically-added "remote" capability
- [x] Settings, Profiles and Workspaces persist correctly across an app restart — regression check, since port instability in the mechanism this replaces is exactly what broke this before (`83d6577`)

## Comments

This is the seam everything else in this directory sits on top of. It's also where both previously-patched production bugs (`c44120f`, `83d6577`) get their root cause removed rather than continuing to be worked around.

**Resolved.** Daughter Windows are now genuine `WebviewWindow`s — own React
tree, own dockview instance — replacing dockview's `addPopoutGroup`
same-realm popout entirely (ADR 0004, superseded by new
`docs/adr/0005-daughter-windows-are-genuine-webviewwindows.md`). The full
design was planned before implementation; a validation pass on the initial
design surfaced two real correctness risks neither named by this ticket's
own checklist but both squarely in its scope, since they are defects this
ticket's own architecture change introduces for the first time — see below.

**Rust.** `src-tauri/src/daughter_windows.rs` (new, production — distinct
from the now-deleted `daughter_window_spike.rs`): `open_daughter_window`
(`async fn` — load-bearing per issue 01's deadlock finding, not a style
choice), `list_daughter_windows`, and an `AppState`-held registry
(`std::sync::Mutex`, deliberately not `tokio::sync::Mutex` like its
siblings — `on_window_event`'s callback is synchronous). One
`WindowEvent::Destroyed` handler covers every closure path uniformly: native
OS close, the Main Window's own list, and a Daughter Window closing itself.
`lib.rs` lost `on_new_window`, the whole `#[cfg(not(dev))]` localhost branch
(`tauri-plugin-localhost`, `LOCALHOST_PORT`, `portpicker` — both crates
dropped from `Cargo.toml`), and the dynamic `add_capability("localhost")`
block; the Main Window reverted to `tauri.conf.json`'s declarative
`app.windows`, exactly as it worked before Daughter Windows existed.
`capabilities/default.json`'s `windows` list is now `["main", "daughter-*"]`
— the static glob issue 01's spike confirmed, no `dynamic-acl` needed since
these windows load over the *local* protocol.

**Frontend.** New `shell/DaughterWindowShell.tsx` (mounted instead of
`AppShell.tsx` per `shell/windowRole.ts`'s `isMainWindow()`) is a Daughter
Window's own top-level shell — its own `DSHubProvider`, its own dockview
instance via `Workspace.tsx` (reused unchanged), its own minimal
`FocusModeProvider`/`FocusModeView`. Seeded from one Pane kind carried as a
`?pane=<kind>` query string on the window's own URL. `AppShell.tsx` lost
`openPopouts`/`useDaughterWindowChrome`/`DaughterWindowRoot`/
`reallyOpenPopout`/`destroyMembersOnClose`/the `getPopouts()`-based
`closeEmptyPopouts`/the `onWillDragPanel` drag-out wiring (issue 07 rebuilds
drag-out against the new mechanism; the pure geometry helpers in
`daughterWindows.ts` are left in place, unused for now, since they're
mechanism-agnostic and issue 07 needs them almost unmodified). New
`useMoveToNewDaughterWindow.ts` (shared by both shells — "Move to new
window" works from a Daughter Window's own tabs too) and `daughterWindowNative.ts`
gained `openDaughterWindow`/`listDaughterWindows`/`subscribeDaughterWindows`/
`useDaughterWindows`; `closeDaughterWindow`/`focusDaughterWindow` simplified
to take a label directly — no more resolving a Tauri label from a foreign
`window.open()`-returned object, since Rust now hands the Main Window a live
label list directly.

**Two new ADR 0003 amendments**, found during planning rather than
discovered by a bug report: (1) `DSHubContext.tsx`'s disconnect-on-unmount
cleanup was effectively dead code while exactly one `DSHubProvider` instance
ever existed — a Daughter Window's own instance needed a new
`ownsDeviceLifecycle={false}` prop so closing it can never disconnect the
whole app from the device. (2) A newly-mounted provider had no way to learn
the device was *already* connected — new `commands::get_connection_status`,
called once on mount alongside subscribing to future `connectionStatus`
transitions. **Both were hand-verified against a packaged binary, not
assumed**: connected via the Main Window first, then opened a Daughter
Window and confirmed it showed "Online" immediately (not stale
"disconnected"); then closed that Daughter Window (a real native
`WM_CLOSE`, not just a same-process signal) and confirmed the Main Window's
own connection and register polling kept running undisturbed.

**Old-format saved-Workspace defense.** `workspaceStore.ts`'s
`isValidDockLayout` now rejects a `dockLayout` carrying real
`popoutGroups` entries (the pre-native format's signature), routing it
through the app's existing drop-and-fall-back path instead of letting
dockview's own internal `window.open` attempt fail unconditionally into a
permanently-stuck "Reopen windows" banner. A narrow slice of "resets
cleanly" — the new per-window persistence shape and removing `RestoreGuard`
outright are still issue 03's own job.

**Verification.** Typecheck, lint (0 errors, same-or-better warning count
than baseline), the full Vitest suite (731 tests, 60 files) and
`cargo test --lib` (21 tests, including new `daughter_windows.rs` registry
tests) all clean. Everything the checklist itself can't be unit-tested for
was hand-verified against a packaged (`cargo build --features
custom-protocol`) binary, driven live via Playwright connected over
WebView2's CDP debugging port (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`)
rather than guessed at: a genuinely separate OS window opens and is
independently confirmed via raw `EnumWindows`/window-rect Win32 calls (not
just Playwright's own page list, which — discovered mid-verification —
does *not* reliably reflect a real native close: `page.close()` via CDP
left an orphaned, blank native frame Win32 could still see, so every actual
close assertion below was re-verified with a real `WM_CLOSE` message to the
correct window handle, not `page.close()`); both windows' `invoke`/`listen`
work; the 5th-window warning fires and its confirm reopens correctly;
native close, list-close and losing-the-last-Pane self-close all correctly
destroy the window (re-checked with `EnumWindows` each time — no orphaned
frames) and leave other open windows and the device connection untouched;
no listener on the old localhost port (47990); Settings/Workspace survive a
full process kill and relaunch. Run against the local Python emulator
throughout, on an isolated Tauri identifier
(`io.dshub.desktop.verifyscratch`, deleted afterward) so this session's own
testing could never touch this machine's real saved DSHub data or its real
device connection — a real, already-connected device on the LAN was
discovered mid-session by the app's own auto-connect/auto-scan and
immediately disconnected from without further interaction, once recognized.
