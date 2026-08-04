# 07 — Write path and value-encoding contracts

**What to build:** Writing a value to a Register, and the contract tests that pin exactly what reaches the Device.

This is the failure mode that is silent and expensive: a wrong value written to live hardware looks like a successful interaction. The existing write-cell test exists because a live update arriving mid-edit could overwrite what the user had typed before the form submitted, so clicking Send wrote the Device's old value back instead of the new one — while pressing Enter did not, because the field was still focused. Both commit paths must be pinned here, and the tests should carry a docblock explaining the failure they prevent, following that precedent.

An entry's access from the Map governs whether writing is offered at all.

**Blocked by:** 06

**Status:** ready-for-agent

- [x] A value typed into a Register Pane is written exactly as typed
- [x] A live update arriving mid-edit cannot overwrite an in-progress edit before it commits
- [x] Keyboard and pointer commit paths produce identical writes
- [x] Read-only entries offer no write affordance
- [x] Contract tests assert what reaches the port for every type and display format, on both commit paths
- [x] Contract tests carry docblocks naming the hardware-safety failure they prevent
- [x] A rejected or failed write is reported plainly rather than silently swallowed

## Comments

**The encoding rule.** A Pane's display format governs how a typed value is
read, because anything else makes the screen a trap — a column reading
`0x0000002A` where typing `2A` sets the register to forty-two thousand.
`valueParse.ts` is the exact inverse of `valueFormat.ts`, and the property that
makes a prefilled field safe is pinned directly: seeding a field from a value
and committing it untouched writes the same word back, for every type and every
format.

**Two findings the encoding work turned up, both reaching hardware.**

- *Unsigned values above 2 147 483 647 never reached the board.* `write_register`
  is declared `value: i32`, so 4294967295 is refused by Tauri's deserialiser
  rather than written — a write that looked accepted did nothing at all. Every
  value now leaves as the signed word carrying the same thirty-two bits. The old
  `parseWriteValue` explicitly permitted the whole unsigned range, so writing
  `0xFFFFFFFF` to a hex register has never worked.
- *`Number()` reads `0x1F` as 31.* A decimal field accepting a hexadecimal
  literal writes a different number than the one on screen. A Pane has an
  explicit format for that; decimal now means decimal.

**Float fields are seeded at editing precision, not display precision.** A
register holding 3.14159274 reads as `3.142` in the column, and a field started
from that would write 3.142 to the Device the moment Enter was pressed on a
value nobody had touched. `editableEntryValue` adds digits until the text
survives the round trip. Negative zero is a distinct word and is spelled `-0`
for the same reason. A float whose bits are NaN or infinity has no decimal
reading that writes back unchanged, so the field refuses the commit and says so
— the way to edit one is to switch the Pane to hexadecimal, where every bit
survives.

**The mid-edit overwrite is designed out rather than guarded against.** The
precedent bug mirrored the Device whenever the field was *not focused*, and
clicking Send blurs it. The typed value lives in component state and the Device
is only shown while nothing has been typed, so blur is not part of the
mechanism. Both commit paths are the same form `submit`, so they are one code
path and cannot diverge again.

**One defect in ticket 05's code, surfaced by the write gate.**
`controlHolderOf` reported Control as "this session" from the Device's
`CONTROL_INTERFACE` register without comparing it against the transport we are
connected over — so connecting over TCP to a board whose Control is held by a
UDP session read as ours, and would have offered a write affordance for a write
the board refuses. `holdsControl` is pinned against the frozen `canWriteToDevice`
across every state, because two answers to "may I write" is exactly how such an
affordance appears.

**Writes go through the port, not through the context action.** The action
returns void by design — it logs a failure and swallows it, which is right for a
read, whose value arrives as an event anyway. A write has to say *at the field*
whether it reached the board: a failure noticed later, in a log, is one noticed
after the operator has already decided the value was sent.

**The review found that a refused write was invisible end to end, and it was
fixed in the backend.** `process_response` parsed the response status and then
discarded it for register and parameter writes, emitting `valid: true` whatever
the board answered — so a write refused with `PERMISSION_ERROR` was reported to
the interface as a completed one. It could not be fixed above the boundary,
because the status never crossed it. ADR-0003 gains a third amendment on the
same grounds as the second: a defect found, fixed in place, nothing redesigned.
Note that success here is any non-negative code — `WRITE_REG_OK` is 2, not 0 —
so treating zero as the only success would report every accepted write as
refused.

**A resolved write command is not a completed write.** The backend resolves as
soon as the request is queued; it cannot do otherwise, since responses arrive as
events. The Pane therefore waits for the Device's answer for that address before
reporting anything, and says so if no answer arrives. The fake grew a
`refuseWrites` fault so the refusal is reachable in a test and in a browser
session — the first version of these tests stubbed the port to reject, which
tested a failure the real transport cannot produce and which `spec.md` forbids
("Nothing mocks modules and nothing stubs the transport").

**Also from the review.** The precedent's untouched-field hazard now has its own
test: nothing previously pinned that the field is seeded from `editableEntryValue`
rather than the rounded display, so the bug could have been reintroduced with the
suite green. The `hex` × binary contract case was missing. A refusal no longer
stands under the next register's field. `ControlTransport` is a literal union
again rather than `string`, the write field composes the shared focus ring, and
its message is tied to the field by `aria-describedby` rather than only sitting
beside it.

**Verified in a browser against the fake adapter.** Refused with the right
reason before connecting and again before Control is claimed; a value typed
while the Pane was live-polling survived every incoming reading and was the one
that went; an out-of-range value was refused at the field and kept for
correction; a read-only entry offered no field and no button. With
`dshubFaults.refuseWrites(true)`, a refusal reads coherently in all three
places at once — the field says the register is unchanged, the row's value goes
`invalid`, and the Inspector says not to act on the reading — and clears when
another entry is selected.

**Environment note.** `tsconfig.json` excludes `**/*.test.ts(x)`, so test files
are never typechecked — a test that omitted a newly required prop failed at
runtime rather than at the type level. Worth knowing when reading a test failure
that looks like a component bug.

271 frontend tests, 10 Rust tests, typecheck, `cargo check` and lint clean.
