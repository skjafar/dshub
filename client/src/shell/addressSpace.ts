/**
 * The three Address Spaces, as the interface names them.
 *
 * A bare address is meaningless without knowing which space it belongs to —
 * address 2 is a different thing in each — so every selection, every read and
 * every Inspector reading carries one. The discriminants match the `DataSource`
 * strings `pollRegistry` already keys by, so a Pane's space passes straight
 * through to a poll subscription without a translation table in between.
 */

import { DataAccessPermit } from '../maps/mapParser';
import type { MapEntry } from '../maps/mapParser';
import type { DataSource } from '../types/dashboard';

/**
 * Narrowed from `DataSource` rather than restated, so the two cannot drift.
 * They are not the same set: `DataSource` also covers `sysCommand`, which is an
 * instruction rather than a space with addresses in it.
 */
export type AddressSpace = Extract<DataSource, 'register' | 'parameter' | 'sysRegister'>;

/**
 * The Address Spaces a write may ever target — System Registers excluded,
 * per {@link ADDRESS_SPACE_WRITABLE}. Narrowed here rather than restated at
 * each write-capable call site, so a write Widget's target and `spaceBinding.ts`'s
 * own `write` function agree about which spaces are writable by construction.
 */
export type WritableAddressSpace = Extract<AddressSpace, 'register' | 'parameter'>;

/** How a space is named to a person. The glossary's spelling, not the discriminant's. */
export const ADDRESS_SPACE_NAME: Readonly<Record<AddressSpace, string>> = {
  register: 'Registers',
  parameter: 'Parameters',
  sysRegister: 'System Registers',
};

/** Singular, for naming one entry's space rather than the space itself. */
export const ADDRESS_SPACE_ENTRY_NAME: Readonly<Record<AddressSpace, string>> = {
  register: 'Register',
  parameter: 'Parameter',
  sysRegister: 'System Register',
};

/**
 * Why a space cannot be written, or null when it can.
 *
 * System Registers are managed by the protocol library rather than by firmware,
 * and the Device answers a write to one with `PERMISSION_ERROR`. This is a
 * property of the space, not of any entry in it — and it has to be, because a
 * System Register Map is parsed with no read-only boundary, so every entry in
 * one claims read/write. The space's rule is the true one and overrides the
 * Map's claim wherever the two disagree.
 *
 * Said out loud, in a Pane, rather than left to be inferred from a missing
 * control: the absence of a write affordance is the point, not an oversight,
 * and a surface that simply lacks a control reads as one that forgot it.
 */
export const ADDRESS_SPACE_READ_ONLY_REASON: Readonly<Record<AddressSpace, string | null>> = {
  register: null,
  parameter: null,
  sysRegister:
    'Read-only space — System Registers are defined by the protocol library rather than by firmware, and the Device refuses writes to them.',
};

/**
 * Whether the protocol permits writing to a space at all.
 *
 * Derived from {@link ADDRESS_SPACE_READ_ONLY_REASON} rather than stated
 * separately: a second, hand-kept table risks the one combination that must
 * never occur — a space marked unwritable with nothing said about why, which is
 * exactly the missing-control reading this module exists to prevent.
 */
export const ADDRESS_SPACE_WRITABLE: Readonly<Record<AddressSpace, boolean>> = {
  register: ADDRESS_SPACE_READ_ONLY_REASON.register === null,
  parameter: ADDRESS_SPACE_READ_ONLY_REASON.parameter === null,
  sysRegister: ADDRESS_SPACE_READ_ONLY_REASON.sysRegister === null,
};

/**
 * What sets a space apart, stated in the Pane rather than only in the reopen
 * menu — an Engineer reading a Parameter Pane has no way to see that a write
 * there survives a power cycle unless the Pane says so.
 *
 * Shown only where {@link ADDRESS_SPACE_READ_ONLY_REASON} is null: System
 * Registers already carry a fuller explanation in that slot, and a second line
 * saying much the same thing would be noise rather than information.
 */
export const ADDRESS_SPACE_DESCRIPTION: Readonly<Record<AddressSpace, string>> = {
  register: 'Live runtime values, set by firmware and lost at power-off.',
  parameter: 'Configuration values that persist on the Device across a power cycle.',
  sysRegister: 'The protocol library’s own space, defined by the protocol rather than by firmware.',
};

/**
 * An entry's access, in the form a table column can hold.
 *
 * Spelled out rather than abbreviated to `R/O` and `R/W`: the two abbreviations
 * differ by one character in the middle, which is the hardest possible place for
 * a scanning eye to tell two states apart, and this one governs whether writing
 * is even permitted.
 *
 * The space is asked first. Reporting a System Register as read/write because
 * its Map says so would promise a write the Device will refuse — the one thing
 * this column exists to answer.
 */
export function accessLabel(space: AddressSpace, entry: MapEntry): string {
  if (!ADDRESS_SPACE_WRITABLE[space]) return 'read-only';
  return entry.accessPermit === DataAccessPermit.READ_WRITE ? 'read/write' : 'read-only';
}

/**
 * Why one entry, in one space, cannot be written — or null when it can.
 *
 * The space is asked first, same as {@link accessLabel}: a System Register
 * claims read/write in its own Map regardless of what is actually written
 * there, so the space's rule has to override the entry's before the entry is
 * even consulted. Shared by every control Widget that mirrors an address it
 * also writes — Button, Dropdown and Value Write all faced the same two
 * checks in the same order, which is exactly the per-kind duplication this
 * rebuild exists to remove.
 */
export function entryWriteBlockReason(space: AddressSpace, entry: MapEntry): string | null {
  const spaceReason = ADDRESS_SPACE_READ_ONLY_REASON[space];
  if (spaceReason !== null) return spaceReason;
  if (entry.accessPermit !== DataAccessPermit.READ_WRITE) {
    return `${entry.name} is read-only in this Profile’s Map.`;
  }
  return null;
}
