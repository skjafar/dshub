# Named bitfields

**Status:** needs-triage

Surfaced while hand-authoring the SCE2-CC Profile (`SCE2-Files/SCE2-CC.dshub`): several registers/parameters are bitfields whose individual bits each carry a distinct, firmware-defined meaning — `INTERLOCKS`, `FIRST_INTERLOCK`, `SECOND_INTERLOCK`, `WARNINGS`, `PS_STATUS`, `DIG_INPUTS`, `DIG_OUTPUTS`, `INTERLOCKS_MASK` — but nothing in a Profile's Map or `EntryMetadata` can record what bit 3 of `INTERLOCKS` means, and no Dashboard Widget can show or write one named bit.

## Problem Statement

`EntryMetadata` (`client/src/types/settings.ts`) carries `description`/`unit`/`valueList`, where `valueList` names whole-word *values* (`0 = Idle`, `1 = Running`) — the right shape for a state-machine register, and what `StateLEDWidget` already reads via `ThresholdRule`'s `==` comparator. It has no equivalent for naming individual *bits* of a word that is itself a bitmask rather than an enumerated state.

The one Widget that decomposes a word bit-by-bit, `StatusMatrixWidget` (`shell/panes/widgets/StatusMatrixWidget.tsx`, `shell/widgets/bitfield.ts`), shows a generic 32-dot grid labelled `B0`..`B31`, every dot sharing one hardcoded `warn` role — there is no per-bit label, no per-bit role (a safety interlock bit and an informational status bit are visually identical), and no widget at all for *writing* one named output bit (`DIG_OUTPUTS`) without hand-computing a mask and writing the whole word.

For the SCE2-CC profile this meant every interlock/warning/GPIO word could only be authored as an opaque "0 = clear, nonzero = active" indicator (State LED/Alarm List) plus a raw, unlabeled Status Matrix — accurate, but it throws away exactly the information (which interlock, which input) an Operator most needs at a glance.

## Solution (sketch — not designed yet)

Roughly:

- Extend `EntryMetadata`, or add a sibling shape, with a per-bit table: `bits?: Array<{ bit: number; label: string; role?: StatusRole }>`.
- Feed it into `StatusMatrixWidget` so each dot can show its real name (as a label/tooltip) and its own role instead of the shared `warn`.
- Consider a write-capable counterpart — a bit-toggle control Widget (or a `WidgetTarget` variant that writes a single bit via read-modify-write or a mask) for `DIG_OUTPUTS`-shaped registers, mirroring how Button/Dropdown/Value Write already cover whole-word writes.
- Decide whether per-bit metadata belongs in the Map Editor's own entry editor (`MapEntriesEditor.tsx`) alongside `unit`/`description`/`valueList`, or is scoped only to Dashboard Widget configuration.

No implementation decisions made yet — this file exists to record the need, not to gate any other work.
