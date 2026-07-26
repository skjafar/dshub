# Changelog

All notable changes to DSHub.

## [0.2.4] - 2026-07-26

- Added `CHANGELOG.md` to document the application release history.
- Added a digit-editable "thumbwheel" numeric input (`ThumbwheelInput`) — click a digit to highlight it, use Up/Down to step it odometer-style, Shift+Left/Right to move the highlight (growing decimal precision on floats) — and rolled it out to every write field: Parameters Panel, Registers Panel, the Data Edit dialog, the Sys Command panel, and the Data Table widget.
- Added optional scientific notation display to the Value Read, Gauge, Progress Bar, Encoder Display, System Info, Data Table, and Alarm List widgets, with automatic scientific notation for very small float magnitudes regardless of the configured display mode.
- Data Table widget: rewrote to auto-detect per-row writability from the device map (parameters are always writable; registers depend on `accessPermit`), with inline write cells, min/max/step validation, and an optional write-confirmation dialog.
- Fixed float register/parameter values being plotted, aggregated into statistics, and exported to CSV as raw IEEE-754 bit patterns instead of their decoded value (Plot Panel).
- Fixed the widget address autocomplete losing in-progress search text while live device data was updating (Widget Config Dialog).
- Fixed plot polling tasks silently stopping on a device reconnect instead of resuming.
- Added `build.bat` for building and packaging DSHub on Windows.
