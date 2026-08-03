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
 * An entry's access, in the form a table column can hold.
 *
 * Spelled out rather than abbreviated to `R/O` and `R/W`: the two abbreviations
 * differ by one character in the middle, which is the hardest possible place for
 * a scanning eye to tell two states apart, and this one governs whether writing
 * is even permitted.
 */
export function accessLabel(entry: MapEntry): string {
  return entry.accessPermit === DataAccessPermit.READ_WRITE ? 'read/write' : 'read-only';
}
