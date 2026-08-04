# 10 — Activity Log Pane

**What to build:** The Activity Log as a Pane that docks alongside whatever an Engineer is working on, rather than a destination they must navigate to and back from. It reports connection events, reads, writes and protocol traffic, filterable by category and by level.

Packet traffic is a filter of this log, not a separate surface — hex dumps and analysis are reached by filtering, and an expanded entry shows direction, interface, size, response time and its dump. An unread indicator makes new events noticeable while attention is elsewhere.

Log level maps onto status semantics, so an error in the log reads with the same colour vocabulary as an error anywhere else. Diagnostic packet traffic is not a condition and should read as such.

**Blocked by:** 05

**Status:** ready-for-agent

- [x] The Activity Log docks alongside other Panes without displacing them
- [x] Filtering by category and by level both work
- [x] Packet traffic is reachable as a filter and expands to show direction, interface, size, timing and dump
- [x] An unread indicator appears for new entries and clears when the log is attended to
- [x] Log levels render through status semantics, with packet traffic reading as diagnostic rather than as a condition
- [x] Retention respects the configured maximum entry count
