# 02 — Extract the device port

**What to build:** A single injected interface through which every call to the Rust backend passes — the rebuild's one test seam. It covers both concerns that currently cross that boundary: Device commands (connect, disconnect, claim Control, read and write each Address Space, send Command, scan, start and stop plotting, update log settings) and host file writes (text, CSV, PDF). The real implementation is provided once at the application root; nothing below it reaches the transport directly.

This is a prefactor. It follows the pattern the codebase already chose, where the poll registry takes an injected reader rather than having its transport mocked. To a user, nothing changes at all.

The edit reaches into frozen code, which ADR-0003's amendment permits on one condition: the change is strictly mechanical. Each direct transport call becomes a call on the port. Sequencing, response correlation, error handling and state updates must not change. If a call site appears to need restructuring, that is a signal to stop and raise it, not to proceed.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] One port interface covers all twenty backend calls, device and file alike
- [ ] No module outside the port's real implementation imports the transport directly
- [ ] The port is injected at the application root rather than imported as a singleton
- [ ] Response correlation, poll coalescing, error handling and state updates are demonstrably unchanged
- [ ] Connect, claim Control, read, write, send Command and export all still work against the Device emulator
- [ ] Existing tests pass unchanged
