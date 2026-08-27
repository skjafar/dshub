# 02 — Per-binding resolver

**What to build:** A pure function that classifies one binding's captured snapshot against a set of current Map entries. This is the single decision point every other part of this effort relies on — used both for a Widget/Plot's own live status and for the bulk review built when a Map edit is saved.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Given one binding's snapshot (name, address, type, array-ness, array size) and a list of current Map entries for the relevant Address Space, the function returns exactly one of: unchanged, moved, removed, or type-changed.
- [ ] Unchanged: name, address, and shape at that address all still match the snapshot.
- [ ] Moved: the snapshot's name is found at a different address than the one stored; the matching entry is returned so a caller can offer it as a suggestion.
- [ ] Removed: the snapshot's name does not appear anywhere in the given entries.
- [ ] Type-changed: name and address both still match, but type, array-ness, or array size differs from the snapshot.
- [ ] A name that happens to match more than one entry cannot occur (Map names are already unique within a space) — assert this rather than silently picking one.
- [ ] No I/O, no React, no dependency on any specific Widget/Plot type — operates purely on the snapshot shape and a plain entry list.
- [ ] Unit tests cover: unchanged; pure reorder/move by name; delete with nothing to replace it; rename with the old name gone entirely; type widened at the same name+address; array size changed at the same name+address.
