# 08 — Persistent review indicator for anything left unresolved

**What to build:** A small, always-reachable indicator in app chrome that surfaces only while the active Profile has outstanding unresolved bindings, and reopens the same resolution UI at any time — not only in the moment right after a Map edit is saved. This is what keeps an item an Engineer deliberately deferred from being lost the moment the post-save review is closed.

**Blocked by:** 06, 07

**Status:** ready-for-agent

- [x] A small warning indicator in app chrome is visible only when the active Profile has at least one unresolved item (per a fresh scan via ticket 06 + resolver via ticket 02), and shows nothing at all otherwise.
- [x] Selecting the indicator opens the same resolution UI as ticket 07's post-save review — same three per-item actions, same bulk-accept — populated from a fresh scan, not a stale snapshot carried over from the last save.
- [x] Resolving an item this way has the same effect as resolving it in the post-save review: it stops being flagged anywhere, on the next scan and in its own live status.
- [x] Switching the active Profile updates the indicator to reflect that Profile's own outstanding items, not the previously active Profile's.
- [x] The indicator and its list are Main-Window chrome, consistent with Daughter Windows carrying no Profile/Workspace management surfaces of their own.

## Comments

**Resolved.** `AppChrome.tsx` gained a "Needs review" button, shown only
while `unresolvedBindingCount > 0` (no indicator at all otherwise, per
spec.md's own "adds no clutter to a Profile that's in good shape" line),
carrying the same numeric-badge idiom the Daughter Windows/unread-log
buttons already use. `AppShell.tsx` computes the count from
`bindingsNeedingReview` recomputed via a `useMemo` reactive to live
`settings`/`useMapEntries` state — a genuine fresh scan on every relevant
change, not a snapshot carried over from the last save — and the same
value backs both the indicator's count and `BindingReviewDialog.tsx`'s own
content whether it was opened by the indicator or by issue 07's
post-save auto-open. Switching Profile updates the count for free, since
it's derived from the active Profile's own `dashboardsByProfile`/
`workspacesByProfile` entries. Main-Window-only by construction: the
indicator lives in `AppChrome.tsx`, never in `DaughterWindowChrome.tsx`.
Hand-verified against a real dev-server build via Playwright: the
indicator appeared the instant a Map edit produced a flagged item, showed
the correct count, and disappeared the instant the one flagged item was
resolved via the review dialog.
