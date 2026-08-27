# 02 — Per-binding resolver

**What to build:** A pure function that classifies one binding's captured snapshot against a set of current Map entries. This is the single decision point every other part of this effort relies on — used both for a Widget/Plot's own live status and for the bulk review built when a Map edit is saved.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] Given one binding's snapshot (name, address, type, array-ness, array size) and a list of current Map entries for the relevant Address Space, the function returns exactly one of: unchanged, moved, removed, or type-changed.
- [x] Unchanged: name, address, and shape at that address all still match the snapshot.
- [x] Moved: the snapshot's name is found at a different address than the one stored; the matching entry is returned so a caller can offer it as a suggestion.
- [x] Removed: the snapshot's name does not appear anywhere in the given entries.
- [x] Type-changed: name and address both still match, but type, array-ness, or array size differs from the snapshot.
- [x] A name that happens to match more than one entry cannot occur (Map names are already unique within a space) — assert this rather than silently picking one.
- [x] No I/O, no React, no dependency on any specific Widget/Plot type — operates purely on the snapshot shape and a plain entry list.
- [x] Unit tests cover: unchanged; pure reorder/move by name; delete with nothing to replace it; rename with the old name gone entirely; type widened at the same name+address; array size changed at the same name+address.

## Comments

**Resolved.** `shell/bindingResolver.ts`'s `resolveBinding` is the seam,
exactly as scoped — pure, no I/O, taking a snapshot/address/entry-list and
returning the four-way classification. It also grew `isBindingDrifted`
(snapshot → boolean), added during review once ticket 03's own live call
sites were found duplicating "call `resolveBinding`, check `kind !==
'unchanged'`" three times over; every live check now goes through the one
function. `isBindingDrifted` is also what fixed a real bug review caught:
`useWidgetReading`/`ButtonWidget` originally looked an entry up **by
address** before ever consulting the resolver, but `mapParser.ts` assigns
addresses sequentially with no gaps, so deleting or resizing an *earlier*
entry shifts every later one down and leaves the old address genuinely
vacant — a routine "moved" outcome a by-address-first check misreads as
plain "not found". `isBindingDrifted` deliberately never requires finding
an entry at the stored address first, and both call sites were corrected
to check it before falling back to their own "not found" case.
