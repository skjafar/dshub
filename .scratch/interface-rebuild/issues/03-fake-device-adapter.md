# 03 — Fake device adapter and browser development mode

**What to build:** A fake implementation of the device port that serves believable data, so the whole interface can be developed, reviewed and screenshotted in a plain browser with no Tauri and no hardware. It answers discovery with a plausible Device, accepts Control, serves Register, Parameter and System Register values that move over time rather than sitting still, accepts writes and reflects them back, and produces plottable data at the requested interval.

The same fake is the one every behaviour test drives, so what the interface is built against and what it is verified against cannot drift apart. It must also be able to misbehave on demand — refuse Control, drop the link, return an entry as invalid — because those states need building and reviewing too.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Running the dev server and opening a browser shows the existing interface populated with fake Device data
- [ ] Values change over time so live-updating surfaces can be judged honestly
- [ ] Writes are accepted and reflected back in subsequent reads
- [ ] The fake can be told to refuse Control, drop the link, and return invalid entries
- [ ] The real port is still used when running inside the desktop application
- [ ] The fake is exported in a form the test suites can drive directly
