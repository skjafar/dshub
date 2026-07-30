import { describe, it, expect } from 'vitest';
import {
  VALUE_DECIMALS,
  needsScientific,
  formatFractional,
  formatDeviceValue,
} from '../numberFormat';
import { isTinyFloat } from '../floatConversion';

describe('needsScientific', () => {
  it('is false for zero', () => {
    // 0 renders cleanly as 0.000; only non-zero values can be lost to rounding.
    expect(needsScientific(0)).toBe(false);
  });

  it('is true once a value would round away at the display precision', () => {
    expect(needsScientific(0.0009)).toBe(true);
    expect(needsScientific(-0.0009)).toBe(true);
    expect(needsScientific(1e-12)).toBe(true);
  });

  it('is false at and above the smallest representable value', () => {
    expect(needsScientific(0.001)).toBe(false);
    expect(needsScientific(0.01)).toBe(false);
    expect(needsScientific(1)).toBe(false);
    expect(needsScientific(-42.5)).toBe(false);
  });

  it('tracks a caller-supplied precision', () => {
    expect(needsScientific(0.005, 2)).toBe(true);
    expect(needsScientific(0.005, 3)).toBe(false);
  });

  it('is false for non-finite values', () => {
    expect(needsScientific(NaN)).toBe(false);
    expect(needsScientific(Infinity)).toBe(false);
  });
});

describe('isTinyFloat', () => {
  it('stays in lockstep with the display precision', () => {
    // The two used to be independent constants that could silently drift apart.
    for (const v of [0, 0.0001, 0.001, 0.0009999, 1, -0.0005]) {
      expect(isTinyFloat(v)).toBe(needsScientific(v));
    }
  });
});

describe('formatFractional', () => {
  it('shows three decimal places by default', () => {
    expect(VALUE_DECIMALS).toBe(3);
    expect(formatFractional(1.23456)).toBe('1.235');
    expect(formatFractional(42)).toBe('42.000');
    expect(formatFractional(-7.5)).toBe('-7.500');
  });

  it('keeps a third decimal that two would have dropped', () => {
    // The reported bug: plot statistics rounded to 2 places.
    expect(formatFractional(0.123)).toBe('0.123');
    expect(formatFractional(12.345)).toBe('12.345');
  });

  it('switches to scientific notation below the display precision', () => {
    expect(formatFractional(0.0001)).toBe('1.0000e-4');
    expect(formatFractional(-2.5e-7)).toBe('-2.5000e-7');
  });

  it('never renders a non-zero value as zero', () => {
    for (const v of [1e-4, 1e-9, -1e-5, 9.99e-4]) {
      expect(Number(formatFractional(v))).not.toBe(0);
    }
  });

  it('renders exact zero as plain zero', () => {
    expect(formatFractional(0)).toBe('0.000');
  });

  it('honours an explicit precision and forced scientific notation', () => {
    expect(formatFractional(1.23456, { decimals: 1 })).toBe('1.2');
    expect(formatFractional(1234, { scientific: true })).toBe('1.2340e+3');
  });

  it('passes through non-finite values rather than emitting NaN.000', () => {
    expect(formatFractional(NaN)).toBe('NaN');
    expect(formatFractional(Infinity)).toBe('Infinity');
  });
});

describe('formatDeviceValue', () => {
  it('leaves integer-typed values as integers', () => {
    // A uint32 counter padded to 1234.000 would be noise, not precision.
    expect(formatDeviceValue(1234, { isFloat: false })).toBe('1234');
    expect(formatDeviceValue(0, { isFloat: false })).toBe('0');
  });

  it('applies the fractional rule to float-typed values', () => {
    expect(formatDeviceValue(1.5, { isFloat: true })).toBe('1.500');
    expect(formatDeviceValue(1e-6, { isFloat: true })).toBe('1.0000e-6');
  });

  it('respects an explicitly configured precision even on integers', () => {
    expect(formatDeviceValue(5, { isFloat: false, decimals: 2 })).toBe('5.00');
  });

  it('respects forced scientific notation even on integers', () => {
    expect(formatDeviceValue(50000, { isFloat: false, scientific: true })).toBe('5.0000e+4');
  });
});
