# 03 — Single-address widgets poll via Rust, with reconnect-resume

**What to build:** any widget bound to a single register, parameter or system-register address gets its live value from a Rust-owned poll subscription instead of the browser-side poll registry, and keeps updating correctly across a reconnect with no user action.

**Blocked by:** None — issue 01's scale spike already de-risked the mechanism (pass recorded)

**Status:** ready-for-agent

- [x] Opening a widget bound to an address starts it updating at its configured interval, sourced from a new Rust-side per-address subscription mechanism
- [x] Multiple widgets bound to the same address still produce exactly one read per tick — coalescing happens address-side, not per-subscriber
- [x] The fastest currently-requested interval among an address's live subscribers governs how often it's actually read, and changes correctly as subscribers come and go
- [x] A subscription floor of 50ms is enforced, matching the browser-side registry's existing floor
- [x] A brand-new subscription reads its address immediately rather than waiting for the first natural tick
- [x] Closing every widget bound to an address stops reads for it — no leaked polling
- [x] A subscription survives both an explicit reconnect and an automatic reconnect with no manual re-subscribe from the frontend
- [x] The interval-arbitration logic (fastest interval across current subscribers) is unit tested in isolation, independent of any live transport
- [x] The fake backend port used in browser-only dev/test mirrors the same subscribe/unsubscribe contract, including resuming subscriptions across a simulated reconnect

## Comments

The subscriber model, for reference (from the approved design, not a literal implementation requirement):

```rust
enum DataSource { Register, Parameter, SysRegister }
struct AddressKey { source: DataSource, address: u16 }
```

One subscriber list per `AddressKey`, one poll task per address, respawned when that address's fastest requested interval changes. Reuses the existing request queue and event contract end to end — no new event or payload type, same rate limiter, same one-request-in-flight serialization a subscription-driven read already has to respect.

Subscriptions should survive an *explicit* reconnect (not just an automatic one) — this reproduces what the browser-side registry already does today (nothing re-subscribes after a fresh connect; only unmount clears interest), so this is intentionally different from how plotting's existing task registry behaves.

**Resolved.** `src-tauri/src/poll.rs` (new module): `PollSubscriptions` is pure subscriber
bookkeeping — subscribe/unsubscribe, `fastest_interval(subscriber_intervals) -> Option<u64>`,
per-`AddressKey` (source × address) subscriber lists — with no Tokio or Tauri dependency, so
the arbitration logic is unit tested in isolation (8 tests). `reschedule_address` spawns,
respawns or stops one `tokio::time::interval` task per address to match its current fastest
interval. Each tick calls `RateLimiter::acquire`/reads `LogFilter::request_rate_limit` before
sending — the same rate limiter and request queue every one-shot command goes through
(`queue_request`), per the spec, rather than `spawn_plot_task`'s bypass of it. `AppState` gained `poll_subscriptions`
(survives every connect/disconnect/reconnect — only `unsubscribe_address` removes an entry,
unlike `active_plots`) and `poll_tasks` (live handles, aborted on disconnect, respawned by
`resume_poll_subscriptions` from `connect_device` and both branches of `reconnect_loop`,
mirroring `resume_active_plots`). Two new commands, `subscribe_address`/`unsubscribe_address`,
registered in `lib.rs`.

Frontend: `usePolledTargets` (`hooks/useAutoRefresh.ts`) now calls
`port.device.subscribeAddress`/`unsubscribeAddress` directly instead of `pollRegistry`, guarded
against the same async-registration-race `DSHubContext.tsx`'s event listeners already needed
(ADR 0003's second amendment) — a fast mount/unmount, including StrictMode's double-invoke,
does not leak a subscription (pinned in the new `hooks/__tests__/useAutoRefresh.test.tsx`).
`useAutoRefresh` now delegates to `usePolledTargets` instead of subscribing a second way.
`backendPort.ts`/`tauriBackendPort.ts` gained the two methods; `fakeBackendPort.ts` gained its
own `AddressSubscriptions` — a from-scratch mirror of `poll.rs`'s contract (deliberately not a
wrapper around `PollRegistry`, since `pollRegistry.ts` is on its way out in issue 05) — covered
by 7 new cases in `fakeBackendPort.test.ts` (coalescing, fastest-interval-wins, floor,
cross-source distinctness, double-unsubscribe safety, resume-after-drop).

`pollRegistry.ts` itself, and `DSHubContext.tsx`'s bulk auto-refresh path for the
Registers/Parameters panels, are untouched — out of this ticket's scope (issues 04/05).

Not exercised here, same as issue 01's own spike: live task-spawn/reconnect behaviour against
real hardware or the emulator through `cargo tauri dev`, which needs a human at the native
window Playwright cannot drive. Full Rust suite (19/19), full frontend suite (718 tests, 59
files), typecheck, lint and build are all clean.
