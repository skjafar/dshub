import { describe, it, expect } from 'vitest';
import { rangeFraction } from '../numberRange';

describe('rangeFraction', () => {
  it('reads 0 at the minimum and 1 at the maximum', () => {
    expect(rangeFraction(0, 0, 200)).toBe(0);
    expect(rangeFraction(200, 0, 200)).toBe(1);
  });

  it('reads the proportional position in between', () => {
    expect(rangeFraction(50, 0, 200)).toBeCloseTo(0.25);
  });

  it('clamps a value below the minimum to 0, not a negative fraction', () => {
    expect(rangeFraction(-40, 0, 200)).toBe(0);
  });

  it('clamps a value above the maximum to 1, not a fraction past it', () => {
    expect(rangeFraction(500, 0, 200)).toBe(1);
  });

  it('handles a min/max range that does not start at zero', () => {
    expect(rangeFraction(150, 100, 200)).toBeCloseTo(0.5);
  });

  it('returns 0 rather than dividing by zero when min equals max', () => {
    expect(rangeFraction(5, 10, 10)).toBe(0);
  });
});
