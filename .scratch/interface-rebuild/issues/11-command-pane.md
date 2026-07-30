# 11 — Command Pane

**What to build:** Sending Commands to the Device — numbered instructions that make it act, as distinct from writing a value. Commands are presented by name from the active Profile's catalogue, so an Engineer is never transcribing numbers from a separate document, and are searchable when a Profile defines many.

A Command reaching live equipment carries the same weight as a write, so it inherits the write path's confirmation and feedback patterns rather than inventing its own. The result of sending is reported plainly; a Command that was rejected must never look like one that succeeded.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Commands are listed by name and description from the active Profile
- [ ] Commands are searchable by name and by code
- [ ] Sending is confirmed and its result reported plainly, including rejection
- [ ] Sending is unavailable, with the reason visible, when Control is not held
- [ ] A Profile with no Command catalogue produces a clear empty state rather than a broken Pane
- [ ] Behaviour tests drive the fake port and cover send, rejection and the no-Control state
