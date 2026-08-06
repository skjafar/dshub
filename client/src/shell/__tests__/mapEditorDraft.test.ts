import { describe, it, expect } from 'vitest';
import { DataAccessPermit, DataForm } from '../../maps/mapParser';
import type { MapEntry } from '../../maps/mapParser';
import {
  MAX_ENTRIES,
  addEntry,
  applyMetadata,
  deleteEntry,
  extractMetadata,
  isRegisterOrderValid,
  reorderEntries,
  updateEntry,
} from '../panes/mapEditorDraft';

/**
 * Pure edits to a Map Editor's draft entries — extracted so the rules an edit
 * can violate (the entry cap, the Read-Only/Read-Write boundary a Register's
 * position encodes, array expansion and re-addressing) are pinned once here
 * rather than re-derived from a rendered table in every test that touches them.
 */

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

describe('addEntry', () => {
  it('appends a uniquely-named entry addressed after the last one', () => {
    const result = addEntry([entry({ address: 0, name: 'FOO' })], false);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1]).toMatchObject({ address: 1, name: 'NEW_PARAMETER_1' });
  });

  it('skips a name already taken, including by a previous new entry', () => {
    const result = addEntry(
      [entry({ address: 0, name: 'NEW_PARAMETER_1' }), entry({ address: 1, name: 'NEW_PARAMETER_2' })],
      false
    );
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.entries[2].name).toBe('NEW_PARAMETER_3');
  });

  it('adds a new Register as read-only, sorted ahead of read-write entries', () => {
    const result = addEntry(
      [entry({ address: 0, name: 'RW_ONE', accessPermit: DataAccessPermit.READ_WRITE })],
      true
    );
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.entries.map(e => e.name)).toEqual(['NEW_REGISTER_1', 'RW_ONE']);
    expect(result.entries[0].accessPermit).toBe(DataAccessPermit.READ_ONLY);
  });

  it('refuses once the entry cap is reached', () => {
    const entries = Array.from({ length: MAX_ENTRIES }, (_, i) => entry({ address: i, name: `E${i}` }));
    const result = addEntry(entries, false);
    expect(result).toEqual({ kind: 'error', error: expect.stringContaining(String(MAX_ENTRIES)) });
  });
});

describe('updateEntry', () => {
  it('renames an entry in place without moving it', () => {
    const entries = [entry({ address: 0, name: 'A' }), entry({ address: 1, name: 'B' })];
    const result = updateEntry(entries[0], entries, { name: 'RENAMED' });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.entries.map(e => e.name)).toEqual(['RENAMED', 'B']);
  });

  it('expands a scalar entry into array elements and readdresses what follows', () => {
    const entries = [entry({ address: 0, name: 'A' }), entry({ address: 1, name: 'B' })];
    const result = updateEntry(entries[0], entries, {
      name: 'A',
      isArray: true,
      arraySize: 3,
      type: DataForm.UINT,
      accessPermit: DataAccessPermit.READ_WRITE,
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.entries.map(e => ({ name: e.name, address: e.address }))).toEqual([
      { name: 'A[0]', address: 0 },
      { name: 'A[1]', address: 1 },
      { name: 'A[2]', address: 2 },
      { name: 'B', address: 3 },
    ]);
  });

  it('refuses a rename that collides with another entry', () => {
    const entries = [entry({ address: 0, name: 'A' }), entry({ address: 1, name: 'B' })];
    const result = updateEntry(entries[0], entries, { name: 'B' });
    expect(result).toEqual({ kind: 'error', error: expect.stringContaining('already') });
  });

  it('refuses a name that is not a valid identifier', () => {
    const entries = [entry({ address: 0, name: 'A' })];
    const result = updateEntry(entries[0], entries, { name: '1BAD NAME' });
    expect(result.kind).toBe('error');
  });
});

