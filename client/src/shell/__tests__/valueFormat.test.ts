import { describe, it, expect } from 'vitest';
import { DataForm } from '../../maps/mapParser';
import { decodeValue, formatEntryValue, toHexAddress } from '../valueFormat';

describe('formatEntryValue', () => {
  it('reads a signed entry as signed and an unsigned one as unsigned', () => {
    // The same 32 bits mean two different numbers depending on the Map's type,
    // and reading one as the other is off by four billion.
    expect(formatEntryValue(-1, DataForm.INT, 'decimal')).toBe('-1');
    expect(formatEntryValue(-1, DataForm.UINT, 'decimal')).toBe('4294967295');
  });

  it('decodes a float entry from its bit pattern rather than showing the bits', () => {
    // Floats travel as their IEEE-754 word. Printing that word as an integer
    // shows 1078530011 where the Device means 3.142.
    expect(formatEntryValue(1078530011, DataForm.FLOAT, 'decimal')).toBe('3.142');
  });

  it('shows hexadecimal at a fixed width, so a column cannot shift', () => {
    expect(formatEntryValue(42, DataForm.UINT, 'hexadecimal')).toBe('0x0000002A');
    expect(formatEntryValue(-1, DataForm.INT, 'hexadecimal')).toBe('0xFFFFFFFF');
    expect(formatEntryValue(0, DataForm.UINT, 'hexadecimal')).toHaveLength(
      formatEntryValue(-1, DataForm.INT, 'hexadecimal').length
    );
  });

  it('shows all thirty-two bits, grouped, whatever the value', () => {
    expect(formatEntryValue(5, DataForm.UINT, 'binary')).toBe(
      '0000 0000 0000 0000 0000 0000 0000 0101'
    );
    expect(formatEntryValue(0, DataForm.UINT, 'binary')).toHaveLength(
      formatEntryValue(-1, DataForm.INT, 'binary').length
    );
  });

  it('shows a float entry as its raw word in hexadecimal and binary', () => {
    // The point of switching a Pane to hexadecimal is to see what is actually
    // on the wire. Formatting the decoded float as hex would be a fiction.
    expect(formatEntryValue(1078530011, DataForm.FLOAT, 'hexadecimal')).toBe('0x40490FDB');
  });
});

describe('toHexAddress', () => {
  it('pads an address to the width the address space actually has', () => {
    // A Map cannot declare an address above 65535, so eight digits would be four
    // leading zeroes on every entry in every Profile.
    expect(toHexAddress(42)).toBe('0x002A');
    expect(toHexAddress(65535)).toBe('0xFFFF');
    expect(toHexAddress(0)).toHaveLength(toHexAddress(65535).length);
  });
});

describe('decodeValue', () => {
  it('states every reading of one word at once', () => {
    const decoded = decodeValue(1078530011, DataForm.FLOAT);
    expect(decoded.decimal).toBe('3.142');
    expect(decoded.hexadecimal).toBe('0x40490FDB');
    expect(decoded.binary).toBe('0100 0000 0100 1001 0000 1111 1101 1011');
    expect(decoded.float).toBe('3.142');
  });

  it('offers the float reading of an integer entry too', () => {
    // An Engineer who suspects a register is carrying a float the Map calls an
    // int needs to see that reading without editing the Map to find out.
    const decoded = decodeValue(1078530011, DataForm.INT);
    expect(decoded.decimal).toBe('1078530011');
    expect(decoded.float).toBe('3.142');
  });

  it('reports a bit pattern that is not a number as one, rather than inventing a value', () => {
    const decoded = decodeValue(0x7fc00000, DataForm.INT);
    expect(decoded.float).toBe('NaN');
  });
});
