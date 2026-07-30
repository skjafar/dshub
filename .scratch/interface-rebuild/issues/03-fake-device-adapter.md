# 03 — Fake device adapter and browser development mode

**What to build:** A fake implementation of the device port that serves believable data, so the whole interface can be developed, reviewed and screenshotted in a plain browser with no Tauri and no hardware. It answers discovery with a plausible Device, accepts Control, serves Register, Parameter and System Register values that move over time rather than sitting still, accepts writes and reflects them back, and produces plottable data at the requested interval.

The same fake is the one every behaviour test drives, so what the interface is built against and what it is verified against cannot drift apart. It must also be able to misbehave on demand — refuse Control, drop the link, return an entry as invalid — because those states need building and reviewing too.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] Running the dev server and opening a browser shows the existing interface populated with fake Device data
- [x] Values change over time so live-updating surfaces can be judged honestly
- [x] Writes are accepted and reflected back in subsequent reads
- [x] The fake can be told to refuse Control, drop the link, and return invalid entries
- [x] The real port is still used when running inside the desktop application
- [x] The fake is exported in a form the test suites can drive directly

## Comments

Driven end-to-end in a headless browser, not only under test: the Device is
discovered and listed, connect works, Control is claimed and shows as `TCP
Control`, the four System Registers populate and move (`COUNTER_1HZ` advanced
10 → 15 over five seconds), `invalidate` renders every entry as `Invalid`, and
`dropLink` puts the header into `Reconnecting…` with an offline status bar and a
logged error. No page errors throughout.

Three things that only the browser run could have caught:

- **One fake per session.** `StrictMode` invokes the factory twice, so a fake
  built per call left two Devices with independent value streams — and the fault
  switches on `window.dshubFaults` belonged to the one the interface was *not*
  listening to. `createBackendPort` now memoises the fake.
- **`DS_ERROR_COUNT` read the same as `DS_PACKET_COUNT`.** Both matched a
  "name ends in `_COUNT`" rule and showed 404 side by side, which reads as a board
  in permanent failure. Errors are now matched first and stay rare.
- **The fake has to encode float entries as IEEE-754 bits.** Float-typed entries
  travel as their bit pattern, so a plain small integer for a gain renders as
  ~1e-44. The CNC profile's parameters are almost all floats.

The fault switches are reachable from the browser console as
`window.dshubFaults`: `refuseControl(true)`, `dropLink()`, `invalidate(true)`.

Deliberately out of the criteria but implemented: the fake's `files` group hands
exports to the browser as real downloads. A save that reported success and wrote
nothing would have been exactly the drift this ticket exists to prevent.
