# 04 — Plot polling resolves by name, not stored address

**What to build:** A Plot series' actual device poll reads from the address currently matching its bound name, rather than whatever address was recorded when the series was first added. This closes an existing mismatch — independent of the rest of this effort — where a Plot's live poll and its decode/label logic could already disagree after any address shift, since decoding already resolves by name while polling did not.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Starting a Plot series' device subscription resolves the address to poll from the series' bound name against the currently active Map at that moment, not the address stored on the series.
- [ ] Restarting/re-establishing a subscription (e.g. after a pause, a poll-interval change, or a Map change) re-resolves the address the same way rather than reusing a previously resolved value.
- [ ] Reordering an entry (address changes, name unchanged) and continuing an existing Plot series for it results in the series reading the correct, current register.
- [ ] Existing decode-by-name behavior, and existing polling ownership/dedup keyed by series name, are unaffected.
- [ ] If the bound name no longer exists in the current Map, the series does not silently poll a stale or wrong address — it stops, consistent with ticket 03's "needs review" pause once that ships.
