# 17 — Widgets: composite family

**What to build:** The five Widget kinds that show more than a single bound value — data table, alarm list, device info, container, and mini-plot — restyled onto the new design language and the shared configuration surface.

The data table displays many entries at once and includes writable cells, so it inherits the write-path contracts in full; this is the surface the existing write-cell regression test was written against, and that behaviour must survive the rebuild intact. The mini-plot uses the same plotting engine as the Plot Pane, which is why this batch waits on that work. The container groups other Widgets, so it must handle nesting and resizing without corrupting the layout of what it holds.

**Blocked by:** 14, 12

**Status:** ready-for-agent

- [ ] Data table renders many entries with per-cell reads and writes
- [ ] Data table write cells satisfy the write-path contracts, including the mid-edit overwrite case
- [ ] Alarm list renders active conditions through status semantics
- [ ] Device info reports Device identity and health fields
- [ ] Container groups Widgets and survives nesting and resizing without corrupting their layout
- [ ] Mini-plot renders on the same plotting engine as the Plot Pane
- [ ] All five configure through the shared surface and show a plain stale state
