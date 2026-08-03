import { describe, it, expect } from 'vitest';
import { DataAccessPermit, DataForm } from '../../maps/mapParser';
import type { MapEntry } from '../../maps/mapParser';
import { filterEntries } from '../entryFilter';

function entry(address: number, name: string): MapEntry {
  return {
    address,
    name,
    type: DataForm.UINT,
    isArray: false,
    accessPermit: DataAccessPermit.READ_ONLY,
    showAsHex: false,
  };
}

const ENTRIES: readonly MapEntry[] = [
  entry(0, 'FIRMWARE_VERSION'),
  entry(1, 'SPINDLE_RPM'),
  entry(42, 'MOTOR_X_ENABLED'),
  entry(43, 'MOTOR_Y_ENABLED'),
  entry(420, 'COOLANT_TEMP'),
];

const names = (entries: readonly MapEntry[]): string[] => entries.map(e => e.name);

describe('filterEntries', () => {
  it('shows everything when nothing has been typed', () => {
    expect(filterEntries(ENTRIES, '')).toHaveLength(ENTRIES.length);
    expect(filterEntries(ENTRIES, '   ')).toHaveLength(ENTRIES.length);
  });

  it('matches part of a name, whatever case it was typed in', () => {
    expect(names(filterEntries(ENTRIES, 'motor'))).toEqual(['MOTOR_X_ENABLED', 'MOTOR_Y_ENABLED']);
    expect(names(filterEntries(ENTRIES, 'RPM'))).toEqual(['SPINDLE_RPM']);
  });

  it('matches an address exactly rather than as a substring of one', () => {
    // Typing an address is asking to go to it. A substring match on 42 would
    // also return 420, so the entry actually asked for arrives in a list.
    expect(names(filterEntries(ENTRIES, '42'))).toEqual(['MOTOR_X_ENABLED']);
  });

  it('matches an address written in hexadecimal', () => {
    expect(names(filterEntries(ENTRIES, '0x2A'))).toEqual(['MOTOR_X_ENABLED']);
    expect(names(filterEntries(ENTRIES, '0x2a'))).toEqual(['MOTOR_X_ENABLED']);
  });

  it('treats a bare hex-looking word as a name, since a name is what it is', () => {
    // `2A` without the prefix is ambiguous, and entry names are the common case.
    // Requiring `0x` is what keeps the two readings from colliding.
    expect(filterEntries(ENTRIES, '2A')).toHaveLength(0);
  });

  it('returns both readings when a query is a name fragment and an address', () => {
    const digits: readonly MapEntry[] = [...ENTRIES, entry(7, 'AXIS_1_FAULT')];
    expect(names(filterEntries(digits, '1'))).toEqual(['SPINDLE_RPM', 'AXIS_1_FAULT']);
  });

  it('returns nothing when a query matches nothing, rather than falling back to everything', () => {
    // A filter that silently shows all entries when it matches none is how an
    // Engineer reads a value off a register they never asked for.
    expect(filterEntries(ENTRIES, 'NO_SUCH_ENTRY')).toHaveLength(0);
  });
});
