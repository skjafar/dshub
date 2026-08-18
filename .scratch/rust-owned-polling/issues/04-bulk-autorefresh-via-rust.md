# 04 — Bulk auto-refresh polls via Rust

**What to build:** toggling "auto-refresh" on the Registers or Parameters panel drives the same Rust-owned subscription mechanism (issue 03) for every address currently visible in that panel, not just individually-bound widgets.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Turning on bulk auto-refresh in the Registers or Parameters panel subscribes every visible address through the mechanism issue 03 built
- [ ] Changing which addresses are visible — filtering, scrolling, switching Profile — subscribes and unsubscribes correctly rather than leaking old subscriptions or missing newly-visible ones
- [ ] Turning bulk auto-refresh off unsubscribes everything it added
- [ ] Registering this interest doesn't require a live connection; reads only actually happen once one exists
