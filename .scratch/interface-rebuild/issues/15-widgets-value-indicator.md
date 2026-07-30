# 15 — Widgets: Value and Indicator families

**What to build:** Seven Widget kinds restyled onto the new design language and the shared configuration surface — the four that display a number (value readout, gauge, progress bar, encoder display) and the three that display a state (LED indicator, state LED, status matrix).

All seven survive by name and capability. They are not consolidated into fewer kinds with variants; that was considered and declined, so an Operator's existing panel maps kind for kind. What changes is that they stop re-implementing binding, formatting and thresholds, and draw those from the shared surface instead.

The indicator kinds are where status semantics matter most. Condition is carried by colour, which is identical across every theme of a given mode. Icon weight may encode active versus idle, but must never encode severity — that vocabulary belongs to colour alone.

**Blocked by:** 14

**Status:** ready-for-agent

- [ ] Value readout, gauge, progress bar and encoder display all render and update from their bound address
- [ ] LED indicator, state LED and status matrix all render state from their bound address
- [ ] All seven configure through the shared surface with no duplicated binding or formatting logic
- [ ] Condition is carried by colour through status semantics; icon weight never encodes severity
- [ ] Each scales legibly across the range of grid sizes it can be given
- [ ] Each shows a plain stale state when its Device data stops arriving
