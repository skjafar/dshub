# 22 — Contract: delete the old view layer and drop its dependencies

**What to build:** The contract step of expand–contract. Every surface has now been rebuilt, so the old view layer is dead code and the libraries it depended on can go: the component library, its icon set, its styling runtime, the charting stack, the chart date adapter, and the date library that exists only for that adapter and is imported directly by nothing.

This ticket is mostly deletion, and its wide fan-in is real rather than conservative — a dependency can only be dropped once no importer remains, and each blocking ticket removes one class of importer.

The frozen data path is not touched. If deleting a view surface appears to require changing the poll registry, the device half of the application context, the Map modules or the pure utilities, stop: that is a signal something was missed upstream, not licence to edit frozen code.

**Blocked by:** 09, 10, 11, 13, 15, 16, 17, 18, 19, 20, 21

**Status:** done

- [x] The old panels, the old shell and the old theme module are deleted
- [x] The component library, its icon set, its styling runtime, the charting stack, the chart date adapter and the date library are removed as dependencies
- [x] No source file imports any removed library
- [x] The frozen data path is unchanged
- [x] Build, typecheck, lint and the full test suite pass
- [x] The application is verified end to end against the Device emulator, and in a browser against the fake adapter
