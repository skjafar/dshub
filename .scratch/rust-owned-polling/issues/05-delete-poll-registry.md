# 05 — pollRegistry.ts deleted

**What to build:** no code path decides polling cadence in the browser anymore — the migration issues 03 and 04 started is complete, not partial. This is the contract step: no new behavior, but a real, verifiable milestone.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] Nothing in the frontend imports or calls the old browser-side poll registry
- [ ] The old poll registry module and its dedicated test are removed
- [ ] Full typecheck, lint, and test suite pass with it gone
- [ ] A search for its old public API (subscribe / setReader / setEnabled) across the frontend returns nothing
- [ ] `docs/adr/0003-frozen-data-path.md` gets its amendment recorded — what moved (poll-coalescing ownership) and what didn't (response correlation, request serialization, the rate limiter)

## Comments

This is also the ticket that un-gates `.scratch/daughter-windows-native/` — its issue 02 is blocked on this one landing.
