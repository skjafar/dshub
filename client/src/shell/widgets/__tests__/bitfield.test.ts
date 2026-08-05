import { describe, it, expect } from 'vitest';
import { bitsOf } from '../bitfield';

describe('bitsOf', () => {
  it('reads every bit of zero as unset', () => {
    expect(bitsOf(0)).toEqual(Array(32).fill(false));
  });

  it('reads bit 0 from the least-significant bit', () => {
    const bits = bitsOf(0b1);
    expect(bits[0]).toBe(true);
    expect(bits.slice(1)).toEqual(Array(31).fill(false));
  });

  it('reads several set bits at their own positions', () => {
    const bits = bitsOf(0b1010);
    expect(bits[1]).toBe(true);
    expect(bits[3]).toBe(true);
    expect(bits[0]).toBe(false);
    expect(bits[2]).toBe(false);
  });

  it('reads bit 31 — the sign bit of a signed 32-bit read — without going negative', () => {
    const bits = bitsOf(0x80000000);
    expect(bits[31]).toBe(true);
    expect(bits.slice(0, 31)).toEqual(Array(31).fill(false));
  });

  it('always returns exactly 32 entries, one per bit of a Device word', () => {
    expect(bitsOf(0xffffffff)).toHaveLength(32);
  });
});
