# 09 — Parameter and System Register Panes

**What to build:** The remaining two Address Spaces, following the pattern established by the Register Pane. A Parameter Pane reads and writes configuration values that persist on the Device across power cycles. A System Register Pane reads the library-managed space defined by the protocol rather than by firmware, and never writes to it — the absence of a write affordance is the point, not an oversight.

Both are multi-instance and both feed the shared Inspector, as Register Panes do. Where the three Address Spaces differ in behaviour, the difference should be visible to the user, not merely internal: an Engineer must never be unsure which space an address belongs to, since a bare address is meaningless without it.

**Blocked by:** 07

**Status:** ready-for-agent

- [x] A Parameter Pane lists, filters, reads and writes Parameters
- [x] A System Register Pane lists, filters and reads, and offers no write affordance anywhere
- [x] Both feed the shared Inspector and both support multiple instances
- [x] Each Pane makes its Address Space unambiguous at a glance
- [x] Parameter writes are covered by the same value-encoding contracts as Register writes
- [x] Behaviour tests cover filtering, selection, empty and disconnected states for both

## Comments

**The Register Pane became one `AddressSpacePane`, parameterised by space,**
rather than three near-copies of ticket 06/07's component. `RegisterPane.tsx`,
`ParameterPane.tsx` and `SystemRegisterPane.tsx` are now three-line bindings
onto it; `Registers.tsx` is renamed `Entries.tsx` since it no longer lists only
Registers. Every behaviour ticket 07 pinned for the write path — the
mid-edit-overwrite guard, the two commit paths producing one write, the
refusal-is-reported contract, the editing-precision seed — carries over
unchanged, because it lives in the one component now rather than being
retyped.

**The read-only rule for System Registers lives on the space, not the entry.**
A System Register Map is parsed with `isRegisterMap=false` (`mapParser.ts`),
the same call `parameters.map` gets, so it declares no read-only boundary and
every entry in it claims `READ_WRITE`. `ADDRESS_SPACE_READ_ONLY_REASON` in
`addressSpace.ts` is the space's own answer, and it overrides the Map's claim
in both the access column and the write path — `accessLabel` now takes the
space, and `spaceBinding.ts`'s `write` is statically `null` for
`sysRegister`, narrowed by `Extract<AddressSpace, 'register' | 'parameter'>`
rather than nulled out after being constructed, so there is no path by which a
System Register write command could reach the port.

**Making the Address Space unambiguous at a glance turned out to mean two
things, not one.** Which space an address belongs to is stated in the Pane
itself (a heading, not only the tab, since a tab truncates and the Pane being
read need not be the one whose tab is in view). What sets a space apart in
*behaviour* is a second thing: the System Register Pane states in words why it
offers no write, and — added after the first review pass, see below — the
Register and Parameter Panes now state what a write there does, symmetrically,
in the same slot.

**Verified in a browser against the fake adapter**, on the CNC Profile so the
three Maps have something worth listing. All three Address Spaces open side by
side: Registers reads "Live runtime values, set by firmware and lost at
power-off," Parameters reads "Configuration values that persist on the Device
across a power cycle," System Registers keeps its refusal note and offers no
field or Send button for any of its four entries. A Parameter write to
`MOTOR_Z_MAX_VEL` went out over the Parameter command and the row followed it.

**One review pass, two findings that changed the surface.** The Parameter
Pane originally said nothing about persisting across a power cycle anywhere a
user could see — that property lived only in the Panes-menu description, not
in the Pane itself, which the ticket's "visible... not merely internal" line
argues against. `ADDRESS_SPACE_DESCRIPTION` now states it, and Registers got
the same treatment for symmetry rather than reading as an oversight by
contrast. Second, the generalised status line had lost its noun ("Showing 15
of 15" rather than "15 of 15 registers") — restored, since which of three
Address Spaces is holding those fifteen entries is exactly what this ticket
exists to keep unambiguous.

**Two hand-kept tables were collapsed into one.** `ADDRESS_SPACE_WRITABLE` was
originally a second table beside `ADDRESS_SPACE_READ_ONLY_REASON`, and the two
could disagree — a space marked unwritable with no reason recorded is the
"forgot the control" reading this whole ticket exists to avoid. `WRITABLE` is
now derived from `REASON`, so that combination cannot occur.

**Duplicate test coverage was retired, not duplicated further.** The first
draft of `AddressSpacePane.test.tsx` re-ran the Register Pane's filtering,
selection, tab-naming and link-state cases that `RegisterPane.test.tsx`
already held — two suites pinning the same behaviour, which is the drift this
ticket's own cross-space table exists to prevent. `RegisterPane.test.tsx` is
trimmed to what does not generalise: per-Pane format switching, and the
Inspector's decode/rename/staleness behaviour. The three-way write recorder
duplicated across `AddressSpacePane.test.tsx` and `WriteContracts.test.tsx`
(née `RegisterWrite.test.tsx`) is now one `writeRecorder.ts` both import.

**`docs/adr/0003-frozen-data-path.md` named `RegisterPane.tsx`** for the
write-answer discipline; repointed to `AddressSpacePane.tsx`, where that logic
now actually lives.

**Environment note.** `npm run dev` and the browser verification both ran
against the fake port with no Tauri; the CNC Profile's system-registers map
was loaded from `public/maps/cnc_system_registers.map`.

363 frontend tests before trimming duplicate coverage, 353 after; typecheck
and lint clean (150 pre-existing warnings, unchanged from `HEAD`).
