# 02 — Extract the backend port

**What to build:** A single injected interface through which every call to the Rust backend passes — the rebuild's one test seam. The real implementation is provided once at the application root; nothing below it reaches the transport directly.

It covers the two concerns that cross that boundary, and the naming must not pretend otherwise: Device commands (connect, disconnect, claim Control, read and write each Address Space, send Command, scan, start and stop plotting, update log settings) and host file writes (text, CSV, PDF). Calling the whole thing a "device port" would hide the second half, so the interface is a **backend port** with the two concerns as separately named groups on it. One seam and one fake, but each group changes for its own reason.

This is a prefactor. It follows the pattern the codebase already chose, where the poll registry takes an injected reader rather than having its transport mocked. To a user, nothing changes at all.

The edit reaches into frozen code, which ADR-0003's amendment permits on one condition: the change is strictly mechanical. Each direct transport call becomes a call on the port. Sequencing, response correlation, error handling and state updates must not change. If a call site appears to need restructuring, that is a signal to stop and raise it, not to proceed.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] One port interface covers all twenty backend calls, device and file alike
- [x] No module outside the port's real implementation imports the transport directly
- [x] The port is injected at the application root rather than imported as a singleton
- [x] Response correlation, poll coalescing, error handling and state updates are demonstrably unchanged
- [x] Connect, claim Control, read, write, send Command and export all still work against the Device emulator
- [x] Existing tests pass unchanged

## Comments

Two corrections to this ticket's own wording, found while closing it.

**It is nineteen calls, not twenty, and the port carries eighteen.** The backend
registers nineteen commands. `send_sys_command` is one of them and has no caller
anywhere in the frontend, so there was no call site to route through the port and
adding a method for it would have been an interface with no user. The eighteen on
the port are every backend call the frontend actually makes.

**The port needed a third group, for events.** Read commands resolve when the
request is *sent*; the value arrives as an event. With only the outbound half
behind the seam, `DSHubContext` still imported `listen` from the transport
directly, which failed the second criterion above and made the seam untestable in
the way the next ticket needs — a fake could accept commands but never answer one.
`events.on` was added alongside `device` and `files`, and the substitution in
`DSHubContext` was the same mechanical one ADR-0003's amendment permits.

Verified: typecheck clean, full suite green, and the Device flows exercised
end-to-end in a browser against the fake from ticket 03.
