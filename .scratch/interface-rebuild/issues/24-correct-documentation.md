# 24 — Correct stale project documentation

**What to build:** Bring the project's own documentation back in line with what the application now is. This is deliberately last: writing it earlier would document intentions rather than outcomes, and the visual language was decided by building it.

Several claims are now wrong or will be. The design-context document describes eight themes and states there is no hard contrast requirement — the application ships two themes and enforces 4.5:1 by test. The project instructions describe a design system built on a component library that no longer exists, panel-header conventions belonging to a layout that has been replaced, and a screenshot recipe with paths for a different operating system.

What replaces them should describe the Workspace and Pane model, the token and theme structure as built, the device port as the single seam, and a verification recipe that works on the machine this is developed on.

**Blocked by:** 22

**Status:** ready-for-agent

- [ ] The design-context document states the shipped theme count and the enforced contrast commitment
- [ ] The project instructions describe the Workspace and Pane model rather than the replaced layout
- [ ] The design-system section describes the token and theme structure as actually built
- [ ] The device port is documented as the single seam, with the fake adapter's role explained
- [ ] The verification recipe works on the development machine and names the emulator path
- [ ] The frozen data path and its invariants remain documented and prominent
- [ ] Documentation claims are checked against the code rather than against the previous documentation
