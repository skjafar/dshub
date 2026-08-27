# 04 — Plot polling resolves by name, not stored address

**What to build:** A Plot series' actual device poll reads from the address currently matching its bound name, rather than whatever address was recorded when the series was first added. This closes an existing mismatch — independent of the rest of this effort — where a Plot's live poll and its decode/label logic could already disagree after any address shift, since decoding already resolves by name while polling did not.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] Starting a Plot series' device subscription resolves the address to poll from the series' bound name against the currently active Map at that moment, not the address stored on the series.
- [x] Restarting/re-establishing a subscription (e.g. after a pause, a poll-interval change, or a Map change) re-resolves the address the same way rather than reusing a previously resolved value.
- [x] Reordering an entry (address changes, name unchanged) and continuing an existing Plot series for it results in the series reading the correct, current register.
- [x] Existing decode-by-name behavior, and existing polling ownership/dedup keyed by series name, are unaffected.
- [x] If the bound name no longer exists in the current Map, the series does not silently poll a stale or wrong address — it stops, consistent with ticket 03's "needs review" pause once that ships.

## Comments

**Resolved**, with one confirmed scope note. `PlotPane.tsx`'s claim effect
now resolves each series' current address by *name* against the live Map
(`entries.find(candidate => candidate.name === series.name)`) rather than
reusing `series.address`, exactly as this ticket asks. In the final,
combined system (this ticket plus issue 03, implemented together), a
reorder that changes only the address still classifies as "moved" via
`isBindingDrifted` and pauses the series pending review, rather than
silently continuing to poll at the new address — issue 03's safety-first
design (any drift, even a confidently-fixable "moved" case, needs explicit
review before being trusted again) takes precedence over this ticket's own
"continues... reading the correct register" framing, which described the
behavior in isolation, before issue 03's stricter rule existed to compose
with. What this ticket contributes permanently, independent of 03: a series
with *no* captured snapshot (never bound under the new code, or backfilled
to `null`) skips the resolver entirely and still resolves its poll address
by name rather than a stale stored one — the actual poll/decode mismatch
this ticket set out to close. Regression-tested in
`__tests__/PlotPane.test.tsx` ("binding drift" describe block): a pure
reorder pauses and flags the series; a deleted name pauses and flags it;
a no-snapshot series correctly follows a reorder by name.
