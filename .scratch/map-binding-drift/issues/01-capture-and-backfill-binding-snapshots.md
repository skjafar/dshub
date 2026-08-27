# 01 — Capture and backfill binding identity snapshots

**What to build:** Every read binding, address-kind write target, and Plot series records a snapshot of what it was bound to — the entry's name and shape (type, array-ness, array size) — alongside the address it actually reads, writes, or polls. Anything persisted before this change gets its snapshot backfilled the first time it loads, from whatever entry currently sits at its stored address. This is the foundational data-model change every later ticket in this effort builds on.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Binding a Widget to an entry via the existing address-picker records that entry's name, type, array-ness, and array size alongside the address.
- [ ] Setting an address-kind write target (for a control Widget) records the same snapshot.
- [ ] Adding a Plot series records the same snapshot alongside the address it already stores today (in addition to the name it already stores).
- [ ] A Widget, write target, or Plot series saved before this change, once loaded under the new code, has its snapshot backfilled from whatever entry currently sits at its stored address — no crash, no data loss, no visible behavior change for anything that hasn't actually drifted.
- [ ] A binding whose stored address has no entry at all (Map shrank since it was last saved) backfills without erroring — the pre-existing "not found" case keeps working exactly as it does today.
- [ ] Command-code write targets are untouched by this change — they carry no snapshot.
- [ ] Unit tests cover the backfill path against a hand-built Map and pre-snapshot binding/target/series shapes, including the "no entry at that address" case.
