# 05 — Metadata follows entry identity through Map Editor edits

**What to build:** An entry's description/unit/value-list metadata stays attached to the right entry through the Map Editor's own operations, instead of silently becoming orphaned under a name that no longer exists. Renames and deletes performed directly in the Editor are known, unambiguous transformations, so this can be handled automatically with no review step — unlike binding drift, there is nothing ambiguous or risky about it.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] Renaming an entry through the Map Editor moves its metadata (description, unit, value list) to the new name automatically, with no user action required.
- [x] Deleting an entry through the Map Editor removes its associated metadata.
- [x] Replacing an Address Space's entries wholesale from a raw file removes metadata for any name no longer present among the newly loaded entries, silently, with no prompt or confirmation.
- [x] A name that continues to exist unchanged through any of these operations keeps its metadata untouched.
- [x] Reordering entries (address changes, names unchanged) never affects any metadata, since metadata is keyed by name rather than address.
- [x] Unit tests alongside the Map Editor's existing add/update/delete/reorder tests, covering rename-carries, delete-drops, and bulk-replace-prunes.

## Comments

**Resolved** — mostly already true, one real fix. Rename-carry and
delete-drop (this ticket's first two bullets) needed no new code at all:
`mapEditorDraft.ts`'s `updateEntry`/`deleteEntry` already carry a target
entry's own `unit`/`description`/`valueList` fields onto its replacement
(or drop them with it), and `extractMetadata`, called fresh from the
*current* draft at save time, already re-derives the Profile's metadata
dict from whatever the entries currently hold — so a rename or delete
already carried or dropped metadata correctly before this ticket existed.
The actual gap was the third bullet: `MapEditorPane.tsx`'s
`handleImportFile` replaced the draft with a freshly parsed file's entries
directly, which carry no metadata at all — meaning `extractMetadata` at
save time would wipe *every* entry's metadata, including names that
survived the replacement, not just the ones that vanished. Fixed by
re-applying `extractMetadata` of the *pre-replacement* draft onto the
freshly parsed entries before storing them
(`applyMetadata(parsed.entries, extractMetadata(entriesOf(previous,
space)))`), so a surviving name keeps its metadata and a vanished one
naturally drops out at the next `extractMetadata` call. Confirmed as a
real regression, not a speculative one: reverting the fix and re-running
`__tests__/MapEditorPane.test.tsx`'s new "keeps a surviving entry's
metadata and drops a removed entry's" test fails with the bug's exact
symptom (metadata wiped to `{}` instead of retaining the surviving entry).
