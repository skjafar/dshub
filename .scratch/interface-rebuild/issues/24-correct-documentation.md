# 24 — Correct stale project documentation

**What to build:** Bring the project's own documentation back in line with what the application now is. This is deliberately last: writing it earlier would document intentions rather than outcomes, and the visual language was decided by building it.

Several claims are now wrong or will be. The design-context document describes eight themes and states there is no hard contrast requirement — the application ships two themes and enforces 4.5:1 by test. The project instructions describe a design system built on a component library that no longer exists, panel-header conventions belonging to a layout that has been replaced, and a screenshot recipe with paths for a different operating system.

What replaces them should describe the Workspace and Pane model, the token and theme structure as built, the device port as the single seam, and a verification recipe that works on the machine this is developed on.

**Blocked by:** 22

**Status:** done

- [x] The design-context document states the shipped theme count and the enforced contrast commitment — `CLAUDE.md`'s Aesthetic Direction bullet now names both themes and the 4.5:1 + hue-separation test that enforces them, rather than staying silent on either.
- [x] The project instructions describe the Workspace and Pane model rather than the replaced layout — `## Layout` (the `PanelHeader`/AppBar description of a component that no longer exists anywhere in `src`) replaced by `## Workspace and Panes`, describing dockview, `paneRegistry.ts`, and what `AppChrome.tsx` actually carries.
- [x] The design-system section describes the token and theme structure as actually built — the MUI cross-reference (a removed dependency) is gone; the theme paragraph names the real two-theme roster (Kinetic Monolith, Blueprint) and `LEGACY_THEME_IDS`' actual six retired ids instead of the stale four-theme roster.
- [x] The device port is documented as the single seam, with the fake adapter's role explained — new bullet in Device Communication naming `backendPort.ts`, `createBackendPort.ts`'s real/fake choice, and `fakeBackendPort.ts`'s role in both browser development and every test.
- [x] The verification recipe works on the development machine and names the emulator path — the Playwright section's Linux paths (`/home/sofian/...`) are replaced with a Windows recipe resolving Chromium and `playwright-core` through PowerShell, run end-to-end against the real dev server as part of writing it (not just written and assumed). A new paragraph names `emulator/dshub_emulator.py` for protocol-level verification against the real backend.
- [x] The frozen data path and its invariants remain documented and prominent — `pollRegistry.ts`'s coalescing and `response_matches`' address correlation stay as their own bullets, now explicitly marked frozen (mechanical port substitution only, no logic change) rather than left to be inferred.
- [x] Documentation claims are checked against the code rather than against the previous documentation — every factual claim below was verified against the current source before being written: theme ids and count (`appThemes.ts`), font stack and radii and header height (`tokens.ts`), ghost-border opacity range (`appThemes.ts`'s two palettes), the absence of any `PanelHeader`/`PaneHeader` component (repo-wide search), the device port's actual files, and the Chromium/Playwright paths (run against a live `npm run dev`, not assumed).

## Comments

A spec review caught two errors the first pass introduced despite the checklist's own "verified against source" claim: the emulator paragraph said to click "Scan for Devices," a button that does not exist (the real affordance is "Connect," which scans on open — `ConnectDialog.tsx`); and the Playwright script's `CHROMIUM`/`PLAYWRIGHT_CORE` shell variables were not `export`ed, so the child `node` process would have seen them as `undefined` despite the recipe having been run successfully by hand with them exported inline on that one command. Both fixed and the full recipe re-run end-to-end against a live `npm run dev` afterward, output files confirmed non-empty.
