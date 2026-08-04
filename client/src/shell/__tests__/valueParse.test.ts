import { describe, it, expect } from 'vitest';
import { DataForm } from '../../maps/mapParser';
import { int32ToFloat } from '../../utils/floatConversion';
import { editableEntryValue } from '../valueFormat';
import type { DisplayFormat } from '../valueFormat';
import { parseEntryValue } from '../valueParse';

/**
 * What reaches the Device when someone types a value.
 *
 * This is the failure that is silent and expensive: a wrong value written to
 * live hardware looks like a successful interaction. Nothing on screen says the
 * spindle was set to 4 294 967 295 rather than -1, and the board acts on it
 * either way. Every rule below is pinned rather than described.
 */

const ok = (result: ReturnType<typeof parseEntryValue>): number => {
  if (!result.ok) throw new Error(`expected a value, got error: ${result.error}`);
  return result.raw;
};

describe('parseEntryValue — decimal', () => {
  it('reads a signed entry as signed', () => {
    expect(ok(parseEntryValue('-1', DataForm.INT, 'decimal'))).toBe(-1);
    expect(ok(parseEntryValue('2147483647', DataForm.INT, 'decimal'))).toBe(2147483647);
  });

  it('reads an unsigned entry as unsigned, and hands over the same bits', () => {
    // 4294967295 and -1 are the same thirty-two bits. The transport takes a
    // signed word, so the unsigned reading has to arrive as its signed twin —
    // handing over 4294967295 is refused at the boundary rather than written.
    expect(ok(parseEntryValue('4294967295', DataForm.UINT, 'decimal'))).toBe(-1);
    expect(ok(parseEntryValue('3000000000', DataForm.UINT, 'decimal'))).toBe(-1294967296);
  });

  it('encodes a float entry as its IEEE-754 word, not as an integer', () => {
    // Sending 3 for "3.14159274" would set the register to a number a billion
    // times smaller than asked for, and the Device would accept it.
    expect(ok(parseEntryValue('3.14159274', DataForm.FLOAT, 'decimal'))).toBe(0x40490fdb | 0);
    expect(ok(parseEntryValue('0', DataForm.FLOAT, 'decimal'))).toBe(0);
  });

  it('rounds a float to the nearest the entry can hold, and nothing further', () => {
    expect(int32ToFloat(ok(parseEntryValue('3.142', DataForm.FLOAT, 'decimal'))))
      .toBe(Math.fround(3.142));
  });

  it('refuses a fraction for an integer entry rather than truncating it', () => {
    // Truncating 1.9 to 1 writes a value nobody asked for, and looks like it
    // worked.
    expect(parseEntryValue('1.9', DataForm.INT, 'decimal').ok).toBe(false);
  });

  it('refuses a value the type cannot hold', () => {
    expect(parseEntryValue('2147483648', DataForm.INT, 'decimal').ok).toBe(false);
    expect(parseEntryValue('-1', DataForm.UINT, 'decimal').ok).toBe(false);
    expect(parseEntryValue('4294967296', DataForm.UINT, 'decimal').ok).toBe(false);
  });

  it('refuses what is not a number at all', () => {
    expect(parseEntryValue('', DataForm.INT, 'decimal').ok).toBe(false);
    expect(parseEntryValue('   ', DataForm.INT, 'decimal').ok).toBe(false);
    expect(parseEntryValue('twelve', DataForm.INT, 'decimal').ok).toBe(false);
    expect(parseEntryValue('0x1F', DataForm.INT, 'decimal').ok).toBe(false);
  });

  it('accepts scientific notation for a float entry', () => {
    expect(ok(parseEntryValue('1.5e-3', DataForm.FLOAT, 'decimal'))).toBe(
      ok(parseEntryValue('0.0015', DataForm.FLOAT, 'decimal'))
    );
  });

  it('refuses a float too large for the thirty-two bits it has to travel in', () => {
    expect(parseEntryValue('1e40', DataForm.FLOAT, 'decimal').ok).toBe(false);
  });
});

