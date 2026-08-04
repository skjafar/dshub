# 08 — Named Workspaces and persistence contracts

**What to build:** Workspaces become saveable, named artifacts belonging to a Profile, so rearranging Panes to chase a bug never destroys the arrangement kept for monitoring. A Profile owns several, one marked default, switchable from the chrome. Reopening the application restores the last Workspace exactly, including each Pane's own filter and selection — restoring a layout must restore what the Panes were actually showing, not empty Panes in the right places.

Because a stored Workspace embeds a third-party serialization format, corruption is a real failure mode rather than a theoretical one. An unrecognised or damaged stored layout must degrade to the default Workspace, never to a blank screen.

**Blocked by:** 06

**Status:** ready-for-agent

- [x] The current arrangement can be saved as a named Workspace
- [x] Named Workspaces can be switched, renamed and deleted from the chrome
- [x] One Workspace is marked default and is what a Profile opens into
- [x] Reopening the application restores the last Workspace, including per-Pane filter and selection
- [x] Multiple Panes of the same kind restore with their state correctly separated
- [x] Round-trip contract tests assert save-then-restore reproduces Panes, arrangement, filters and selections
- [x] A corrupt or unrecognised stored layout degrades to the default Workspace

## Comments

**A Workspace is dockview's serialized layout, each open Pane's own state, and
the shared Inspector's selection — three fields, one record.** `workspaceStore.ts`
owns the shape (`StoredWorkspace`, `ProfileWorkspaces`) and every pure operation
on it: seed, add, rename, remove, switch, update-content, validate. Nothing
about dockview or React leaks into it beyond the minimal `WorkspaceDockApi` seam
(`toJSON`/`fromJSON`/`panels`), which is deliberately not the full `DockviewApi`
type — the same seam philosophy the device port uses, so save/restore can be
pinned against a fake api rather than a live dockview instance, which ADR-0001
keeps out of this project's test net.

**Nothing is "saved" by a button most of the time — it autosaves.** The spec's
own framing ("rearranging Panes to chase a bug never destroys the arrangement
kept for monitoring") only holds if the *active* Workspace's live state is kept
current without asking, the same way `dashboardLayouts` already is. Two
independent triggers schedule a 400 ms debounced write: dockview's own
`onDidLayoutChange` (open/close/move/resize) and a new subscription on
`paneState.ts` (`subscribePaneStateChanges`) for changes that never touch
dockview at all — retyping a filter, for instance. "Save current arrangement
as…" in the chrome is therefore a *branch*, not the only way anything is kept:
it snapshots the live (already-autosaving) state into a new named record and
switches to it, so future autosaves target the new Workspace rather than the
one it was copied from.

**Restoring seeds `paneState.ts` before dockview, never after.** `usePaneState`
only reads its module-level store on a Pane's first mount, and `fromJSON` is
what creates that mount — seeding afterward would restore every Pane to its own
default. `restoreWorkspace` in `workspaceStore.ts` pins this order directly.

**Corruption is repaired, not just detected.** A stored Workspace collection
gets two independent layers of tolerance. `sanitizeProfileWorkspaces` validates
the *stored* shape structurally — a candidate naming a Pane kind this build has
retired, a malformed grid, a dangling default/active pointer — and drops only
the individually-invalid Workspaces, repairing pointers left dangling by a
drop, rather than invalidating the whole collection over one bad entry. A
second layer catches what structural validation cannot: `dockview.fromJSON`
clears the current layout *before* it validates its own input (confirmed by
reading `dockviewComponent.js`), so a candidate that passes `sanitize` but that
dockview itself then rejects at runtime — a field a future dockview version
dropped, say — would otherwise leave the api cleared with nothing shown. The
restore loop in `AppShell.handleReady` tries the active Workspace, and on a
runtime failure drops just that one (`withoutWorkspace`, which — unlike
`removeWorkspace` — will drop the default too, because a broken default has to
come out for the next candidate to get a turn) and retries with whatever the
collection has left. Only when nothing in the collection actually loads does
the shell rebuild the bundled arrangement and reseed. Verified in a browser: a
corrupted *non-active* Workspace among several is silently dropped and the rest
survive; a corrupted *active* Workspace with sibling Workspaces present falls
back to the next one rather than reseeding from scratch; total corruption of
the stored collection reseeds cleanly with no blank screen.

**The one-off review** on this ticket found that runtime dockview failures were
being treated the same as "nothing was ever stored" — discarding every saved
Workspace over one that failed to load, when only one had actually been tried.
Fixed by the retry loop above; `withoutWorkspace` is new and covered directly,
and the fix was re-verified by hand against a live corruption (see above) since
`AppShell.tsx`'s dock-integration code sits outside this project's automated
test net by the same ADR-0001 precedent that keeps drag behaviour out of it.

**Deleting is two-click, not confirmed by dialog.** The delete button reads
"Confirm?" for three seconds (or until it loses focus) before a second click
actually deletes; the default Workspace's delete button is simply disabled
rather than explained, since `removeWorkspace` refuses it unconditionally and a
control that can never act needs no separate reason given for a single,
permanent Workspace every Profile keeps.

**A testing artifact worth recording for the next reader.** Corrupting
`localStorage` on a *live* page and then calling `location.reload()` does not
exercise real corruption-recovery: both this ticket's `beforeunload` flush and
`SettingsContext`'s own pre-existing one fire during the reload and write
React's still-valid in-memory state back over the injected corruption before
the fresh page ever mounts. Real corruption predates the app process starting
— there is no live in-memory state to race. Verifying it means corrupting from
one page and loading a brand-new one against the result, which is what every
corruption check above did.

353 frontend tests grew to 390 for this ticket (paneState snapshot/load/subscribe,
workspaceStore validation/repair/collection-ops/dock-orchestration,
WorkspacesDialog interaction). Typecheck and lint clean (154 pre-existing
warnings, unchanged from `HEAD`).