describe('deleteEntry', () => {
  it('removes every element of an array entry and readdresses what follows', () => {
    const entries = [
      entry({ address: 0, name: 'ARR[0]', isArray: true, arraySize: 2 }),
      entry({ address: 1, name: 'ARR[1]', isArray: true, arraySize: 2 }),
      entry({ address: 2, name: 'AFTER' }),
    ];
    const next = deleteEntry(entries[0], entries);
    expect(next).toEqual([entry({ address: 0, name: 'AFTER' })]);
  });
});

describe('reorderEntries', () => {
  it('moves a consolidated entry and readdresses the whole list', () => {
    const entries = [
      entry({ address: 0, name: 'A' }),
      entry({ address: 1, name: 'B' }),
      entry({ address: 2, name: 'C' }),
    ];
    const result = reorderEntries(entries, 0, 2, false);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.entries.map(e => e.name)).toEqual(['B', 'C', 'A']);
    expect(result.entries.map(e => e.address)).toEqual([0, 1, 2]);
  });

  it('refuses to move a Register across the Read-Only/Read-Write boundary', () => {
    const entries = [
      entry({ address: 0, name: 'RO', accessPermit: DataAccessPermit.READ_ONLY }),
      entry({ address: 1, name: 'RW', accessPermit: DataAccessPermit.READ_WRITE }),
    ];
    const result = reorderEntries(entries, 0, 1, true);
    expect(result).toEqual({ kind: 'error', error: expect.stringContaining('boundary') });
  });

  it('keeps an array entry together when it moves', () => {
    const entries = [
      entry({ address: 0, name: 'ARR[0]', isArray: true, arraySize: 2 }),
      entry({ address: 1, name: 'ARR[1]', isArray: true, arraySize: 2 }),
      entry({ address: 2, name: 'AFTER' }),
    ];
    const result = reorderEntries(entries, 0, 1, false);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.entries.map(e => e.name)).toEqual(['AFTER', 'ARR[0]', 'ARR[1]']);
  });
});

describe('extractMetadata', () => {
  it('collects unit, description and value list, keyed by base name', () => {
    const entries = [
      entry({ address: 0, name: 'A', unit: 'mm', description: 'Distance' }),
      entry({ address: 1, name: 'B' }),
    ];
    expect(extractMetadata(entries)).toEqual({ A: { unit: 'mm', description: 'Distance', valueList: undefined } });
  });

  it('omits entries with no metadata at all', () => {
    expect(extractMetadata([entry()])).toEqual({});
  });
});

describe('applyMetadata', () => {
  it('merges unit, description and value list by base name, leaving unlisted entries untouched', () => {
    const entries = [entry({ address: 0, name: 'SPEED' }), entry({ address: 1, name: 'OTHER' })];
    const result = applyMetadata(entries, { SPEED: { unit: 'rpm', description: 'Spindle speed' } });
    expect(result[0]).toMatchObject({ unit: 'rpm', description: 'Spindle speed' });
    expect(result[1]).toEqual(entries[1]);
  });

  it('matches array elements by their shared base name', () => {
    const entries = [entry({ address: 0, name: 'IP[0]', isArray: true, arraySize: 4 })];
    const result = applyMetadata(entries, { IP: { unit: 'octet' } });
    expect(result[0].unit).toBe('octet');
  });
});

describe('isRegisterOrderValid', () => {
  it('accepts read-only entries listed before read-write ones', () => {
    const entries = [
      entry({ accessPermit: DataAccessPermit.READ_ONLY }),
      entry({ accessPermit: DataAccessPermit.READ_WRITE }),
    ];
    expect(isRegisterOrderValid(entries)).toBe(true);
  });

  it('rejects a read-only entry following a read-write one', () => {
    const entries = [
      entry({ accessPermit: DataAccessPermit.READ_WRITE }),
      entry({ accessPermit: DataAccessPermit.READ_ONLY }),
    ];
    expect(isRegisterOrderValid(entries)).toBe(false);
  });
});
