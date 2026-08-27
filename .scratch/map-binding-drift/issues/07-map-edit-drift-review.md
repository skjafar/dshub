# 07 — Map edit produces a full-Profile drift review

**What to build:** Saving an edit in the Map Editor — a row-level edit or a raw-file Address Space replacement — triggers a review of every binding, write target, and Plot series in the whole Profile, not just what's currently open, and gives the Engineer a way to fix everything affected in one sitting. This turns ticket 03's safety net (things are held so nothing shows or does anything wrong) into something actually actionable.

**Blocked by:** 02, 06

**Status:** ready-for-agent

- [ ] Saving a Map Editor edit diffs the Map about to be committed against the Map as it stood when the Editor was opened, per Address Space.
- [ ] The scanner (ticket 06) collects every binding/target/series in the active Profile; the resolver (ticket 02) checks each one against the new Map.
- [ ] A review opens automatically immediately after a save that produces at least one item that is not "unchanged." A save with nothing affected opens no review.
- [ ] Each item in the review shows which Dashboard or Workspace/Pane it belongs to, its previous identity (name/address), and — when the resolver classified it as "moved" — the suggested new address.
- [ ] Each item offers three actions: accept the suggested re-point, manually re-pick the correct entry (reusing the existing address-picker binding UI), or explicitly leave it unresolved.
- [ ] A single bulk action accepts every "moved" (exact-name-match) suggestion across the whole review at once.
- [ ] "Removed" and "type-changed" items are never auto-suggested a fix — only "moved" items get a one-click suggestion, per the resolver's own classification.
- [ ] The review can be closed once every item has one of the three dispositions; "left unresolved" is a valid disposition, not a blocker to closing.
- [ ] Accepting a suggestion or a manual pick rewrites exactly the targeted binding/target/series' stored address and snapshot, and nothing else.
- [ ] Leaving an item unresolved makes no change to its stored data, so ticket 03's live "needs review" status keeps showing for it afterward, wherever it's rendered.
- [ ] The Map itself still commits even when items are flagged — only the affected bindings are held, not the whole edit.
