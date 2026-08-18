# 03 — Single-address widgets poll via Rust, with reconnect-resume

**What to build:** any widget bound to a single register, parameter or system-register address gets its live value from a Rust-owned poll subscription instead of the browser-side poll registry, and keeps updating correctly across a reconnect with no user action.

**Blocked by:** None — issue 01's scale spike already de-risked the mechanism (pass recorded)

**Status:** ready-for-agent

- [ ] Opening a widget bound to an address starts it updating at its configured interval, sourced from a new Rust-side per-address subscription mechanism
- [ ] Multiple widgets bound to the same address still produce exactly one read per tick — coalescing happens address-side, not per-subscriber
- [ ] The fastest currently-requested interval among an address's live subscribers governs how often it's actually read, and changes correctly as subscribers come and go
- [ ] A subscription floor of 50ms is enforced, matching the browser-side registry's existing floor
- [ ] A brand-new subscription reads its address immediately rather than waiting for the first natural tick
- [ ] Closing every widget bound to an address stops reads for it — no leaked polling
- [ ] A subscription survives both an explicit reconnect and an automatic reconnect with no manual re-subscribe from the frontend
- [ ] The interval-arbitration logic (fastest interval across current subscribers) is unit tested in isolation, independent of any live transport
- [ ] The fake backend port used in browser-only dev/test mirrors the same subscribe/unsubscribe contract, including resuming subscriptions across a simulated reconnect

## Comments

The subscriber model, for reference (from the approved design, not a literal implementation requirement):

```rust
enum DataSource { Register, Parameter, SysRegister }
struct AddressKey { source: DataSource, address: u16 }
```

One subscriber list per `AddressKey`, one poll task per address, respawned when that address's fastest requested interval changes. Reuses the existing request queue and event contract end to end — no new event or payload type, same rate limiter, same one-request-in-flight serialization a subscription-driven read already has to respect.

Subscriptions should survive an *explicit* reconnect (not just an automatic one) — this reproduces what the browser-side registry already does today (nothing re-subscribes after a fresh connect; only unmount clears interest), so this is intentionally different from how plotting's existing task registry behaves.
