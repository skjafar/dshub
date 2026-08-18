# Daughter Windows (native)

**Status:** ready-for-agent

**Supersedes** `.scratch/daughter-windows/spec.md` at the mechanism level — most of that spec's user-facing intent carries over unchanged and is not repeated here; this document only restates or overrides what actually changes. **Gated on issue 01** (this directory's own spike, proving explicit `WebviewWindow` creation and IPC capability scoping on a packaged binary) and on `.scratch/rust-owned-polling/` shipping in full first — see that spec and ADR 0003's amendment for why. See ADR 0004 (the mechanism this replaces) and its successor ADR 0005 (to be written alongside issue 02).

## Problem Statement

Daughter Windows shipped using dockview's popout mechanism: every OS window shares one JavaScript realm, which was necessary because a second realm would mean a second `pollRegistry` independently polling the same device addresses. Satisfying dockview's own same-origin check for that mechanism forced the Main Window off Tauri's own protocol onto a real `http://localhost:<port>` server, which has already shipped two production bugs this session — a missing IPC capability permission silently broke every backend-pushed event (`c44120f`), and a freshly-picked port every launch silently reset every Setting, Profile and Workspace (`83d6577`). Both are patched, but the localhost server itself is the root cause, not a mechanism worth keeping.

## Solution

With `rust-owned-polling` shipped, no realm independently decides polling cadence — a second realm is no longer disqualifying. Daughter Windows become genuine, independent Tauri `WebviewWindow`s, each running its own React tree and its own dockview instance, and the localhost server is deleted entirely: every window goes back to loading over Tauri's own protocol, on every platform, exactly as the app worked before Daughter Windows existed.

## What changes from the original spec

**Cross-window Pane movement, for the initial implementation, is menu-driven rather than live drag.** The original spec's stories 3 and 5 ("drag a Pane from the Main Window into a Daughter Window that is already open," "drag a Pane from one Daughter Window to another") assumed dockview's same-realm drag, which has no equivalent once windows are separate OS processes — HTML5 drag events do not cross webview process boundaries. For this implementation, moving a Pane into or between already-open Windows is a **"Move to Window ▸ [target]"** menu action (issue 05), generalizing the existing "Move to new window" tab command. Story 2 (the menu command) and story 4 (dragging a Pane *out* of a Window to create a new one, still single-realm and low-risk — issue 07) are unaffected and still ship as live gestures. Live cross-window drag onto an already-open window is real, deferred future work — recorded in the approved plan's "Future work" section, not part of this spec.

**Story 41/42's "no extra Device traffic from having several Windows open" is now explained differently.** It no longer holds because every window shares one realm's poll registry — it holds because Rust owns polling entirely and pushes values to every window via `Emitter::emit`'s broadcast, so no window, of any count, issues its own read.

**Persistence changes shape but not intent.** `StoredWorkspace.dockLayout`'s single composite `SerializedDockview` blob (free from dockview's own `popoutGroups` field) becomes an explicit `mainDockLayout` plus a `daughterWindows: StoredDaughterWindow[]` list, each with its own `dockLayout` and explicitly-tracked `bounds` — necessary because there are now N independent dockview instances, not one. Any Workspace saved under the old shape resets on upgrade rather than being migrated (confirmed decision; matches ADR 0003's own precedent for exactly this kind of reset). Stories 15–21 (saved-with-the-Workspace, restored at position/size, never silently lost) still hold under the new shape.

**The blocked-restore failure mode (stories 19–21, `RestoreGuard`) is gone, not replaced.** It existed only because `window.open` needs a user gesture at launch. `WebviewWindowBuilder`, called explicitly from Rust, has no such requirement — restoring N Daughter Windows at launch is just N window-creation calls. A `WebviewWindowBuilder::build()` failure (OS resource limits) is a different, much rarer failure mode, surfaced back through the command's `Result` rather than through a rebuilt guard/banner/retry flow.

**Everything else in the original spec — the persona split, the read-only link/Control chrome, singleton location labelling, per-Window Focus Mode, theme/portal behavior, the window-count warning, "no Connect/Control/Profile/Settings controls in a Daughter Window" — is unchanged in intent** and is implemented against the new mechanism rather than redesigned.

## Implementation Decisions

**One thing enables the rest.** `open_daughter_window` (issue 02) — an explicit Rust command building via `WebviewWindowBuilder`, not the reactive `on_new_window` handler dockview's `window.open` needed — is the seam everything else in this spec sits on top of. It's also where the localhost server actually gets deleted: the Main Window no longer needs a dynamically-constructed URL once nothing requires a same-origin `http:`/`https:` popout target, so it reverts to a static `tauri.conf.json` declaration, exactly as it worked before Daughter Windows existed.

**No shared JS realm means no free cross-window object access.** Anything that used to reach directly into a live shared `DockviewApi` — which window a Pane is in (`focusMode.ts`'s `windowIdForPane`), a singleton's dedup check, a moved Pane's own state — now needs an explicit broadcast (`@tauri-apps/api/event`'s `emit`/`listen`, called directly from the frontend, no new Rust command) that every window aggregates into its own local view. This is eventually-consistent rather than always-live, an accepted consequence of the realm split, and it is the one mechanism issues 04 and 05 both build on.

**Settings/Profiles/Workspaces are automatically shared again**, with zero new plumbing, the moment the localhost server is gone — every window is back on one fixed origin, and `localStorage` is scoped to it. Only *live* same-session propagation (a Settings change in one open window reaching another already-open window) needs anything new, and it's the platform's own `storage` event (issue 06), not a Rust-relayed channel.

## Testing Decisions

Same standard as the original spec: assert what a user or caller can observe, not how it was achieved.

**Cannot be unit tested, must not be faked into looking tested.** Whether `open_daughter_window` produces a working, IPC-capable, event-receiving window; whether a second and third Daughter Window's capability grant actually holds (not just the first); whether "Move to Window" and the drag-out gesture behave correctly against a real second OS window — all of this needs a packaged binary, by hand, per platform, exactly as the original spike established for the mechanism this replaces. Windows first; Linux via WSL where reachable; macOS left as a documented, unconfirmed gap in the same way ADR 0004's own amendment already is, if no hardware is available.

**Everything data-shaped stays unit-testable without a real dockview instance**, per ADR-0001's existing boundary — `daughterWindows.ts`'s pure functions, the new `StoredDaughterWindow`/`StoredWorkspace` shape and its sanitize/migrate functions, over a fake dock api built by hand exactly as `workspaceStore.test.ts` already does.

## Out of Scope

Live cross-window drag onto an already-open Daughter Window — deferred, see the approved plan's "Future work" section for the sketch (OS-native drag session, Rust-held payload keyed by a drag token) and its own future spike.

Nothing about `rust-owned-polling`'s own scope changes here — this spec assumes it is already fully shipped and its contract ticket (removing `pollRegistry.ts`) already landed.

## Further Notes

ADR 0004 recorded the mechanism this supersedes; a new ADR 0005 lands alongside issue 02, leaving ADR 0004 intact as history with a superseded-by note rather than rewriting it. `CLAUDE.md`'s "Daughter Windows" and "Device Communication" sections need a substantial rewrite once this ships — they currently document `popout.html`, `addPopoutGroup`, the dynamic localhost capability and `pollRegistry.ts` in detail, none of which will exist. `CONTEXT.md`'s Window/Main Window/Daughter Window glossary terms, withheld pending the original issue 03, graduate now, with "Daughter Window" redefined as a real OS window/process.
