# 05 — pollRegistry.ts deleted

**What to build:** no code path decides polling cadence in the browser anymore — the migration issues 03 and 04 started is complete, not partial. This is the contract step: no new behavior, but a real, verifiable milestone.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [x] Nothing in the frontend imports or calls the old browser-side poll registry
- [x] The old poll registry module and its dedicated test are removed
- [x] Full typecheck, lint, and test suite pass with it gone
- [x] A search for its old public API (subscribe / setReader / setEnabled) across the frontend returns nothing
- [x] `docs/adr/0003-frozen-data-path.md` gets its amendment recorded — what moved (poll-coalescing ownership) and what didn't (response correlation, request serialization, the rate limiter)

## Comments

This is also the ticket that un-gates `.scratch/daughter-windows-native/` — its issue 02 is blocked on this one landing.

**Resolved.** `services/pollRegistry.ts` and its dedicated
`services/__tests__/pollRegistry.test.ts` are deleted. Nothing outside those
two files ever called the deleted class's own API — issue 04 had already
confirmed `pollRegistry.ts` was unreferenced by production code, with only
one residual reference left: `useAutoRefresh.ts` and its test imported the
`PollTarget` type from it, for the `{ source, address, name }` shape
`usePolledTargets` accepts. That type now lives in `useAutoRefresh.ts`
itself — "the one place a surface subscribes," per its own docstring — rather
than surviving as an orphaned import from a deleted module.

Three comments referenced the old module by name without calling anything on
it: `backendPort.ts`'s `subscribeAddress` doc compared its return shape to
`pollRegistry.ts`'s subscribe()-returns-an-unsubscriber pattern,
`fakeBackendPort.ts`'s `AddressSubscriptions` explained why it doesn't share
code with `PollRegistry`, and `shell/addressSpace.ts` said the `DataSource`
discriminants matched the strings `pollRegistry` keyed by. All three reworded
to describe the current mechanism (the port's `subscribeAddress`, `poll.rs`)
without naming a file that no longer exists. A search for `pollRegistry` and
`PollRegistry` across `client/src` now returns nothing; the only remaining
hits for the old API names are `AddressSubscriptions.setEnabled` calls in
`fakeBackendPort.ts`, which is a same-named method on an unrelated class
(deliberately its own implementation, per its own docstring) rather than a
residue of the deleted one.

**`docs/adr/0003-frozen-data-path.md`** gets a new amendment section recording
what moved (poll-coalescing ownership, from `pollRegistry.ts` to
`src-tauri/src/poll.rs`, across issues 03–05) and what didn't (response
correlation, request serialization, the rate limiter). `CLAUDE.md`'s Device
Communication section — which interface-rebuild issue 24 had explicitly
pinned to `pollRegistry.ts` and marked frozen — is updated to match, since it
is checked-in project instructions read as ground truth and would otherwise
tell the next agent to route periodic reads through a file that no longer
exists.

Full frontend suite: 712 tests, 58 files (down from 722/59, the removed
`pollRegistry.test.ts`). Typecheck, lint (0 errors, same pre-existing warning
set as before this change) and `cargo check` (no Rust file touched; same
pre-existing `lib.rs` warnings as issue 04 noted) all clean.
