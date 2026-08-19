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

## Amendment — a Command's answer now crosses the boundary as data, not only as a log line

A fourth edit to frozen code is permitted, on the same grounds as the second and
third: a defect found, fixed in place, with nothing redesigned around it.

Ticket 11 (the Command Pane) carries the same requirement ticket 07 already
carried for writes — "the result of sending is reported plainly; a Command that
was rejected must never look like one that succeeded" — and inherits the same
confirmation pattern: send, then wait for the Device's own answer rather than
for the command resolving, since a write command resolves as soon as it is
*queued*. Before this amendment there was nothing to wait for. `process_response`
matched a Command's reply (`command == 0`, covering both the three library
SYS_COMMANDs and every Profile Command, which are both sent as type 0 with their
code in the address field) with a log line — `status` was read only to decide
what to print, never carried across the boundary as data. A caller could not
tell a `PERMISSION_ERROR` from a success without parsing a string meant for a
person to read.

The fix mirrors the write arms exactly: `commandResponse` is a new typed event,
`CommandResponse { command, value, status, valid, timestamp }`, and case `0` now
emits it — logging only on refusal, the same asymmetry cases `2` and `4` already
use, since a success is fully said by `valid: true` on the event and a second
line would be noise. `command` carries the *request's* address field, not the
response's: `response_matches` already established that SYS_COMMAND does not
echo a meaningful address, so the code identifying which Command this answers
has to come from what was sent, not from what the Device echoed back.

One side effect worth naming: case `0` covers both the three library
SYS_COMMANDs and every Profile Command — both travel as type `0`, with their
code in the address field — so the always-on info log a successful SYS_COMMAND
used to produce is gone for both, not only for the traffic this ticket added.
Nothing in the current interface reads that line for feedback (the legacy
`SysCommandPanel` it served is not mounted under the rebuilt shell), so this has
no live effect, but it is a behaviour change to shared code and not only to the
new Pane's own path.

Response correlation, sequencing, queueing and the rate limiter are untouched.
The change is one match arm; `status_ok` is the same function the write arms
already use and already carries its own tests.

`shell/panes/CommandPane.tsx` is the interface-side consequence: it waits for a
`commandResponse` bearing its own sent timestamp before reporting an outcome,
timing out and saying so if none arrives, exactly as `AddressSpacePane` does for
`registerUpdate`/`parameterUpdate`. It subscribes to the port directly rather
than through `DSHubContext` — the device half of the application context stays
untouched by this ticket, since the Pane needing the answer is reason enough to
read it at the boundary without adding a case to frozen reducer state for it.

## Amendment — poll coalescing moves from the browser to Rust

`.scratch/rust-owned-polling` is a separate initiative from the interface
rebuild, but it changes an invariant this ADR names directly, so the change is
recorded here rather than only in that effort's own tickets.

`services/pollRegistry.ts` — the frozen module this ADR's opening paragraph
named as holding "correctness a visual review cannot catch" — coalesced every
periodic read in the browser: one `setInterval` per distinct address, at the
fastest interval any subscriber asked for. That ownership has moved. Issue 03
gave the backend its own per-address subscription mechanism
(`src-tauri/src/poll.rs`), reached through the device port's
`subscribeAddress`/`unsubscribeAddress`; issue 04 moved bulk auto-refresh onto
the same mechanism; this ticket (issue 05) deleted `pollRegistry.ts` once
nothing remaining called it, `useAutoRefresh.ts`'s `usePolledTargets` now
being the one place a surface declares interest. `fakeBackendPort.ts` mirrors
`poll.rs`'s coalescing behaviour for browser development and tests, the same
role the fake port plays for every other device operation.

What did not move: response correlation (`response_matches`, matching each
reply to its request by address), request serialization (the link is still
strictly request/response, one in flight at a time), and the rate limiter.
Coalescing which reads get *issued* is a different concern from *how* an
issued read is sent and matched to its answer, and only the former changed
hands.

## Consequences

The presentation semantics that happened to live outside `components/` are *in* scope, despite sitting in the same directories as frozen code: the widget config schema in `types/dashboard.ts`, the `UserSettings` shape, the canned CNC dashboard, and the widget icon map. The boundary is what the code means, not where it sits.

Existing user data is treated asymmetrically. Profiles — hand-built maps, per-entry descriptions and units, SYS_COMMAND catalogues — are irreplaceable and carry across untouched; they already have a portable versioned file format (`DSHUB_PROFILE_VERSION`). Dashboards, layouts and preferences reset, because the new UI earns fresh defaults and the settings blob never had a schema version to migrate from.

All sixteen widget types survive by name and capability, restyled rather than consolidated, so dashboards map type-for-type. The duplication those sixteen carry — each re-implementing address binding, formatting and thresholds — is factored into shared config primitives behind them instead of being resolved by reducing the vocabulary.
