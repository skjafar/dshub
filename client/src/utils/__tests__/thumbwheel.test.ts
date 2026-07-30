import { describe, it, expect } from 'vitest';
import {
  formatForThumbwheel,
  initialFractionDigits,
  getDigitPositions,
  isScientificDisplay,
  FLOAT_MAX_FRACTION_DIGITS,
} from '../thumbwheel';
import { VALUE_DECIMALS, formatFractional } from '../numberFormat';
import { parseWriteInput } from '../writeInputParse';

describe('prefetched write-field display', () => {
  it('starts a float field at the app-wide display precision', () => {
    // A write field showing a prefetched value must read the same as the
    // read-only display of that value.
    expect(initialFractionDigits(1.5)).toBe(VALUE_DECIMALS);
    expect(initialFractionDigits(1.23456789)).toBe(VALUE_DECIMALS);
    expect(formatForThumbwheel(1.5, 'decimalFloat', initialFractionDigits(1.5))).toBe('1.500');
    expect(formatForThumbwheel(1.23456789, 'decimalFloat', initialFractionDigits(1.23456789))).toBe('1.235');
  });

  it('matches the read-only formatter for ordinary values', () => {
    for (const v of [0, 1.5, -7.25, 1234.5678, 0.001]) {
      const field = formatForThumbwheel(v, 'decimalFloat', initialFractionDigits(v));
      expect(field, `value ${v}`).toBe(formatFractional(v));
    }
  });

  it('falls back to scientific below the display precision instead of showing 0.000', () => {
    expect(formatForThumbwheel(1e-5, 'decimalFloat', VALUE_DECIMALS)).toBe('1.0000e-5');
    expect(formatForThumbwheel(-2.5e-7, 'decimalFloat', VALUE_DECIMALS)).toBe('-2.5000e-7');
    expect(formatForThumbwheel(0, 'decimalFloat', VALUE_DECIMALS)).toBe('0.000');
  });

  it('leaves integer and hex/binary fields untouched', () => {
    expect(formatForThumbwheel(42, 'decimalInt')).toBe('42');
    expect(formatForThumbwheel(255, 'hex')).toBe('0xFF');
    expect(formatForThumbwheel(5, 'binary')).toBe('0b101');
  });

  it('still allows elastic growth past the starting width', () => {
    expect(FLOAT_MAX_FRACTION_DIGITS).toBeGreaterThan(VALUE_DECIMALS);
  });
});

describe('scientific displays are not digit-editable', () => {
  it('detects scientific notation', () => {
    expect(isScientificDisplay('1.0000e-5')).toBe(true);
    expect(isScientificDisplay('-2.5000E+3')).toBe(true);
    expect(isScientificDisplay('1.235')).toBe(false);
  });

  it('exposes no digit positions for a scientific value', () => {
    // Otherwise the odometer would treat the exponent's characters as fraction
    // digits, so Up/Down on "1.0000e-5" would step the 'e' or the sign.
    expect(getDigitPositions('1.0000e-5', 'decimalFloat')).toEqual([]);
    expect(getDigitPositions('-2.5000e-7', 'decimalFloat')).toEqual([]);
  });

  it('still exposes digit positions for ordinary decimals', () => {
    expect(getDigitPositions('1.235', 'decimalFloat').length).toBe(4);
    expect(getDigitPositions('42', 'decimalInt').length).toBe(2);
  });

  it('keeps hex digits editable even when they contain "e"', () => {
    // 'E' is a hex digit, not an exponent marker.
    expect(getDigitPositions('0x1E', 'hex').length).toBe(2);
  });
});

describe('round trip through the write parser', () => {
  it('parses every prefetched display back to the value it came from', () => {
    // A prefetched field must remain submittable — including in scientific form.
    for (const v of [0, 1.5, -7.25, 1e-5, -2.5e-7, 1234.5678]) {
      const display = formatForThumbwheel(v, 'decimalFloat', initialFractionDigits(v));
      const parsed = parseWriteInput(display, 'decimal');
      expect(parsed.ok, `display "${display}"`).toBe(true);
      if (parsed.ok) {
        // Rounded to the displayed precision, but never mangled or zeroed.
        expect(Number.isFinite(parsed.value)).toBe(true);
        if (v !== 0) expect(parsed.value).not.toBe(0);
        expect(Math.sign(parsed.value)).toBe(Math.sign(v));
      }
    }
  });
});
