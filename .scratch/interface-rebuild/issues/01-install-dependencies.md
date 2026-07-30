# 01 — Install dependencies and add the new stack beside the old

**What to build:** A working development environment. Nothing currently builds, tests or runs, because the client dependency tree is absent. This ticket restores it and adds the rebuild's new libraries alongside the existing ones without removing anything, so that the application still launches and behaves exactly as it does today. This is the expand step of expand–contract: the old component library, charting stack and styling runtime all stay installed until the final contract ticket, because they are still imported by dozens of surfaces and removing them early would leave nothing runnable to judge.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Dependencies install cleanly and the build, typecheck, lint and test commands all pass
- [ ] The dock engine, headless primitives, icon set and plotting engine are added as dependencies
- [ ] The existing component library, icon set, styling runtime, charting stack and date adapter remain installed and untouched
- [ ] The application launches and behaves identically to before, verified against the Device emulator
- [ ] No new library is imported by any source file yet
