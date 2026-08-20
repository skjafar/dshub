# Daughter Windows are genuine WebviewWindows, not dockview popouts

Supersedes ADR 0004. That decision built Daughter Windows on dockview's
`addPopoutGroup`: a same-origin `window.open()` whose DOM dockview adopts
into a scriptless document, so the whole app — one React tree, one dockview
instance, one `DSHubProvider` — stays in the Main Window's JS realm
regardless of which physical window a Pane's DOM renders in. That mechanism
required serving the Main Window itself over a real `http://localhost:<port>`
server rather than Tauri's own protocol, because dockview's popout code only
accepts a same-origin `http(s)` document, and Tauri's own protocol fails that
assertion on macOS and Linux. The localhost server caused two production
bugs the same session it shipped: a missing IPC permission silently broke
every backend-pushed event (`c44120f`), and a freshly-picked port every
launch silently reset every Setting, Profile and Workspace (`83d6577`).

ADR 0004 chose the popout mechanism specifically to avoid a second
`WebviewWindow`: a second JS realm would mean a second copy of
`pollRegistry.ts` independently polling the same device addresses, the exact
duplication ADR 0003 froze the data path to prevent. `.scratch/rust-owned-
polling` removed that disqualifier. Polling cadence is no longer decided in
the browser at all — Rust's `poll.rs` owns every subscription and pushes
values to every window via `Emitter::emit`'s broadcast, so no window, of any
count, issues its own read. A second realm is no longer disqualifying.

## Decision

Daughter Windows are genuine, independent Tauri `WebviewWindow`s, each
running its own React tree and its own dockview instance. The localhost
server is deleted outright; the Main Window reverts to `tauri.conf.json`'s
declarative `app.windows` array, loading over Tauri's own protocol on every
platform, exactly as the app worked before Daughter Windows existed.

`.scratch/daughter-windows-native/issues/01-webviewwindow-capability-spike.md`
(a spike, not assumed) established the two facts this decision depends on,
against a packaged (`cargo build --features custom-protocol`) binary rather
than `cargo tauri dev`, whose `devUrl` gets implicit IPC trust a production
origin never does:

- A static glob capability pattern (`"daughter-*"` in
  `capabilities/default.json`'s `windows` array) grants `invoke` and
  broadcast `listen` access to a window whose exact runtime-minted label was
  never declared anywhere — confirmed for a second *and* third window, not
  only the first. `dynamic-acl`'s runtime `add_capability` — the mechanism
  the deleted localhost origin needed, because a `remote` origin's URL is
  only known at runtime — is not needed for these windows at all: they load
  over the *local* protocol, which a plain static capability already covers.
- A `#[tauri::command]` that builds a window must be `async fn`. Tauri's
  codegen runs a *sync* command's body inline, on whatever thread dispatched
  the IPC message — the spike traced this to the main/event-loop thread
  itself — and `WebviewWindowBuilder::build()` needs that same thread's
  message loop to cycle again to finish constructing the window, so a sync
  command deadlocks itself. `async fn` routes the command onto the async
  runtime's own thread pool instead, leaving the real main thread free to
  service the cross-thread call `build()` makes back into it.
  `src-tauri/src/daughter_windows.rs`'s `open_daughter_window` carries this
  as a load-bearing comment, not a style note.

## Consequences

**No free cross-window object access.** Anything that used to reach directly
into a live shared `DockviewApi` no longer can. `windowIdForPane`
(`focusMode.ts`) still resolves correctly, but only in the narrow sense that
it now always falls back to the Main Window's own id for any panel not in
that window's own (now permanently empty) `getPopouts()` list — a Daughter
Window's singleton-elsewhere labelling and cross-window Focus Mode isolation
are deferred to `.scratch/daughter-windows-native` issue 04's own broadcast
(`paneId → windowId`, aggregated locally by every window), not rebuilt here.
Each window computing its own "add a Pane" menu from only its own local
`api` is a deliberate, graceful no-op in the interim, not a bug.

**A Pane's own state does not survive being moved to a new window.**
`paneState.ts`'s store is a module-level in-memory `Map` — correct and
sufficient when there was one realm, but it cannot cross into a genuinely
separate one without new serialization machinery. "Move to new window" (the
existing tab-context-menu command, now creating a real window instead of a
same-realm popout) opens a fresh Pane of the same kind; the moved Pane's
filter and selection reset. Preserving them is `.scratch/daughter-windows-
native` issue 05's own stated job for *its* move mechanism (relocating into
an *already-open* window), not this one's.

