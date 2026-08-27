# 08 — Persistent review indicator for anything left unresolved

**What to build:** A small, always-reachable indicator in app chrome that surfaces only while the active Profile has outstanding unresolved bindings, and reopens the same resolution UI at any time — not only in the moment right after a Map edit is saved. This is what keeps an item an Engineer deliberately deferred from being lost the moment the post-save review is closed.

**Blocked by:** 06, 07

**Status:** ready-for-agent

- [ ] A small warning indicator in app chrome is visible only when the active Profile has at least one unresolved item (per a fresh scan via ticket 06 + resolver via ticket 02), and shows nothing at all otherwise.
- [ ] Selecting the indicator opens the same resolution UI as ticket 07's post-save review — same three per-item actions, same bulk-accept — populated from a fresh scan, not a stale snapshot carried over from the last save.
- [ ] Resolving an item this way has the same effect as resolving it in the post-save review: it stops being flagged anywhere, on the next scan and in its own live status.
- [ ] Switching the active Profile updates the indicator to reflect that Profile's own outstanding items, not the previously active Profile's.
- [ ] The indicator and its list are Main-Window chrome, consistent with Daughter Windows carrying no Profile/Workspace management surfaces of their own.