describe('parseEntryValue — hexadecimal and binary', () => {
  it('takes hexadecimal as the raw word, whatever the entry type says', () => {
    // Switching a Pane to hexadecimal is asking to work in raw words. A float
    // entry's field shows its bit pattern there, so that is what typing into it
    // means.
    expect(ok(parseEntryValue('0x40490FDB', DataForm.FLOAT, 'hexadecimal'))).toBe(0x40490fdb | 0);
    expect(ok(parseEntryValue('0x0000002A', DataForm.UINT, 'hexadecimal'))).toBe(42);
    expect(ok(parseEntryValue('FFFFFFFF', DataForm.UINT, 'hexadecimal'))).toBe(-1);
  });

  it('accepts hexadecimal with or without the prefix it is displayed with', () => {
    expect(ok(parseEntryValue('2a', DataForm.UINT, 'hexadecimal'))).toBe(42);
    expect(ok(parseEntryValue('0x2A', DataForm.UINT, 'hexadecimal'))).toBe(42);
  });

  it('takes binary as the raw word, spaces and all', () => {
    // The Pane groups bits in nibbles, so the field being edited contains those
    // spaces. Rejecting them would make the displayed value unwritable.
    expect(ok(parseEntryValue('0000 0000 0000 0000 0000 0000 0010 1010', DataForm.UINT, 'binary')))
      .toBe(42);
    expect(ok(parseEntryValue('101010', DataForm.UINT, 'binary'))).toBe(42);
  });

  it('refuses more than thirty-two bits', () => {
    expect(parseEntryValue('0x1FFFFFFFF', DataForm.UINT, 'hexadecimal').ok).toBe(false);
    expect(parseEntryValue('1'.repeat(33), DataForm.UINT, 'binary').ok).toBe(false);
  });

  it('refuses digits that do not belong to the base', () => {
    expect(parseEntryValue('12G4', DataForm.UINT, 'hexadecimal').ok).toBe(false);
    expect(parseEntryValue('1021', DataForm.UINT, 'binary').ok).toBe(false);
  });
});

describe('what reaches the transport', () => {
  const CASES: ReadonlyArray<readonly [string, DataForm, DisplayFormat]> = [
    ['-1', DataForm.INT, 'decimal'],
    ['4294967295', DataForm.UINT, 'decimal'],
    ['3.142', DataForm.FLOAT, 'decimal'],
    ['0xFFFFFFFF', DataForm.UINT, 'hexadecimal'],
    ['0x80000000', DataForm.INT, 'hexadecimal'],
    ['1'.repeat(32), DataForm.UINT, 'binary'],
  ];

  it.each(CASES)('%s (%s, %s) arrives as a signed 32-bit word', (input, type, format) => {
    // `write_register` takes an `i32`. A value above 2147483647 does not
    // deserialise into one, so an unsigned reading handed over as-is never
    // reaches the board at all — it fails at the boundary with a message about
    // types, a long way from the field that caused it.
    const raw = ok(parseEntryValue(input, type, format));
    expect(Number.isInteger(raw)).toBe(true);
    expect(raw).toBeGreaterThanOrEqual(-2147483648);
    expect(raw).toBeLessThanOrEqual(2147483647);
  });
});

describe('reading a value back and writing it again', () => {
  const TYPES = [DataForm.INT, DataForm.UINT, DataForm.FLOAT, DataForm.HEX] as const;
  const FORMATS: readonly DisplayFormat[] = ['decimal', 'hexadecimal', 'binary'];
  const WORDS = [0, 1, -1, 42, -42, 2147483647, -2147483648, 0x40490fdb | 0, 0x00800000];

  /**
   * The property that makes a prefilled write field safe: what the field starts
   * from is what committing it writes back.
   *
   * Without this every field on screen is a trap. A float register reading
   * 3.14159274 displays as "3.142", and a field seeded from the *display* would
   * write 3.142 back the moment someone pressed Enter on a value they had not
   * touched — a real change to the Device, produced by looking at it.
   */
  it.each(TYPES)('starts a write field from a value that writes back unchanged (%s)', type => {
    for (const format of FORMATS) {
      for (const word of WORDS) {
        // A float entry whose bits are not a number has no decimal reading to
        // seed from; that case is pinned separately below.
        if (type === DataForm.FLOAT && format === 'decimal' && !Number.isFinite(int32ToFloat(word))) {
          continue;
        }
        const seeded = editableEntryValue(word, type, format);
        const result = parseEntryValue(seeded, type, format);
        const where = `${type} ${format} ${word} → "${seeded}"`;
        expect(result.ok, where).toBe(true);
        expect(ok(result), where).toBe(word);
      }
    }
  });

  it('keeps negative zero distinct from zero', () => {
    // They are different words. Seeding the field as "0" would turn one into the
    // other on a commit the user believed changed nothing.
    const negativeZero = 0x80000000 | 0;
    const seeded = editableEntryValue(negativeZero, DataForm.FLOAT, 'decimal');
    expect(ok(parseEntryValue(seeded, DataForm.FLOAT, 'decimal'))).toBe(negativeZero);
  });

  it.each([
    ['not a number', 0xffffffff | 0],
    ['infinity', 0x7f800000],
  ])('refuses to commit a float reading %s rather than writing a different word', (_label, word) => {
    // Neither has a decimal reading that survives being written back — the
    // nearest thing is the canonical NaN, which is a *different* word. The field
    // shows what the register holds and refuses the commit, so the way to edit
    // one of these is to switch the Pane to hexadecimal, where every bit
    // survives.
    const seeded = editableEntryValue(word, DataForm.FLOAT, 'decimal');
    expect(parseEntryValue(seeded, DataForm.FLOAT, 'decimal').ok).toBe(false);

    expect(ok(parseEntryValue(editableEntryValue(word, DataForm.FLOAT, 'hexadecimal'), DataForm.FLOAT, 'hexadecimal')))
      .toBe(word);
  });
});
