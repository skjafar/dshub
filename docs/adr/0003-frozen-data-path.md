# The device data path is out of scope for the interface rebuild

The 2026 interface rebuild replaces the view layer and the design system outright, but stops at a deliberate line. `services/pollRegistry.ts`, the device half of `DSHubContext`, `maps/`, and the pure utilities — number formatting, float conversion, thumbwheel arithmetic, the map/header/SYS_COMMAND file generators, the PDF exporter — are not rewritten. They encode correctness that a visual review cannot catch, and they hold nearly all of the project's test coverage.

Two invariants in particular must survive any future refactor. The Rust communicator correlates each response to its request by address; without that, a single timed-out request shifts every later value onto the wrong register permanently. And `pollRegistry` coalesces every periodic read, so widgets and panes declare interest rather than polling — the link is strictly request/response, so a duplicate poll costs latency directly.

## Amendment — the device port extraction is permitted

Introducing a single injected device port required editing frozen code, because every call to the Rust backend originates inside the frozen half of the application context. The edit is permitted, and is strictly mechanical: each direct transport call becomes a call on the injected port, with no change to sequencing, correlation, error handling or state updates. A change to any of those is not covered by this amendment.

The port is the rebuild's single test seam, and it follows the pattern the codebase already chose — the poll registry takes an injected reader rather than having its transport mocked. The same fake implementation serves the tests and browser development, so what the interface is built against and what it is verified against cannot drift apart.

## Amendment — the listener registration race is fixed

A second edit to frozen code is permitted, and it is not mechanical: the event
listeners in `DSHubContext` are registered asynchronously while the effect's
cleanup is synchronous, so a cleanup running before registration completed had
nothing to remove and left the completed registration in place. Two live handler
sets meant every device event was dispatched twice — each discovery, connection
and register read logged twice, and every reducer run twice per response.

This was fixed rather than tolerated because "the data path is frozen" is a
statement about not *redesigning* it, not about leaving a defect in it once
found. The change is contained: a flag that makes a late registration undo
itself, and a ref so the session-started entry is logged once per session rather
than once per effect run. Sequencing, response correlation, poll coalescing,
error handling and every reducer are untouched.

It surfaced in development, because React's StrictMode double-invokes effects
only there. The race itself is not development-only — it is what happens whenever
an effect is cleaned up before its async setup resolves — so the fix is not a
development-only workaround either.
`contexts/__tests__/DSHubContext.listeners.test.tsx` pins it, counting
subscriptions at the port because an unmounted tree renders nothing whether or
not its handlers are still live.

## Amendment — refused writes are no longer reported as successful ones

A third edit to frozen code is permitted, on the same grounds as the second: a
defect found, fixed in place, with nothing redesigned around it.

`process_response` parsed the response status and then discarded it for register
and parameter writes, emitting `registerUpdate`/`parameterUpdate` with
`valid: true` whatever the board answered. A write the Device refused —
`PERMISSION_ERROR` when Control is held elsewhere, or `ERROR` for a value the
firmware will not take — was reported to the interface as a completed write. The
board then held a different value than the screen said it did, and nothing
anywhere said so.

This is precisely the failure ticket 07 exists to prevent, and it could not be
fixed above the boundary: the status never crossed it. The change is contained to
the two write arms — a status check, an error log, and `valid` carrying what the
board actually said. Note that success in this protocol is any non-negative code
(`WRITE_REG_OK` is 2, `WRITE_PARAM_OK` is 4, not 0); treating zero as the only
success would report every accepted write as refused.

Response correlation, sequencing, queueing and the rate limiter are untouched.
`communicator.rs`'s test module pins both halves of the status rule.

One consequence reaches the interface. A write command resolves as soon as the
request is *queued* — it cannot do otherwise, since responses arrive as events —
so a resolved write is not a completed one. Surfaces that report a write's
outcome must wait for the Device's answer rather than for the command, which is
what `shell/panes/AddressSpacePane.tsx` does — the one component behind the
Register, Parameter and System Register Panes (ticket 09).

## Consequences

The presentation semantics that happened to live outside `components/` are *in* scope, despite sitting in the same directories as frozen code: the widget config schema in `types/dashboard.ts`, the `UserSettings` shape, the canned CNC dashboard, and the widget icon map. The boundary is what the code means, not where it sits.

Existing user data is treated asymmetrically. Profiles — hand-built maps, per-entry descriptions and units, SYS_COMMAND catalogues — are irreplaceable and carry across untouched; they already have a portable versioned file format (`DSHUB_PROFILE_VERSION`). Dashboards, layouts and preferences reset, because the new UI earns fresh defaults and the settings blob never had a schema version to migrate from.

All sixteen widget types survive by name and capability, restyled rather than consolidated, so dashboards map type-for-type. The duplication those sixteen carry — each re-implementing address binding, formatting and thresholds — is factored into shared config primitives behind them instead of being resolved by reducing the vocabulary.
