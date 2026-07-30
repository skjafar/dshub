# 16 — Widgets: Control family

**What to build:** The four Widget kinds that write to the Device — button, dropdown, directional control, and value write — restyled onto the new design language and the shared configuration surface.

These are the Widgets an Operator touches while equipment is running, so they inherit the write path's guarantees rather than reimplementing them: a typed value is written exactly as typed, a live update cannot overwrite an in-progress edit, and keyboard and pointer commit paths produce identical writes. A Widget bound to a Command sends it; a Widget bound to an address writes to it. Both report rejection plainly.

Directional control is the most involved of the four, driving repeated writes while held, and needs to stop cleanly when released, when focus is lost, and when the link drops.

**Blocked by:** 14

**Status:** ready-for-agent

- [ ] Button, dropdown, directional control and value write all commit to the Device through the port
- [ ] All four configure through the shared surface
- [ ] Value write inherits the write-path contracts, including both commit paths
- [ ] Directional control stops cleanly on release, on focus loss, and on link loss
- [ ] Each reports a rejected or failed write plainly rather than appearing to succeed
- [ ] Each is unavailable, with the reason visible, when Control is not held
- [ ] Each is fully operable by keyboard
