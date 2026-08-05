# 13 — Cursor sync across Plot Panes

**What to build:** One crosshair, readable across every open Plot. Moving the cursor in one Plot Pane shows the same instant in all the others, so an Engineer correlating several signals during a single motion event reads them at one moment in time rather than eyeballing across separate charts.

This is the capability that makes several Plot Panes in a Workspace feel like one instrument rather than three separate charts, and it was a stated reason for choosing the plotting engine — treat it as a requirement, not an enhancement.

Plots showing different time spans must still align meaningfully, or must say plainly that they cannot.

**Blocked by:** 12

**Status:** ready-for-agent

- [x] Moving the cursor in one Plot Pane positions it at the same instant in every other open Plot
- [x] Each Plot reports its own series values at the shared cursor position
- [x] Plots with different time spans either align correctly or indicate that they do not overlap
- [x] Sync survives opening and closing Plot Panes during a session
- [x] Paused and running Plots behave predictably together under a shared cursor

## Comments

**Cursor sync rides uPlot's own `cursor.sync`, narrowed to position only.** Every Plot's chart is constructed with the same process-wide sync key (`CURSOR_SYNC_KEY` in `PlotChart.tsx`); uPlot subscribes on construct and unsubscribes on `destroy()`, so opening or closing a Plot Pane needs no bookkeeping of its own. `sync.scales: ['x', null]` makes the sync value-based rather than percentage-based, which is what lets two Plots with different time spans still land on the same instant. `filters.sub` restricts what a synced *echo* can drive on a chart to the crosshair alone — without it, uPlot's sync group also carries mousedown/mouseup/dblclick, which would mirror a drag-zoom or double-click reset from one Plot onto every other one's independently configured time span.

**"Say plainly they don't overlap" is a real code path, not just a hidden cursor.** uPlot clamps `idx` to the nearest in-range point rather than reporting nothing when a synced instant falls outside a chart's own window, which would otherwise show a stale boundary reading as if it were the shared instant. `updateTooltip` in `PlotChart.tsx` detects the overflow from `cursor.left` (the one place the true, unclamped position survives that clamp) on both edges symmetrically, and shows the correct synced time with a "—" reading per series instead. A genuine local mouseleave (`cursor.event` a real `MouseEvent`, never `null` the way a synced echo's is) still hides the tooltip outright, since there's nothing of that chart's own to report.

**Verified by hand in a real browser**, per this project's testing policy for genuinely visual/canvas behaviour (jsdom has no `canvas`, and the test suite mocks `uplot` at the module boundary): two Plot Panes split side by side, each plotting a different series, confirmed crosshair pixel position matches exactly, each pane's tooltip reads its own series' value within normal poll-interval jitter, a drag-zoom in one Plot left the other's own time span untouched, and a narrower or paused Plot correctly showed "no reading" (not a misleading stale value) on both edges when the shared cursor fell outside its window.
