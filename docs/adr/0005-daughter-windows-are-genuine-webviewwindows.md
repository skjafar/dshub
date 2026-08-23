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
into a live shared `DockviewApi` no longer can — `windowIdForPane`
(`focusMode.ts`), which resolved a panel to its Window by asking a single
realm's own `getPopouts()`, has no equivalent once Windows are separate
processes, and was deleted outright rather than left as a permanent no-op.
**Issue 04 closed this gap** with `paneLocations.ts`'s own broadcast: every
Window emits its own open panel ids (`@tauri-apps/api/event`'s `emit`,
already covered by `capabilities/default.json`'s existing `core:default`
grant — no new Rust command needed) whenever they change, and every Window,
including the one emitting, aggregates every Window's most recent
announcement into one local `paneId → WindowId` map via `usePaneLocations`.
This is eventually consistent, not always-live — the accepted cost of the
realm split — and it prunes a Window's entry once `useDaughterWindows`
reports it closed, so a stale announcement from a since-closed Window cannot
linger forever. A pure push broadcast alone left one gap, found by hand
rather than by the checklist: a freshly-mounted Window's own `listen` has
nothing to catch it up on a Window that already announced its panes
*before* the new one existed, so a singleton opened before a Daughter
Window existed never showed as disabled there until something unrelated
changed in the other Window and re-announced it. `usePaneLocations` also
registers a second, request/response listener for this: a Window asks,
once, right after both its listeners are confirmed registered, and every
Window (including itself, harmlessly) answers by re-announcing its current
panes — closing the gap without a Rust-held registry, staying inside
spec.md's "no new Rust command" decision. `daughterWindows.ts`'s
`paneMenuEntries` reads this map to tell a singleton open in this Window
(clickable — focuses it) from one open
in another (disabled, labelled with that Window's name), in both the Main
Window's own menu and every Daughter Window's. Per-Window Focus Mode
isolation needed no part of this broadcast: each Window already composes
its own, independent `FocusModeProvider`/`FocusModeView`
(`DaughterWindowShell.tsx`), so a Dashboard Pane entering Focus Mode is, by
construction, always acting on the Window it is already rendered in.

**A Pane's own state does not survive "Move to new window."**
`paneState.ts`'s store is a module-level in-memory `Map` — correct and
sufficient when there was one realm, but it cannot cross into a genuinely
separate one without new serialization machinery. "Move to new window" (the
existing tab-context-menu command, now creating a real window instead of a
same-realm popout) opens a fresh Pane of the same kind; the moved Pane's
filter and selection reset. This is deliberate, not a placeholder: a
genuinely new window has nothing to hand a serialized blob to yet, and
`open_daughter_window` already carries the one thing that matters for a
fresh window, the Pane's own kind, over its `?pane=<kind>` query string.

**Issue 05 closed the gap for "Move to Window,"** the sibling command that
relocates a Pane into a Window that is *already open* rather than a new
one. `paneHandoff.ts` reuses issue 04's own `@tauri-apps/api/event`
broadcast rather than building a second mechanism: the sending Window reads
`paneState.ts`'s `snapshotPaneStates` for the moved panel id, emits it
addressed to the target's `WindowId`, and only calls `removePanel` once
that emit is confirmed sent (mirroring "Move to new window"'s own
only-remove-after-success reasoning) — no request/response catch-up
handshake needed here, unlike issue 04's own, since a Window only ever
appears as a move target (`daughterWindows.ts`'s `moveTargets`) once it is
already running and already listening. The receiving Window seeds
`paneState.ts` via a new `restorePaneState` (an exact-one-id write, unlike
`loadPaneStates`' whole-store replace for a Workspace load) *before*
calling `addPanel`, so the Pane's own `usePaneState` reads it on its very
first mount. **A tab's own display title is never part of this payload** —
confirmed against a real dockview instance, not assumed: every Pane kind
that shows one (`AddressSpacePane.tsx`'s instance number and filter query,
`InspectorPane.tsx`'s described entry, and so on) recomputes its own title
from its own state in its own `useEffect` on every mount, so whatever title
`addPanel` was given is superseded immediately regardless — carrying one
across the wire was dead weight from an earlier draft, caught by
`DaughterWindowShell.test.tsx`'s own end-to-end assertion actually
disagreeing with what a real dockview instance produced. Moving the last
Pane out of a Daughter Window closes it through the exact same
`onDidLayoutChange`/`closeIfEmpty` path issue 02 already built for any
other last-Pane close — `removePanel` does not know or care which UI
action asked for it.

dockview's own tab context menu has no native submenu primitive
(`ContextMenuItemConfig` is flat: a label, an action, nothing nested), so
"Move to [Window]" is one flat entry per open target rather than a genuine
"Move to Window ▸ target" flyout — the same words, the same choice, just
without a UI mechanism this library gives no seam to build.

**Settings, Profiles and Workspaces are automatically shared again, with no
new plumbing**, the moment the localhost server is gone: every window is
back on one fixed origin, and `localStorage` is scoped to it. Live
same-session propagation (a Settings change in one open window reaching
another already-open window) is deferred to issue 06, riding the platform's
own same-origin `storage` event rather than a Rust-relayed channel.

**Issue 07 restored the original spec's headline gesture — dragging a
Pane's tab past every open Window's edge to create a new Daughter Window —
against this mechanism, and it needed a third, distinct way to move a
Pane's own state across the realm split, alongside issue 04's broadcast and
issue 05's handoff.** dockview has no "did drag end" event of its own
(`onWillDragPanel` only fires at drag start), so the native `dragend`'s own
screen coordinates are what mark where the pointer actually let go — the
same signal ADR 0004's own popout-era drag-out used, just now compared
against every open Window's bounds gathered by label
(`daughterWindowNative.ts`'s `readWindowBounds`, `outerPosition`/`outerSize`
converted to logical pixels) rather than read live off a shared `window`
object, since no realm has access to another's. The pure hit test itself
(`daughterWindows.ts`'s `dragOutTarget`) needed no changes at all: it was
already written mechanism-agnostically when issue 02 deleted its only
caller, sitting unused for exactly this. Unlike "Move to new window," which
still opens empty (this ADR's own consequence above, unchanged), a drag-out
carries the dragged Pane's own `paneState.ts` state into the fresh window —
losing a filter mid-drag would read as a bug the user is watching happen,
not an acceptable gap the way an empty menu-opened window is. Neither issue
04's broadcast nor issue 05's handoff fit: both assume their target Window
is already open and already listening, which a window this same call is
still in the middle of creating is not. The state instead travels
JSON-serialized and percent-encoded on the new window's own URL
(`open_daughter_window_at`'s `?pane=<kind>&paneState=<encoded>`, mirroring
how `?pane=<kind>` and `?restore=<index>` already carry their own payloads
the same way) and is read back out on mount, before the seeded Pane's own
`usePaneState` ever runs — no race with anything's `listen` registration
because there is nothing to race.

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

**Closing the Main Window does not cascade to its Daughter Windows on its
own — Tauri has no such behavior for separate `WebviewWindow`s, unlike the
single-realm popout mechanism this decision replaced, where destroying the
one shared React tree took every popout's DOM with it inherently.** Found
by hand, not by any of the seven numbered issues' own checklists: closing
the Main Window while Daughter Windows were open left them running,
orphaned — nothing in a Daughter Window's own React tree can Connect, take
Control or manage the Workspace once the Main Window is gone, so there was
nothing left for one to do but sit there holding the process open. Fixed in
`lib.rs`'s `setup`: a `WindowEvent::Destroyed` handler on the Main Window
itself calls `daughter_windows::close_all`, the Rust-side equivalent of
`daughterWindowNative.ts`'s own `closeDaughterWindow` (`Window.close()` by
label, read from the same `AppState`-held registry `list_daughter_windows`
already exposes) — issued directly rather than round-tripped through IPC,
since there is no live frontend left once the Main Window is gone to issue
it from. Each Daughter Window's own `beforeunload` still fires as this
runs, exactly as any other close would, so its last-known content and
bounds land in the active Workspace and restore again next launch rather
than being lost by closing this way.

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

Issue 04's own addition: `paneLocations.ts`'s `usePaneLocations`, mocking
`@tauri-apps/api/event`'s `emit`/`listen` the same way `daughterWindowNative.test.ts`
already does for `listen` alone — own-entry-always-current, another Window's
broadcast merging in, pruning on a `stillOpen` change, and the catch-up
request/response handshake itself are each pinned directly against the hook
via `renderHook`, no real dockview instance needed. The handshake test runs
two real `usePaneLocations` instances against a shared in-memory event-bus
test double, the way two real Windows would talk to each other — its first
draft used plain array literals inline as the two instances' own
`ownPaneIds`, which crashed the test worker with an out-of-memory infinite
loop: each instance's own broadcast-triggered re-render recreated a "new"
array reference every time, which the hook's own change-detection cannot
tell apart from an actual change, so each instance kept re-announcing in
response to the other's re-announcement, forever. Fixed by hoisting those
arrays to stable `const`s in the test; real callers never hit this, since
`AppShell.tsx`/`DaughterWindowShell.tsx` only ever produce a fresh
`openPaneIds` array from dockview's own `onDidLayoutChange`, an external
event untouched by this hook's own state. `daughterWindows.ts`'s
`paneMenuEntries` and new `knownWindowIds` stay plain data-in-data-out
functions over a hand-built `ReadonlyMap<WindowId, readonly string[]>`, same
as before.

Issue 05's own additions: `daughterWindows.ts`'s new `moveTargets` is
another plain data-in-data-out function, pinned the same way
`paneMenuEntries` already is. `paneHandoff.ts` (`sendPaneHandoff`,
`useIncomingPaneHandoffs`) is mocked the same way `paneLocations.ts` is
elsewhere. `useMoveToWindow.ts` itself mocks `paneHandoff.ts` wholesale
(the same pattern `useMoveToNewDaughterWindow.test.ts` already uses for
`daughterWindowNative.ts`) to pin `targetsFor`/`requestMove`/the incoming-
handoff callback in isolation. The one thing none of that isolation can
confirm — a real `addPanel` call and a real `usePaneState` mount actually
cooperating with `restorePaneState`'s "seed before mount" contract — is
exercised end to end in `DaughterWindowShell.test.tsx` by invoking the
mocked `listen` handler directly to simulate an incoming handoff against
its real, already-rendered `<Workspace>`; this is also what caught the
dead `title` field described above, a defect no isolated mock of either
half could have surfaced since each was internally consistent about a
title that a real Pane component silently discards. A genuine two-Window
round trip — the sending half's own tab-context-menu action, actually
clicked, actually relocating a Pane into a second real `WebviewWindow` —
has no test seam in this file (`getCurrentWindow` is one global mocked
return value, unable to tell two simultaneously-live instances apart) and
is left to hand verification against a packaged binary, the same as this
directory's other real-OS-window mechanics.

Issue 07's own additions: `dragOutTarget` itself needed no new tests — it
was already fully pinned when issue 02 left it unused. `useMoveToNewDaughterWindow.test.ts`
gained an `attachDragOutListener` suite, mocking `daughterWindowNative.ts`
wholesale the same way its existing "Move to new window" tests already do,
driven by registering a fake dockview `onWillDragPanel` handler and
dispatching real `dragend` events against it — including the 5th-window
warning applying to a drag-out exactly as it does to the menu command, and
a non-`DragEvent` drag start (pointer-based) being ignored outright. jsdom
implements no `DragEvent` at all (a known upstream gap), so `setupTests.ts`
gained a thin `MouseEvent` subclass registered as `globalThis.DragEvent`
purely so `instanceof DragEvent` narrowing and `screenX`/`screenY`
construction work inside a test at all — every other stub in that file
follows the same "inert stand-in for a missing DOM API" shape. `daughterWindowNative.test.ts`
gained `openDaughterWindowAt` (the encoded-state call shape) and
`readWindowBounds` (outer-bounds-to-logical-pixels conversion, and omitting
a Window that fails to resolve), mocking `@tauri-apps/api/window` the same
way its neighboring tests already do. `DaughterWindowShell.test.tsx` gained
two tests round-tripping `?paneState=` through a real mount — exposing a
latent gap in that file's own isolation along the way: `paneState.ts`'s
module-level store was never reset between tests, which nothing had
depended on until a test early in file order needed to seed a non-empty
value; fixed with a `loadPaneStates({})` reset added to the file's own
top-level `afterEach`, alongside its existing storage/mock cleanup.

**Not hand-verified against a packaged binary, and not verifiable from this
environment**: whether a WebView2 `dragend`'s own `screenX`/`screenY` are
actually logical (CSS) pixels — the unit `readWindowBounds`'s Tauri-physical-
to-logical conversion produces — especially across a multi-monitor setup
where two displays carry different DPI scale factors. `dragOutTarget`'s own
hit test assumes both sides already agree on a unit, the same assumption
ADR 0004's own popout-era drag-out made of the single-realm `window.screenX`/
`outerWidth` it compared against directly; carried forward here rather than
re-derived, since nothing in this environment can drive a real cross-window
native drag to confirm or refute it. This is the same category of gap
issues 01, 02 and 05 already carry their own documented, unconfirmed
sections for, not a new kind of uncertainty this issue introduces.
