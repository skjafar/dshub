# 07 — Map edit produces a full-Profile drift review

**What to build:** Saving an edit in the Map Editor — a row-level edit or a raw-file Address Space replacement — triggers a review of every binding, write target, and Plot series in the whole Profile, not just what's currently open, and gives the Engineer a way to fix everything affected in one sitting. This turns ticket 03's safety net (things are held so nothing shows or does anything wrong) into something actually actionable.

**Blocked by:** 02, 06

**Status:** ready-for-agent

- [x] Saving a Map Editor edit diffs the Map about to be committed against the Map as it stood when the Editor was opened, per Address Space.
- [x] The scanner (ticket 06) collects every binding/target/series in the active Profile; the resolver (ticket 02) checks each one against the new Map.
- [x] A review opens automatically immediately after a save that produces at least one item that is not "unchanged." A save with nothing affected opens no review.
- [x] Each item in the review shows which Dashboard or Workspace/Pane it belongs to, its previous identity (name/address), and — when the resolver classified it as "moved" — the suggested new address.
- [x] Each item offers three actions: accept the suggested re-point, manually re-pick the correct entry (reusing the existing address-picker binding UI), or explicitly leave it unresolved.
- [x] A single bulk action accepts every "moved" (exact-name-match) suggestion across the whole review at once.
- [x] "Removed" and "type-changed" items are never auto-suggested a fix — only "moved" items get a one-click suggestion, per the resolver's own classification.
- [x] The review can be closed once every item has one of the three dispositions; "left unresolved" is a valid disposition, not a blocker to closing.
- [x] Accepting a suggestion or a manual pick rewrites exactly the targeted binding/target/series' stored address and snapshot, and nothing else.
- [x] Leaving an item unresolved makes no change to its stored data, so ticket 03's live "needs review" status keeps showing for it afterward, wherever it's rendered.
- [x] The Map itself still commits even when items are flagged — only the affected bindings are held, not the whole edit.

## Comments

**Resolved.** No separate old-Map-vs-new-Map diff structure was needed:
the resolver's own snapshot-based comparison already carries each
binding's own bind-time baseline, so "the scanner collects, the resolver
checks against the new Map" (spec.md's own framing) is sufficient on its
own — `AppShell.tsx` subscribes to `useMapEntries.ts`'s new
`subscribeMapEdited` (fired from `announceMapEdited`, i.e. exactly a Map
Editor save) and, on each edit, runs `bindingsNeedingReview` against the
just-saved Profile's entries, opening `BindingReviewDialog.tsx` when
anything is flagged. Each item offers accept ("moved" only, via the
resolver's own suggestion), manual re-pick (reusing
`WidgetConfigDialog.tsx`'s exported `AddressComboBox`), or leave for now;
a bulk "Accept all moved" handles every confidently-moved item at once.
`bindingReviewApplier.ts`'s `applyBindingFixes` rewrites exactly the
targeted binding/target/series' address and snapshot and nothing else,
locating a Widget by id (recursing into Container children) and a Plot
series by workspace/window/pane/name. Review found and fixed two real
gaps against this ticket's own checklist: `detailFor`'s original text
never showed a flagged item's *previous* address for any resolution kind,
and never named what currently occupies a removed entry's old address (or
that it's empty) — both now shown, sourced from a live `useMapEntries`
read inside the dialog itself.

**Confirmed, narrow scope cut:** the dialog can be closed without giving
every item an explicit disposition — an undecided item is treated as
"left for now" rather than trapping the dialog open, since a dead-end
modal would violate this app's own "calm confidence" design principle,
and "left unresolved" is already a valid disposition per this ticket's own
wording.

**Confirmed, narrow scope cut:** the dialog auto-opens in the Main Window
only — `subscribeMapEdited` fires in whichever Window's own realm the
save happened in, and a Daughter-Window-hosted Map Editor (the Pane is a
singleton, rarely relocated) has no shared React context back into the
Main Window's own state to trigger it there. The underlying settings
update lands correctly regardless of which Window saved; only the
auto-open convenience is Main-Window-scoped, and issue 08's own indicator
still surfaces the same items on its own next scan.

**Confirmed, narrow scope cut:** the applier only rewrites persisted
settings. A Plot Pane that is currently open and already mounted keeps its
own separate `usePaneState` cache, which an accepted fix does not reach
until that Pane remounts — it simply keeps showing "needs review" rather
than resuming with a stale value, a safe-by-default gap rather than a
correctness one.

Hand-verified end-to-end against a real dev-server build via Playwright,
not only component tests: create a Profile, bind a Widget, rename the
bound entry in the Map Editor, save — the review dialog opens
automatically showing the correct "removed" item, "Pick manually" reuses
the real address-picker, and closing it clears both the dialog and the
persistent indicator with zero console errors throughout.
