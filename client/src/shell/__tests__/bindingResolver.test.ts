import { describe, it, expect } from 'vitest';
import { DataAccessPermit, DataForm } from '../../maps/mapParser';
import type { MapEntry } from '../../maps/mapParser';
import { isBindingDrifted, resolveBinding } from '../bindingResolver';
import { snapshotFromEntry } from '../bindingIdentity';

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

describe('resolveBinding', () => {
  it('reports unchanged when name, address and shape all still match', () => {
    const current = entry({ address: 5, name: 'MOTOR_TEMP', type: DataForm.FLOAT });
    const snapshot = snapshotFromEntry(current);
    expect(resolveBinding(snapshot, 5, [current])).toEqual({ kind: 'unchanged' });
  });

  it('reports moved when a pure reorder repoints the same name to a different address', () => {
    const snapshot = snapshotFromEntry(entry({ address: 5, name: 'MOTOR_TEMP' }));
    const movedEntry = entry({ address: 9, name: 'MOTOR_TEMP' });
    // Address 5 now holds whatever moved into that slot.
    const entries = [entry({ address: 5, name: 'SOMETHING_ELSE' }), movedEntry];
    expect(resolveBinding(snapshot, 5, entries)).toEqual({ kind: 'moved', to: movedEntry });
  });

  it('reports moved when an earlier entry deleted upstream shifts every later address down, vacating the old one entirely', () => {
    // Mirrors mapParser.ts's own sequential, no-gaps addressing: deleting
    // an earlier entry re-addresses everything after it, so the old
    // address is not "replaced by something else" — it simply no longer
    // exists in the entry list at all. This is the routine case, not a
    // rare one, and must still resolve to 'moved', not fall through to a
    // bare "nothing here" the way a literal address-first lookup would.
    const snapshot = snapshotFromEntry(entry({ address: 5, name: 'MOTOR_TEMP' }));
    const movedEntry = entry({ address: 4, name: 'MOTOR_TEMP' });
    const entries = [entry({ address: 0, name: 'A' }), entry({ address: 1, name: 'B' }), entry({ address: 2, name: 'C' }), entry({ address: 3, name: 'D' }), movedEntry];
    expect(resolveBinding(snapshot, 5, entries)).toEqual({ kind: 'moved', to: movedEntry });
  });

  it('reports removed when the deleted entry leaves nothing to replace it', () => {
    const snapshot = snapshotFromEntry(entry({ address: 5, name: 'MOTOR_TEMP' }));
    expect(resolveBinding(snapshot, 5, [entry({ address: 0, name: 'OTHER' })])).toEqual({ kind: 'removed' });
  });

  it('reports removed when the old name is gone even though something else now occupies the address', () => {
    const snapshot = snapshotFromEntry(entry({ address: 5, name: 'MOTOR_TEMP' }));
    const entries = [entry({ address: 5, name: 'REPLACEMENT' })];
    expect(resolveBinding(snapshot, 5, entries)).toEqual({ kind: 'removed' });
  });

  it('reports type-changed when the type widened at the same name and address', () => {
    const snapshot = snapshotFromEntry(entry({ address: 5, name: 'MOTOR_TEMP', type: DataForm.INT }));
    const entries = [entry({ address: 5, name: 'MOTOR_TEMP', type: DataForm.FLOAT })];
    expect(resolveBinding(snapshot, 5, entries)).toEqual({ kind: 'type-changed' });
  });

  it('reports type-changed when the array size changed at the same name and address', () => {
    const snapshot = snapshotFromEntry(entry({ address: 5, name: 'IP', isArray: true, arraySize: 4 }));
    const entries = [entry({ address: 5, name: 'IP', isArray: true, arraySize: 6 })];
    expect(resolveBinding(snapshot, 5, entries)).toEqual({ kind: 'type-changed' });
  });

  it('asserts rather than silently picking one when a name matches more than one entry', () => {
    const snapshot = snapshotFromEntry(entry({ address: 5, name: 'DUPE' }));
    const entries = [entry({ address: 5, name: 'DUPE' }), entry({ address: 6, name: 'DUPE' })];
    expect(() => resolveBinding(snapshot, 5, entries)).toThrow();
  });
});

describe('isBindingDrifted', () => {
  it('is false when there is no snapshot to check — nothing to diff', () => {
    expect(isBindingDrifted(null, 5, [entry({ address: 5 })])).toBe(false);
    expect(isBindingDrifted(undefined, 5, [entry({ address: 5 })])).toBe(false);
  });

  it('is false when the resolution is unchanged', () => {
    const current = entry({ address: 5, name: 'MOTOR_TEMP' });
    expect(isBindingDrifted(snapshotFromEntry(current), 5, [current])).toBe(false);
  });

  it('is true for moved, removed, and type-changed alike', () => {
    const snapshot = snapshotFromEntry(entry({ address: 5, name: 'MOTOR_TEMP' }));
    expect(isBindingDrifted(snapshot, 5, [entry({ address: 9, name: 'MOTOR_TEMP' })])).toBe(true); // moved
    expect(isBindingDrifted(snapshot, 5, [entry({ address: 0, name: 'OTHER' })])).toBe(true); // removed
    expect(
      isBindingDrifted(snapshot, 5, [entry({ address: 5, name: 'MOTOR_TEMP', type: DataForm.FLOAT })])
    ).toBe(true); // type-changed
  });

  it('is true even when nothing at all occupies the stored address any more — the shifted-address case', () => {
    const snapshot = snapshotFromEntry(entry({ address: 5, name: 'MOTOR_TEMP' }));
    const entries = [entry({ address: 0, name: 'A' }), entry({ address: 4, name: 'MOTOR_TEMP' })];
    expect(isBindingDrifted(snapshot, 5, entries)).toBe(true);
  });
});
