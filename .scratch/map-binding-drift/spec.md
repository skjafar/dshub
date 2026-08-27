# Map binding drift detection

**Status:** ready-for-agent

## Problem Statement

An Engineer builds a Dashboard by binding Widgets to entries in a Profile's Map, and builds Plots by adding series bound the same way. Firmware moves on: a Register or Parameter Map gets edited to match a new firmware revision — entries added, removed, reordered, or renamed, or an entire Address Space's Map replaced wholesale from a regenerated file. Nothing about a Widget's or Plot's own configuration ever changes when this happens, but what its stored address actually *means* can change out from under it, because an address is not stable data — it is recomputed from an entry's position every time the Map is edited.

Today this failure is silent. A pure reorder repoints every later binding at a different entry with no warning at all: a Widget that used to show `MOTOR_TEMP` now shows whatever moved into that slot, under the old label, formatted with the old assumptions, with no indication that anything is wrong. A rename or deletion is only slightly better — it is caught, but only if the address ends up completely absent from the Map; if some other entry now legitimately occupies that address, the Widget renders it as if it were correct. A control Widget bound the same way can write to the wrong Register or Parameter on live hardware. An Operator watching a Dashboard has no way to tell a trustworthy reading from one quietly pulled from the wrong place.

## Solution

Every read binding, address-bound write target, and Plot series records, alongside the address it actually reads or writes, a snapshot of what it was bound to: the entry's name and its shape (type, array-ness, array size). Editing a Profile's Map — whether by hand in the Map Editor or by replacing a whole Address Space from a file — checks every one of these snapshots, across every Dashboard and every Workspace belonging to that Profile, against the Map that's about to be saved. Anything whose snapshot no longer matches is held: it stops showing a value (or, for a write target, refuses to fire) and is presented in a review, with a one-click fix offered whenever the same name can still be found elsewhere in the new Map. The Engineer resolves each one — accept the suggestion, pick the correct entry manually, or explicitly leave it for later — before it's trusted again anywhere it's shown. Anything left unresolved stays visibly flagged, both on the Widget or Plot itself and in one persistent, always-reachable place, so nothing gets lost.

