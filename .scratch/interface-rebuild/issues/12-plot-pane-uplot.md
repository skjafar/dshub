# 12 — Plot Pane on the new plotting engine

**What to build:** Live plotting rebuilt on the new engine, driven imperatively so plot updates bypass the render cycle on fast ticks. This is the most performance-sensitive surface in the application: poll intervals as low as 50 ms against series retaining tens of thousands of points, and it must stay responsive across a long capture rather than degrading as history accumulates.

An Engineer sets poll interval and time span per Plot to trade resolution against history, pauses and resumes to examine a trace without it moving underneath them, and exports the data to a file for analysis elsewhere. Several Plot Panes can be open at once, each plotting different signals.

Series colour comes from the data palette by slot rather than by fixed value, so series identity survives a theme switch while lightness adapts. Chart chrome — grid, axes, labels — follows the theme through the token bridge rather than being pinned.

**Blocked by:** 06

**Status:** ready-for-agent

- [x] A Plot Pane renders live series from the Device and stays responsive at tens of thousands of retained points
- [x] Poll interval and time span are configurable per Plot
- [x] Pause and resume work without losing retained history
- [x] Plot data exports to a file through the port
- [x] Several Plot Panes can be open at once, each with independent series and settings
- [x] Series colour is stored as a palette slot so identity survives a theme switch
- [x] Chart chrome follows the active theme rather than snapping to fixed values

## Comments

**Acquisition lives in `plotStream.ts`, decoupled from any Plot Pane's own component.** dockview detaches a Pane whose tab is not the visible one in its group — `paneRegistry.ts`'s own docblock already flags this — which unmounts its React tree for reasons that have nothing to do with the user's intent. Retained points held in component state would be discarded on every backgrounding. `plotStream` instead owns the single port subscription, the retained buffers (capped at 20k points/series, matching the existing `plotDefaults.maxDataPoints`), and start/stop calls to the Device, all keyed by series name and independent of whether any Pane's component is currently mounted. `PlotPane` and `PlotChart` only ever read it.

**A series is claimed by exactly one Pane at a time.** Not asked for explicitly, but required by the backend's own shape: `startPlotting`/`stopPlotting` are keyed by name alone, with no notion of which Pane asked — two Panes plotting the same name would fight over the poll interval, and closing either one would silently cut the other's data. `plotStream.claimSeries`/`releaseSeries` enforce exclusive ownership; a second Pane is told plainly ("already being plotted in another open Plot Pane") rather than left reading a trace that quietly stopped. Ownership is released only when a Pane actually closes (`retainSeriesFor`, wired into `AppShell.tsx`'s existing `syncOpenPanes`), not when it is merely backgrounded.

**The redraw tick is decoupled from both the Device's poll rate and React's render cycle.** `PlotChart` rebuilds its uPlot instance only on structural change (which series, their colours, the active theme) and otherwise redraws on a fixed 200 ms tick, skipping the data rebuild (`uPlot.join` across series) unless a buffer's length actually changed since the last tick. Windowing itself needs no manual trimming — uPlot ranges to whatever `setScale` window is requested regardless of how much extra retained history sits either side of it, so `plotStream`'s cap is a memory safety net rather than a view mechanism.

**Chart chrome reads `appThemes` directly, not MUI.** The new shell carries no MUI import (confirmed by grep before writing this), so series colour and axis/grid colour are resolved from `getThemeById(settings.colorThemeId)` rather than `useTheme()`. Axis tick text is set in the monospace face rather than the body face used everywhere else numeric — canvas text has no `tabular-nums`, so a true fixed-width face is the only way a changing tick does not jitter the axis width.

**Test infrastructure gap: `matchMedia`.** uPlot calls `matchMedia` unconditionally at module load (to track `devicePixelRatio`), so merely importing it — not only constructing a chart — threw in every existing test file that transitively imports `paneRegistry.ts`, once it started importing `PlotPane`. jsdom defines the property but not as a callable function, so the existing `!('x' in globalThis)` guard style used for `ResizeObserver` did not catch it; the new stub in `setupTests.ts` checks `typeof … !== 'function'` instead. `PlotPane.test.tsx` itself mocks `uplot` outright — canvas 2D drawing is not something this project's `canvas`-less jsdom setup can exercise, matching the existing carve-out for dock drag: genuinely visual behaviour is judged by hand in a real browser, not asserted in the suite.
