import { describe, it, expect } from 'vitest';
import { DataAccessPermit, DataForm } from '../../maps/mapParser';
import type { MapEntry } from '../../maps/mapParser';
import { backfillSnapshot, isValidBindingSnapshot, snapshotFromEntry } from '../bindingIdentity';

function entry(overrides: Partial<MapEntry> = {}): MapEntry {
  return {
    address: 0,
    name: 'FOO',
    type: DataForm.UINT,
    isArray: false,
    accessPermit: DataAccessPermit.READ_WRITE,
    showAsHex: false,
    ...overrides,
  };
}

describe('snapshotFromEntry', () => {
  it('captures name and shape, omitting arraySize for a scalar entry', () => {
    expect(snapshotFromEntry(entry({ name: 'MOTOR_TEMP', type: DataForm.FLOAT }))).toEqual({
      name: 'MOTOR_TEMP',
      type: DataForm.FLOAT,
      isArray: false,
      arraySize: undefined,
    });
  });

  it('captures array size for an array element entry', () => {
    expect(snapshotFromEntry(entry({ name: 'IP[0]', isArray: true, arraySize: 4 }))).toEqual({
      name: 'IP[0]',
      type: DataForm.UINT,
      isArray: true,
      arraySize: 4,
    });
  });
});

describe('backfillSnapshot', () => {
  it('derives a snapshot from whatever entry currently sits at the stored address, when none was captured', () => {
    const entries = [entry({ address: 5, name: 'MOTOR_TEMP', type: DataForm.FLOAT })];
    expect(backfillSnapshot(undefined, 5, entries)).toEqual({
      name: 'MOTOR_TEMP',
      type: DataForm.FLOAT,
      isArray: false,
      arraySize: undefined,
    });
  });

  it('backfills to null without erroring when the stored address has no entry at all', () => {
    expect(backfillSnapshot(undefined, 99, [entry({ address: 5 })])).toBeNull();
  });

  it('leaves an already-captured snapshot untouched, even if it no longer matches the current Map', () => {
    const existing = { name: 'OLD_NAME', type: DataForm.INT, isArray: false, arraySize: undefined };
    expect(backfillSnapshot(existing, 5, [entry({ address: 5, name: 'DIFFERENT' })])).toBe(existing);
  });

  it('leaves an explicitly-null snapshot (backfilled once already, nothing found) untouched', () => {
    expect(backfillSnapshot(null, 5, [entry({ address: 5, name: 'NOW_HERE' })])).toBeNull();
  });
});

describe('isValidBindingSnapshot', () => {
  it('accepts null — a backfill that found nothing at that address', () => {
    expect(isValidBindingSnapshot(null)).toBe(true);
  });

  it('accepts undefined — a binding saved before this feature shipped', () => {
    expect(isValidBindingSnapshot(undefined)).toBe(true);
  });

  it('accepts a well-formed snapshot', () => {
    expect(isValidBindingSnapshot({ name: 'FOO', type: DataForm.UINT, isArray: false })).toBe(true);
  });

  it('accepts a well-formed array snapshot with an arraySize', () => {
    expect(isValidBindingSnapshot({ name: 'IP', type: DataForm.UINT, isArray: true, arraySize: 4 })).toBe(true);
  });

  it('rejects a snapshot with an unknown type', () => {
    expect(isValidBindingSnapshot({ name: 'FOO', type: 'not-a-type', isArray: false })).toBe(false);
  });

  it('rejects a snapshot missing a name', () => {
    expect(isValidBindingSnapshot({ type: DataForm.UINT, isArray: false })).toBe(false);
  });

  it('rejects garbage without throwing', () => {
    for (const candidate of [42, 'a string', [], true]) {
      expect(() => isValidBindingSnapshot(candidate)).not.toThrow();
      expect(isValidBindingSnapshot(candidate)).toBe(false);
    }
  });
});
