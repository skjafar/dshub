# 07 — Write path and value-encoding contracts

**What to build:** Writing a value to a Register, and the contract tests that pin exactly what reaches the Device.

This is the failure mode that is silent and expensive: a wrong value written to live hardware looks like a successful interaction. The existing write-cell test exists because a live update arriving mid-edit could overwrite what the user had typed before the form submitted, so clicking Send wrote the Device's old value back instead of the new one — while pressing Enter did not, because the field was still focused. Both commit paths must be pinned here, and the tests should carry a docblock explaining the failure they prevent, following that precedent.

An entry's access from the Map governs whether writing is offered at all.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] A value typed into a Register Pane is written exactly as typed
- [ ] A live update arriving mid-edit cannot overwrite an in-progress edit before it commits
- [ ] Keyboard and pointer commit paths produce identical writes
- [ ] Read-only entries offer no write affordance
- [ ] Contract tests assert what reaches the port for every type and display format, on both commit paths
- [ ] Contract tests carry docblocks naming the hardware-safety failure they prevent
- [ ] A rejected or failed write is reported plainly rather than silently swallowed