Metadata (an entry's description, unit, and value list) gets the same care where it's cheap to give: a rename or deletion made directly in the Map Editor carries or drops the metadata automatically, since the Editor knows exactly what happened; a bulk file replacement, which doesn't have that certainty, just quietly drops metadata for names that no longer exist anywhere, since keeping it around serves no purpose.

## User Stories

1. As an Engineer editing a Profile's Map, I want any Widget or Plot bound into that Profile to be checked against my edit before it's saved, so I don't discover a silently wrong reading days later.
2. As an Engineer who reorders entries in the Map Editor, I want a Widget's binding to be recognized as moved rather than silently repointed to whatever entry now sits at the old address.
3. As an Engineer who renames an entry in the Map Editor, I want any Widget or Plot series bound to it flagged for review rather than silently reading the new occupant of that address.
4. As an Engineer who deletes an entry from the Map Editor, I want every Widget, Plot series, or write target bound to it clearly flagged as removed, not left pointing at whatever now occupies that address.
5. As an Engineer who replaces an entire Address Space from a raw map file, I want the same detection and review to run against every entry that changed, not just entries I touched by hand in the Editor.
6. As an Engineer, I want the review to also catch a same-name, same-address entry whose type or array size changed, so a Widget doesn't silently misinterpret raw bytes of a different width or shape.
7. As an Engineer, when a bound entry has simply moved to a new address (its name found elsewhere in the new Map), I want a one-click "re-point to its new address" suggestion, so I don't have to search for it myself.
8. As an Engineer, when a bound entry's name no longer exists anywhere in the new Map, I want it presented plainly as removed — showing whatever now occupies that address, or that it's empty — rather than have the system guess a "probably renamed to" match I never asked for.
9. As an Engineer reviewing many flagged items after a large firmware update, I want a single action that accepts every confident (exact-name-match) suggestion at once, so I'm not clicking through dozens of unambiguous cases one at a time.
10. As an Engineer, for anything I'm not confident about, I want to manually re-pick the correct entry using the same address-picker I already use to bind a Widget, so re-binding doesn't require learning a second UI.
11. As an Engineer, I want the option to explicitly leave a flagged item unresolved for now rather than being forced to fix or delete it immediately, so I can defer harder decisions without blocking the rest of my work.
12. As an Operator watching a live Dashboard while someone else edits the Profile's Map, I want any Widget whose binding is now in question to stop showing a value and show a clear "needs review" state instead, so I never mistake a reading pulled from the wrong entry for a trustworthy one.
13. As an Operator, I want this protection to hold no matter which open Window — Main or Daughter — is showing the affected Widget, so a Daughter Window's Dashboard doesn't keep displaying a wrong value just because the edit happened somewhere else.
14. As an Engineer using a control Widget bound to an address, I want it to refuse to fire rather than write to a guessed or now-ambiguous address, so a Map edit never turns into an accidental write to the wrong Register or Parameter on live hardware.
15. As an Engineer, I want a Plot series' actual device poll to always read from the address currently matching its bound name, rather than whatever address was recorded when the series was first added, so a moved entry's live plot never mixes values from two different registers.
16. As an Engineer, I want the review to check every Dashboard and every Workspace's saved Plot series belonging to the affected Profile, not just whatever happens to be open right now, so a Dashboard I'm not currently viewing doesn't quietly rot until I stumble back onto it.
17. As an Engineer, I want this full-Profile check to run automatically as part of saving a Map edit, without needing to remember to trigger an audit myself.
18. As an Engineer, I want a persistent, always-reachable place to see and resolve anything I previously left unresolved, so it isn't lost the moment I close the review.
19. As an Engineer, I want that persistent entry point to show no indicator at all when nothing needs attention, so it adds no clutter to a Profile that's in good shape.
20. As an Engineer, I want a small warning indicator to appear the moment any binding needs review, so I notice without having to check proactively.
21. As an Operator or Engineer opening a Dashboard that still has an unresolved binding from an earlier edit, I want the affected Widget to keep showing its own "needs review" state inline, so the problem is visible exactly where it matters, not only in a separate list.
22. As an Engineer, I want the review to show which Dashboard or Workspace each flagged item belongs to, so I know where to go to double-check it in context.
23. As an Engineer who renames an entry in the Map Editor, I want its description, unit, and value-list metadata to follow the rename automatically, so I don't have to re-type it under the new name.
24. As an Engineer who deletes an entry in the Map Editor, I want its now-meaningless metadata cleaned up automatically, so old descriptions don't accumulate under names that no longer exist.
25. As an Engineer who replaces an Address Space from a raw file, I want any metadata that no longer matches a name in the new file quietly pruned, so my Profile doesn't accumulate orphaned descriptive text I have to notice and clean up myself.
26. As an Engineer with Profiles created before this feature existed, I want my existing Widgets and Plots to keep working exactly as before on first load, with protection starting from my next Map edit onward, rather than being flagged for drift that already happened with no record of what changed.
27. As an Engineer, I want command-code write targets to be entirely unaffected by this feature, since their identity is a code I assign myself rather than a derived address, so no false "needs review" ever appears for something that was never at risk.

## Implementation Decisions

**Captured identity snapshot.** A read binding, an address-kind write target, and a Plot series each gain a snapshot of what they were bound to at bind time — the entry's name plus its shape (type, array-ness, array size) — alongside the address, which remains the only value actually used for a device read, write, or poll. Command-code write targets are untouched: their identity is an explicit, hand-assigned code, not a derived address, so they carry no snapshot and never enter a review.

**Per-binding resolver (seam).** A pure function takes one binding's captured snapshot and stored address, plus the current entries for that Address Space, and returns one of: unchanged; moved (the snapshot's name found at a different address, naming the new entry); removed (the name not found anywhere); or type-changed (name and address still match, but shape differs). This one function backs both the live "needs review" state shown on an already-rendered Widget or Plot (checked against the currently active Map) and the bulk review built when a Map edit is saved (checked against the Map about to be committed) — it is the single place drift is actually decided.

**Profile-wide binding scanner (seam).** A pure function enumerates every read binding, address-kind write target, and Plot series belonging to a Profile — across every Dashboard and every Workspace's saved Pane state — independent of what is currently open in any Window. This is what makes the review exhaustive rather than limited to whatever happens to be on screen when the Map is edited.

**Resolution applier (seam).** A pure function takes a settings blob and one decision per flagged item — accept the suggested entry, accept a manually chosen entry, or leave unresolved — and returns settings with the relevant bindings, targets, or series rewritten. Leaving an item unresolved is a no-op write: its snapshot is untouched, so the resolver keeps flagging it on every later check until it's actually fixed.

**Map Editor save flow.** On save, the Map about to be committed is diffed, per Address Space, against the Map as it stood when the Editor was opened. The scanner collects every binding in the Profile; the resolver checks each one against the new Map; anything flagged holds its Widget, write target, or Plot series in a paused "needs review" state — no live value, a write target that refuses to fire — from the moment the Map is committed, in every open Window, until it is given a resolution. The Map itself still commits even when items are flagged; only the affected bindings are held, not the whole edit.

**Review UI.** Opens automatically after any save that produces at least one flagged item. Lists every item grouped by the Dashboard or Workspace it belongs to. Each item offers: accept the suggested re-point, manually re-pick using the existing address-picker binding UI, or explicitly leave unresolved. One bulk action accepts every "moved" (exact-name-match) suggestion at once. The review can be closed once every item has an explicit disposition — "left unresolved" counts as one.

