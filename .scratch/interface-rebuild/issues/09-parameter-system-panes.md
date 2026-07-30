# 09 — Parameter and System Register Panes

**What to build:** The remaining two Address Spaces, following the pattern established by the Register Pane. A Parameter Pane reads and writes configuration values that persist on the Device across power cycles. A System Register Pane reads the library-managed space defined by the protocol rather than by firmware, and never writes to it — the absence of a write affordance is the point, not an oversight.

Both are multi-instance and both feed the shared Inspector, as Register Panes do. Where the three Address Spaces differ in behaviour, the difference should be visible to the user, not merely internal: an Engineer must never be unsure which space an address belongs to, since a bare address is meaningless without it.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] A Parameter Pane lists, filters, reads and writes Parameters
- [ ] A System Register Pane lists, filters and reads, and offers no write affordance anywhere
- [ ] Both feed the shared Inspector and both support multiple instances
- [ ] Each Pane makes its Address Space unambiguous at a glance
- [ ] Parameter writes are covered by the same value-encoding contracts as Register writes
- [ ] Behaviour tests cover filtering, selection, empty and disconnected states for both
