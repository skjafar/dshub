# 12 — Plot Pane on the new plotting engine

**What to build:** Live plotting rebuilt on the new engine, driven imperatively so plot updates bypass the render cycle on fast ticks. This is the most performance-sensitive surface in the application: poll intervals as low as 50 ms against series retaining tens of thousands of points, and it must stay responsive across a long capture rather than degrading as history accumulates.

An Engineer sets poll interval and time span per Plot to trade resolution against history, pauses and resumes to examine a trace without it moving underneath them, and exports the data to a file for analysis elsewhere. Several Plot Panes can be open at once, each plotting different signals.

Series colour comes from the data palette by slot rather than by fixed value, so series identity survives a theme switch while lightness adapts. Chart chrome — grid, axes, labels — follows the theme through the token bridge rather than being pinned.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] A Plot Pane renders live series from the Device and stays responsive at tens of thousands of retained points
- [ ] Poll interval and time span are configurable per Plot
- [ ] Pause and resume work without losing retained history
- [ ] Plot data exports to a file through the port
- [ ] Several Plot Panes can be open at once, each with independent series and settings
- [ ] Series colour is stored as a palette slot so identity survives a theme switch
- [ ] Chart chrome follows the active theme rather than snapping to fixed values
