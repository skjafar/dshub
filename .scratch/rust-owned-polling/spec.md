# Rust-owned polling

**Status:** ready-for-agent

**Gated on issue 01.** The mechanism — one address-keyed poll task per subscribed address, running inside Tauri's async runtime rather than the browser — is unproven at the scale this feature needs (potentially dozens of concurrently-open widgets, not the handful of named plots it has precedent for). Nothing beyond the spike is built until issue 01 returns a verdict.

## Problem Statement

Every widget on screen today declares polling interest to `client/src/services/pollRegistry.ts`, a browser-side singleton that coalesces same-address reads into one request and arbitrates the fastest requested interval per address. This exists because the Device link is strictly request/response — a duplicate poll costs latency directly, not just bandwidth — and it works. But it only works *once*, in one JavaScript realm. Daughter Windows (ADR 0004) had to be built as dockview popouts sharing the Main Window's realm specifically because a second realm means a second `pollRegistry` instance, and two registries polling the same address issue two requests for it.

That constraint has a second-order cost that has already shipped two production bugs this session. Making dockview's popout mechanism satisfy its own same-origin check forced the Main Window off Tauri's own protocol onto a real `http://localhost:<port>` server (`tauri-plugin-localhost`), because Tauri's `tauri://` scheme can never pass that check on macOS/Linux. That server needed its own dynamically-granted IPC capability (missing a permission once silently broke every backend-pushed event) and a stable port (a fresh one every launch silently reset every setting, Profile and Workspace on every launch). Both are now fixed, but they are symptoms of the same root cause: the realm-sharing trick that Daughter Windows needed only exists to avoid duplicate polling.

## Solution

Move polling ownership into Rust entirely. Rust already proves the mechanism works in production for one case — `spawn_plot_task`/`active_plots` (`src-tauri/src/commands.rs:340-366`) is a reconnect-safe, per-name poll-loop-that-pushes-via-event, just keyed by plot-series name instead of device address. This generalizes that mechanism to every address any widget currently polls (register, parameter, sys register), reference-counted by subscriber so N widgets watching one address still costs one read, with Rust computing the fastest currently-requested interval per address the same way `pollRegistry.ts` does today.

Once no JavaScript realm independently decides polling cadence, a second realm is no longer disqualifying — this is the prerequisite for Daughter Windows to become real, independent OS windows (a separate, later effort) instead of a same-realm popout trick, and for the trip through the necessary localhost HTTP server it required.

## Implementation Decisions

**One task per actively-polled address, not one shared timer.** `pollRegistry.ts`'s single `setInterval` at the global-fastest-period, gating each address's actual dispatch against its own elapsed time, exists only to minimize browser timer count — a constraint Tokio doesn't have. A lightweight `tokio::time::interval` task per address, respawned only when that address's fastest requested interval changes, is simpler and closer to the existing `spawn_plot_task` precedent. This is a deliberate deviation from a literal "port `pollRegistry.ts` to Rust," not an oversight.

**Reuses the existing request queue and event contract.** Every subscription-driven read goes through `queue_request()` (`commands.rs:397-411`) exactly like a one-shot `read_register` call does today — same rate limiter, same one-request-in-flight serialization, same `response_matches` address correlation. No new event or payload type: `RegisterData`/`ParameterData` (`types.rs:48-64`) and the existing `registerUpdate`/`parameterUpdate`/`sysRegisterUpdate` events already carry exactly this shape; a subscription read just sets `emit_plot: false`.

**Subscriptions survive both explicit connect and automatic reconnect** — unlike `active_plots`, which is deliberately cleared on an explicit `connect_device`. A poll subscription models "a currently-mounted UI element wants this address," which has nothing to do with which physical device answers, and this reproduces what the frontend already does today: nothing in `pollRegistry.ts`/`DSHubContext.tsx` re-subscribes after calling `connectDevice()` — only component unmount clears a subscription.

**Plotting stays a separate, parallel mechanism.** `active_plots`/`plot_tasks`/`start_plotting` are not absorbed into the new registry. Plotting has a materially different lifecycle — a named time-series buffer with its own pause/clear/retention semantics and its own reconnect rule — and merging is a bigger, riskier change than generalizing the poll mechanism. This leaves one known, pre-existing, explicitly-deferred gap: a Register Pane and a Plot of the same address still issue two independent reads when both are open, exactly as they do today.

**The frontend becomes a thin RPC client, not a shim.** `pollRegistry.ts` is deleted outright, not reduced to a wrapper — once Rust coalesces per address, N widgets subscribing to one address is just N entries in Rust's subscriber list; there is no remaining browser-side job. `useAutoRefresh`/`usePolledTargets`/`useAutoRefreshMulti` call new `subscribeAddress`/`unsubscribeAddress` port methods directly.

**One-shot polls outside the registry get root-caused, not ported.** The 500ms `setTimeout` in `DSHubContext.tsx` that re-reads control state sooner than the heartbeat's own first tick exists only because `spawn_heartbeat` deliberately skips its first tick. Deleting that skip (one line) makes the heartbeat answer immediately on connect, and the `setTimeout` is deleted with nothing to replace it.

## Testing Decisions

**Rust: the coalescing guarantee's new home.** `pollRegistry.test.ts`'s strongest assertion today — one read per address regardless of subscriber count — moves to Rust as a pure, unit-testable function (`fastest_interval(subscribers) -> Option<u64>`, plus the subscribe/unsubscribe list mutations), the same way `communicator.rs`'s `response_matches`/`status_ok` are pure functions with dedicated tests even though they're called from inside untested async loops.

**A real, stated coverage gap.** Once coalescing is server-side, no Vitest test can prove it anymore — Vitest never talks to a real Tauri runtime. The frontend-side replacement is the weaker claim that the hook calls `subscribeAddress` once per mount and `unsubscribeAddress` once per unmount, against `fakeBackendPort`, with the same async-registration-race guard `DSHubContext.tsx`'s own listener registration needed (ADR 0003's second amendment) — a fast mount/unmount, including React StrictMode's double-invoke, must not leak a subscription.

**Cannot be unit tested.** Async task-spawn and reconnect-resume behavior is verified by hand against the Python emulator (`emulator/dshub_emulator.py`): open several concurrent subscriptions at mixed intervals, confirm exactly one request in flight on the wire at a time, force a disconnect/reconnect and confirm every subscription resumes with no manual re-subscribe. This is issue 01's job.

**Regression.** `DSHubContext.listeners.test.tsx` and `DSHubContext.lastDevice.test.tsx` must keep passing unchanged in intent.

## Out of Scope

Merging plotting into the new registry — recorded as a deferred, explicitly-named follow-up rather than silently decided either way. Any change to response correlation, request serialization, or the rate limiter — this is a coalescing-ownership move only. Per-address selective re-rendering in the frontend (today, every widget re-renders on every incoming value regardless of address, via one monolithic `DSHubContext` state object) — a real, related gap, but a separable one; noted as a natural near-term follow-up, not required here.

## Further Notes

This reopens ADR 0003's freeze on the device data path — an amendment (a fifth entry, same voice as its existing four) lands alongside this feature, naming exactly what changes (poll-coalescing ownership) and what doesn't (response correlation, request serialization, the rate limiter).

This is the direct prerequisite for making Daughter Windows real, independent Tauri windows instead of a same-realm dockview popout, and for removing the localhost HTTP server that mechanism required — that is a separate, later effort (`.scratch/daughter-windows-native/`), gated on this one shipping first.
