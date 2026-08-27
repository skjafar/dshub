# 05 — Metadata follows entry identity through Map Editor edits

**What to build:** An entry's description/unit/value-list metadata stays attached to the right entry through the Map Editor's own operations, instead of silently becoming orphaned under a name that no longer exists. Renames and deletes performed directly in the Editor are known, unambiguous transformations, so this can be handled automatically with no review step — unlike binding drift, there is nothing ambiguous or risky about it.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Renaming an entry through the Map Editor moves its metadata (description, unit, value list) to the new name automatically, with no user action required.
- [ ] Deleting an entry through the Map Editor removes its associated metadata.
- [ ] Replacing an Address Space's entries wholesale from a raw file removes metadata for any name no longer present among the newly loaded entries, silently, with no prompt or confirmation.
- [ ] A name that continues to exist unchanged through any of these operations keeps its metadata untouched.
- [ ] Reordering entries (address changes, names unchanged) never affects any metadata, since metadata is keyed by name rather than address.
- [ ] Unit tests alongside the Map Editor's existing add/update/delete/reorder tests, covering rename-carries, delete-drops, and bulk-replace-prunes.
