# The device data path is out of scope for the interface rebuild

The 2026 interface rebuild replaces the view layer and the design system outright, but stops at a deliberate line. `services/pollRegistry.ts`, the device half of `DSHubContext`, `maps/`, and the pure utilities — number formatting, float conversion, thumbwheel arithmetic, the map/header/SYS_COMMAND file generators, the PDF exporter — are not rewritten. They encode correctness that a visual review cannot catch, and they hold nearly all of the project's test coverage.

Two invariants in particular must survive any future refactor. The Rust communicator correlates each response to its request by address; without that, a single timed-out request shifts every later value onto the wrong register permanently. And `pollRegistry` coalesces every periodic read, so widgets and panes declare interest rather than polling — the link is strictly request/response, so a duplicate poll costs latency directly.

## Amendment — the device port extraction is permitted

Introducing a single injected device port required editing frozen code, because every call to the Rust backend originates inside the frozen half of the application context. The edit is permitted, and is strictly mechanical: each direct transport call becomes a call on the injected port, with no change to sequencing, correlation, error handling or state updates. A change to any of those is not covered by this amendment.

The port is the rebuild's single test seam, and it follows the pattern the codebase already chose — the poll registry takes an injected reader rather than having its transport mocked. The same fake implementation serves the tests and browser development, so what the interface is built against and what it is verified against cannot drift apart.

## Consequences

The presentation semantics that happened to live outside `components/` are *in* scope, despite sitting in the same directories as frozen code: the widget config schema in `types/dashboard.ts`, the `UserSettings` shape, the canned CNC dashboard, and the widget icon map. The boundary is what the code means, not where it sits.

Existing user data is treated asymmetrically. Profiles — hand-built maps, per-entry descriptions and units, SYS_COMMAND catalogues — are irreplaceable and carry across untouched; they already have a portable versioned file format (`DSHUB_PROFILE_VERSION`). Dashboards, layouts and preferences reset, because the new UI earns fresh defaults and the settings blob never had a schema version to migrate from.

All sixteen widget types survive by name and capability, restyled rather than consolidated, so dashboards map type-for-type. The duplication those sixteen carry — each re-implementing address binding, formatting and thresholds — is factored into shared config primitives behind them instead of being resolved by reducing the vocabulary.
