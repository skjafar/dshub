# 11 — Command Pane

**What to build:** Sending Commands to the Device — numbered instructions that make it act, as distinct from writing a value. Commands are presented by name from the active Profile's catalogue, so an Engineer is never transcribing numbers from a separate document, and are searchable when a Profile defines many.

A Command reaching live equipment carries the same weight as a write, so it inherits the write path's confirmation and feedback patterns rather than inventing its own. The result of sending is reported plainly; a Command that was rejected must never look like one that succeeded.

**Blocked by:** 07

**Status:** ready-for-agent

- [x] Commands are listed by name and description from the active Profile
- [x] Commands are searchable by name and by code
- [x] Sending is confirmed and its result reported plainly, including rejection
- [x] Sending is unavailable, with the reason visible, when Control is not held
- [x] A Profile with no Command catalogue produces a clear empty state rather than a broken Pane
- [x] Behaviour tests drive the fake port and cover send, rejection and the no-Control state

## Comments

**A fourth ADR-0003 amendment backs the confirmation, not a log line.** Before
this ticket, a Command's answer crossed the boundary only as a human-readable
log line — `process_response`'s case `0` read the status just to format a
message, never carrying it as data. The ticket asks a Command to inherit the
write path's confirmation pattern, which for writes rests entirely on a typed
`valid` field the response event carries (ticket 07's own third amendment).
There was no equivalent for Commands, so `commandResponse` is now a typed
event — `{ command, value, status, valid, timestamp }` — emitted by the same
match arm, logging only on refusal exactly as the write arms do. `command`
carries the request's own address field rather than the response's, since
`response_matches` already established SYS_COMMAND does not echo a meaningful
address. One side effect: the always-on info log a successful SYS_COMMAND used
to produce is gone for the three library commands too, not only for Profile
Commands — both travel as type `0`. Nothing reads that line today (the legacy
`SysCommandPanel` it served is not mounted under the rebuilt shell), and it is
recorded in the ADR rather than left implicit.

**The Pane subscribes to the port directly, not through `DSHubContext`.** The
device half of the application context is frozen, and adding a new reducer
case and state field for one event a single Pane reads is a larger change than
reading it at the boundary — the same reasoning `spaceBinding.ts`'s write
already follows for sending. `commandBinding.ts`'s `useCommandResponses` guards
the same async-registration race ADR-0003's second amendment fixed in
`DSHubContext`.

**Search reads a code as a substring, not exactly.** `entryFilter.ts`'s address
match is exact because typing an address is asking to jump to it; a Command's
code is not sought the same way, and a Profile with many Commands is used by
narrowing a partial code as much as a partial name — `commandFilter.ts` matches
both as substrings.

**The value parameter has no type to read a notation from.** Unlike a Register
or Parameter, a Command's optional value carries no Map-declared type, so
`CommandSendBar` parses it through the existing
`parseEntryValue(text, DataForm.INT, 'decimal')` — decimal, signed, matching
the protocol's `i32` — rather than adding a second parser. There is also no
Device value to mirror mid-edit: the write field's core hazard, a live reading
overwriting an untouched draft, does not exist here, since a Command has no
reading at all, so `CommandSendBar` carries none of that machinery.

**Verified in a browser against the fake adapter**, on a seeded Profile with
three Commands. Listing, search by name and by code, sending while connected
and holding Control (settles cleanly, no error), the blocked state once
Control is not held (warns in the status-warn colour, field and button
disabled), and both empty states — no Profile active, and a Profile with no
catalogue — all rendered correctly with zero console errors. The real default
Profile (fetched from `public/maps/`) has no `sysCommands`, so a plain launch
already exercises the "declares no Commands" state with no seeding needed.

**One thing the review caught.** The empty-catalogue message originally
pointed at "the Map Editor" as a place to add Commands — a surface the
rebuilt Workspace does not have yet (ticket 19). `Entries.tsx`'s own empty-Map
message states the fact with no call to action, for the same reason, and
`Commands.tsx` now matches it.

**The library's three built-in SYS_COMMANDs and the CNC dashboard widgets were
not touched.** `DS_SYS_COMMANDS` (READ_FLASH, WRITE_FLASH, RESET_FIRMWARE) is a
different, wider catalogue the old `SysCommandPanel` mixed in below the
Profile's own; this ticket asks for "the active Profile's catalogue"
specifically, so the new Pane lists only `profile.sysCommands`.

**Environment note.** `client/node_modules` was absent at the start of this
ticket (`tsc`/`vitest` both failed to resolve); `npm install` repaired it.

426 frontend tests, 10 Rust tests, typecheck, `cargo check` and lint clean (one
new `react-hooks/set-state-in-effect` warning, the same pattern
`AddressSpacePane.tsx` already carries for the identical reason: settling a
send against an event has to happen from an effect).