**Live status.** The existing per-Widget "not found" status gains a sibling "needs review" status covering the moved and type-changed cases, which today are indistinguishable from a healthy binding. It reuses the same resolver against the currently active Map, so a Widget or Plot surfaces its own correct state whenever it's viewed — including for drift that wasn't caught by a review session, such as a Profile imported from elsewhere.

**Persistent review surface.** A small indicator in app chrome, visible only while the active Profile has at least one unresolved item, opens the same resolution UI used right after a save. This is what lets a deferred item get fixed at any time, not only in the moment right after editing the Map.

**Plot polling.** The address passed to the device poll for a Plot series is resolved from its bound name against the currently active Map at the moment a subscription is (re)established, rather than reusing the address recorded when the series was first added. This closes an existing mismatch, independent of this feature, where the poll and the decode could already disagree.

**Metadata.** A rename or delete performed through the Map Editor's own row-level operations carries or drops the corresponding metadata entry automatically, since the operation itself knows the old-to-new correspondence with certainty. A bulk Address-Space replacement from a raw file instead prunes any metadata entry whose name no longer appears anywhere in the newly loaded entries, silently, with no review step — there is no ambiguity worth surfacing and nothing at risk if it's wrong.

**Migration of existing data.** A binding, target, or Plot series saved before this feature shipped has no captured snapshot. The first time it loads under the new code, its snapshot is backfilled from whatever entry currently sits at its stored address, treating the current Map as a trusted baseline. Drift that happened before the feature shipped is therefore invisible — there is nothing to compare it against — and protection is forward-looking from that point on.

## Testing Decisions

A good test here asserts observable outcomes — given this old Map, this new Map, and these stored bindings, which items get flagged, with what suggestion, and does accepting a fix make the flag go away on the next check — never the internal mechanics of how the diff walks the data.

- **Per-binding resolver**: the deepest coverage, as plain unit tests over hand-built Map-entry lists, no rendering involved — matching the style of the Map Editor's own existing tests over entries. Cases: unchanged; pure reorder/move by name; deleted with nothing to replace it; renamed with the old name gone entirely; type widened at the same name and address; array size changed at the same name and address; and confirming a moved entry's name never matches more than one candidate, since a Map's own name uniqueness already guarantees that.
- **Profile-wide scanner**: unit tests over a hand-built settings blob containing a Dashboard with several Widget kinds (including a control Widget's address-bound target) and a Workspace with both an open and a not-currently-open Plot Pane's saved state, asserting every one is found and nothing from a different Profile leaks in.
- **Resolution applier**: unit tests asserting an accepted suggestion rewrites exactly the targeted binding's snapshot and address and nothing else, a manual override does the same from a caller-supplied entry, and leaving an item unresolved produces no change to stored data at all.
- **Metadata rename/delete-carry and bulk-prune**: unit tests alongside the Map Editor's existing entry-operation tests, since these piggyback on the same add/update/delete/reorder operations.
- **Live "needs review" status**: tested at the same hook/decode level the existing "not found" status already is, feeding a mismatched snapshot against a fake active Map.
- **Review dialog and persistent chrome indicator**: UI, covered by interaction-level component tests (open with several flagged items, accept one, bulk-accept the rest, close) rather than re-proving resolver logic already covered at the seam above.
- **Not unit-testable**: the actual cross-window propagation that pauses every rendering of an affected Widget everywhere it's shown. This depends on the app's real multi-window event/broadcast machinery and needs the same by-hand, packaged-binary verification already required for other cross-window behavior in this codebase — not a new exception carved out for this feature.

## Out of Scope

- Whole-Profile `.dshub` file import — already safe today, since it creates a new sibling Profile rather than mutating one with existing Dashboards.
- A new, first-class "update this Profile's Map from an external firmware file" feature — the existing per-Address-Space raw file replacement inside the Map Editor already serves that trigger.
- Any rename-guessing heuristic (for example, same-address type match) when a name disappears entirely during a bulk Address-Space replacement — always presented as removed, resolved manually.
- Retroactively detecting drift that happened before this feature shipped on Profiles that already existed — not possible without a historical baseline to diff against.
- Anything about Command list authoring or ordering, or command-code write targets generally.
- Any change to the wire protocol's own request/response address correlation, which stays frozen per ADR-0003.

## Further Notes

This closes a gap that no prior ADR or scratch issue had addressed: nothing in this codebase's design history previously considered what happens to a saved binding when the Map underneath it changes.

The captured name/shape snapshot is an additive schema change to Dashboard- and Workspace-persisted data, backfillable from current state rather than requiring a hard reset — treat it the way other additive settings-shape changes are already handled, not the way an incompatible shape change is.

This introduces the closest thing this codebase has to a "binding identity" concept, distinct from the raw address it's built on top of — worth a short follow-up to `CONTEXT.md`/`CLAUDE.md` once shipped, since neither currently has language for it.