**Settings, Profiles and Workspaces are automatically shared again, with no
new plumbing**, the moment the localhost server is gone: every window is
back on one fixed origin, and `localStorage` is scoped to it. Live
same-session propagation (a Settings change in one open window reaching
another already-open window) is deferred to issue 06, riding the platform's
own same-origin `storage` event rather than a Rust-relayed channel.

**A Daughter Window's own arrangement is not persisted** at the point this
decision shipped (issue 02) — every Pane it holds started fresh each time
the window was created, seeded only from the one Pane kind
`open_daughter_window` was asked to open (carried as a query string on the
window's own URL — `?pane=<kind>` — confirmed at the Tauri/`url` crate level
that the query is stripped before asset resolution, so this still serves the
same `index.html` the Main Window loads). **Issue 03 closed this gap**:
`StoredWorkspace` grew a `daughterWindows: StoredDaughterWindow[]` list
alongside the Main Window's own `mainDockLayout` (renamed from the old
single composite `dockLayout`, which could not describe N independent
dockview instances) — each entry its own `dockLayout`, its own Panes' own
state, and its saved position/size. A new `restore_daughter_window` command
opens one per saved entry at launch, no user gesture needed
(`WebviewWindowBuilder` has none of `window.open`'s requirement); each
restored window reads its own content back out of the shared Settings blob
by array position (`?restore=<index>`, since labels remint from scratch
every launch) rather than carrying it in the URL, then keeps it current
through its own debounced autosave, matched by its own live label from then
on.

**A saved Workspace from before this decision degrades safely rather than
erroring.** `workspaceStore.ts`'s `isValidDockLayout` rejects a `dockLayout`
carrying real `popoutGroups` entries — the pre-native format's signature —
which would otherwise route into dockview's own internal `fromJSON`-triggered
`window.open` attempt failing unconditionally (the `on_new_window` handler
that ever made it succeed is exactly what this decision removes). Since
issue 03, `isValidStoredWorkspace` also rejects a Workspace lacking
`mainDockLayout`/`daughterWindows` entirely — the pre-issue-03 shape's own
signature — so both the original popout-era format and the single-`dockLayout`
interim shape fall through the same drop-and-fall-back path any other
corrupted Workspace already takes. The "Reopen windows" banner this
originally routed around no longer exists at all (`RestoreGuard` and its
banner were removed outright in issue 03): it existed only because
`window.open` needed a user gesture at launch, which `WebviewWindowBuilder`
never did.

**Two new, narrow amendments to ADR 0003's frozen `DSHubContext.tsx`,**
on the same grounds as its existing four: a real defect, found and fixed in
place, introduced only because this decision is the first time more than one
`DSHubProvider` instance exists in a session. See that ADR's own amendment
list for both.

## Testing

Same standard ADR 0004 and its own spike set: whether `open_daughter_window`
produces a working, IPC-capable, event-receiving window; whether a second
and third Daughter Window's capability grant actually holds; whether closing
one (natively, from the Main Window's list, or by losing its last Pane) and
the 5th-window warning behave correctly — none of this is faked into looking
unit-tested. It needs a packaged binary, by hand, confirmed against this
platform; Linux and macOS are left the same documented, unconfirmed gap ADR
0004's own amendment already carries, for the same reason (no hardware
reachable from this machine).

Everything data-shaped stays unit-testable without a real dockview instance,
per ADR-0001's existing boundary: `daughter_windows.rs`'s registry
bookkeeping (label minting, insert-on-open, remove-on-`Destroyed`) as a
plain Rust unit test mirroring `poll.rs`'s own precedent; `daughterWindows.ts`'s
pure functions, unchanged; `daughterWindowNative.ts`'s simplified,
label-based window operations, mocking `@tauri-apps/api/window` the same way
its existing test already did.

Issue 03's own additions to this boundary: `workspaceStore.ts`'s
`upsertDaughterWindow`/`withoutDaughterWindow`/`updateWorkspaceDaughterWindows`/
`restoreDaughterWindowContent`, pinned against the same hand-built
`WorkspaceDockApi` fake `workspaceStore.test.ts` already uses — no real
dockview instance needed there either. The one exception:
`DaughterWindowShell.test.tsx` already renders the real `<Workspace>`
component directly (unlike the pure-function tests above), so it is where
the actual restore-at-launch and autosave round trip is exercised
end-to-end — create content in one mounted window, let its own debounced
autosave reach `localStorage`, then confirm a second, freshly-mounted window
opened with `?restore=<index>` reproduces it.
