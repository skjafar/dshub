# 04 — Bulk auto-refresh polls via Rust

**What to build:** toggling "auto-refresh" on the Registers or Parameters panel drives the same Rust-owned subscription mechanism (issue 03) for every address currently visible in that panel, not just individually-bound widgets.

**Blocked by:** 03

**Status:** ready-for-agent

- [x] Turning on bulk auto-refresh in the Registers or Parameters panel subscribes every visible address through the mechanism issue 03 built
- [x] Changing which addresses are visible — filtering, scrolling, switching Profile — subscribes and unsubscribes correctly rather than leaking old subscriptions or missing newly-visible ones
- [x] Turning bulk auto-refresh off unsubscribes everything it added
- [x] Registering this interest doesn't require a live connection; reads only actually happen once one exists

## Comments

**Resolved, mostly by discovery rather than new production code.** The
"Registers or Parameters panel" this ticket means is `AddressSpacePane.tsx`
(`shell/panes/`) — the interface-rebuild's actual Pane, not the pre-rebuild
sidebar panel this ticket's wording predates. Its own "Live" toggle already
declares interest in every row the filter currently leaves visible via
`usePolledTargets` (`hooks/useAutoRefresh.ts`), and issue 03 already switched
that hook's internals from `pollRegistry` to
`subscribeAddress`/`unsubscribeAddress` — so toggling "Live" already drove
the Rust-owned mechanism for every visible address, for free, the moment
issue 03 landed. Filtering and switching Profile both change `filtered`
(`useMapEntries`/`filterEntries`), which the Pane's `targets` list derives
from, so both already resubscribe correctly; there is no scrolling-driven
virtualization in `Entries.tsx` to add a case for.

Separately, `DSHubContext.tsx` still carried a second, fully orphaned bulk
auto-refresh implementation — `state.autoRefresh` (`activeAddresses`/
`activeParameterAddresses`/`activeSystemAddresses`/`enabled`/`interval`), 7
reducer cases, and 7 exposed actions (`setAutoRefresh`,
`add`/`removeAutoRefreshRegister`, etc.) — still wired to the old
`pollRegistry`. It backed the pre-rebuild sidebar Registers/Parameters panel,
deleted wholesale in interface-rebuild issue 22; nothing outside
`DSHubContext.tsx` itself has referenced any of those action names since
(confirmed by a repo-wide grep). Left in place, it would have stood as a
second, misleading "bulk auto-refresh" mechanism next to the real one this
ticket is about. Removed entirely — state field, action variants, reducer
cases, interface entries, implementations, and the three now-unused
`registersRef`/`parametersRef`/`systemRegistersRef` refs that existed only to
serve it.

What was actually missing: test coverage. Nothing previously exercised the
Live toggle's bulk-subscribe/resubscribe/unsubscribe behaviour. Added: three
cases in the new cross-space `bulk "Live" refresh` suite
(`shell/__tests__/AddressSpacePane.test.tsx`, via a new
`shell/__tests__/subscriptionRecorder.ts` helper mirroring `writeRecorder.ts`)
pinning that turning Live on subscribes every visible row and turning it off
releases every one of them; that narrowing the filter drops the
no-longer-visible subscriptions while keeping the still-matching one; and
that the Map changing under a live Pane (`announceMapEdited` — the same
`mapManager.initialize` + re-render signal a real Profile switch drives
through `useMapEntries`'s own effect, exercised directly here rather than via
the Profiles dialog UI) drops every old subscription and picks up the new
Map's own. `Entries.tsx` has no scrolling-driven virtualization, so there is
no separate case for it — every filtered row is already "visible."

**The fourth checkbox is honest about a narrower claim than it reads.**
`subscribeAddress` itself (`poll.rs`, mirrored in `fakeBackendPort.ts`) never
required a connection — only the actual read did, already true since issue
03 and now pinned by a new case in `fakeBackendPort.test.ts`'s "address
subscriptions" suite (subscribe with no `connect()` at all, then connect and
confirm the first read arrives), the one scenario issue 03's own suite never
exercised. But `AddressSpacePane.tsx:154` gates the Pane's own call with
`pane.live && connected`, and `hooks/useAutoRefresh.ts`'s two individual-
widget hooks gate identically (`... && connected && ...`) — so in practice no
surface in the app calls `subscribeAddress` before a connection exists; the
Live switch is disabled while disconnected regardless (pinned by an existing
test in this same file), so a user cannot even reach that state through the
UI on a fresh session. This is pre-existing, consistent across every current
caller, and outside this ticket's scope to change — reusing the mechanism
issue 03 built is what was asked for, not renegotiating when a Pane chooses
to call it. The checkbox is marked done on the mechanism-level reading: bulk
refresh imposes no connection requirement of its own, beyond what
individually-bound widgets already impose identically.

**Residual state, left for issue 05 rather than folded in here:**
`pollRegistry.ts` is now unreferenced by any production code path — its last
caller was the bulk-refresh code just deleted — but deleting it, updating its
callers' imports and recording the ADR 0003 amendment are issue 05's own
stated checklist items, and doing them here would just be issue 05 done
early under a different ticket number. Similarly, the `'autoRefresh'`
`LogCategory` (`types/shared.ts`) has no remaining producer now that
`setAutoRefresh` is gone — `logFilter.ts` and `SettingsDialog.tsx`'s
`enableAutoRefreshLogs` toggle still reference it, and are left untouched;
chasing every transitively-orphaned identifier is a different, unbounded
task from this one.

**Frozen code.** `DSHubContext.tsx`'s device half is frozen by ADR 0003; the
deletion here removes an unreachable branch and its own local refs rather
than changing sequencing, response correlation, poll coalescing, error
handling or any state transition a live path exercises — no behaviour
changes for anything that was actually running. No new ADR 0003 amendment
section is added for it here, since issue 05 already owns recording that
document's amendment for this whole migration.

Full frontend suite (722 tests, 59 files — up from 718), typecheck, lint and
build are all clean. `cargo check` is clean too (pre-existing warnings in
`lib.rs` only, none from this change) — no Rust file was touched.
