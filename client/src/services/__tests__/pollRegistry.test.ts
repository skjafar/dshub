import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PollRegistry } from '../pollRegistry';

describe('PollRegistry', () => {
  let reads: Array<[string, number]>;
  let registry: PollRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    reads = [];
    registry = new PollRegistry();
    registry.setReader((source, address) => reads.push([source, address]));
    registry.setEnabled(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not poll while disconnected', () => {
    registry.setEnabled(false);
    registry.subscribe({ source: 'register', address: 1, name: 'A' }, 100);
    vi.advanceTimersByTime(1000);
    expect(reads).toHaveLength(0);
  });

  it('reads once immediately on subscribe so a new widget is not blank', () => {
    registry.subscribe({ source: 'register', address: 1, name: 'A' }, 1000);
    expect(reads).toEqual([['register', 1]]);
  });

  it('issues one read per address regardless of subscriber count', () => {
    // The behaviour this class exists for: ten widgets watching one register
    // previously produced ten round-trips per interval.
    for (let i = 0; i < 10; i++) {
      registry.subscribe({ source: 'register', address: 7, name: 'SPEED' }, 500);
    }
    reads.length = 0;

    vi.advanceTimersByTime(500);
    expect(reads).toEqual([['register', 7]]);

    vi.advanceTimersByTime(500);
    expect(reads).toHaveLength(2);
  });

  it('treats the same address on different sources as distinct', () => {
    registry.subscribe({ source: 'register', address: 2, name: 'R' }, 500);
    registry.subscribe({ source: 'parameter', address: 2, name: 'P' }, 500);
    reads.length = 0;

    vi.advanceTimersByTime(500);
    expect(reads).toHaveLength(2);
    expect(reads).toContainEqual(['register', 2]);
    expect(reads).toContainEqual(['parameter', 2]);
  });

  it('polls each address at its own requested rate', () => {
    registry.subscribe({ source: 'register', address: 1, name: 'FAST' }, 100);
    registry.subscribe({ source: 'register', address: 2, name: 'SLOW' }, 1000);
    reads.length = 0;

    vi.advanceTimersByTime(1000);

    const fast = reads.filter(([, a]) => a === 1).length;
    const slow = reads.filter(([, a]) => a === 2).length;
    // The slow address must not be dragged up to the fast address's rate.
    expect(fast).toBeGreaterThanOrEqual(9);
    expect(slow).toBe(1);
  });

  it('uses the fastest requested interval when one address has several subscribers', () => {
    registry.subscribe({ source: 'register', address: 3, name: 'X' }, 1000);
    registry.subscribe({ source: 'register', address: 3, name: 'X' }, 100);
    reads.length = 0;

    vi.advanceTimersByTime(500);
    expect(reads.length).toBeGreaterThanOrEqual(4);
  });

  it('stops polling an address once its last subscriber unsubscribes', () => {
    const off1 = registry.subscribe({ source: 'register', address: 4, name: 'X' }, 100);
    const off2 = registry.subscribe({ source: 'register', address: 4, name: 'X' }, 100);

    off1();
    reads.length = 0;
    vi.advanceTimersByTime(300);
    expect(reads.length).toBeGreaterThan(0); // still one subscriber

    off2();
    reads.length = 0;
    vi.advanceTimersByTime(300);
    expect(reads).toHaveLength(0);
  });

  it('stops all polling when the device disconnects', () => {
    registry.subscribe({ source: 'register', address: 5, name: 'X' }, 100);
    reads.length = 0;

    registry.setEnabled(false);
    vi.advanceTimersByTime(1000);
    expect(reads).toHaveLength(0);
  });

  it('reports the number of distinct addresses being polled', () => {
    registry.subscribe({ source: 'register', address: 1, name: 'A' }, 500);
    registry.subscribe({ source: 'register', address: 1, name: 'A' }, 500);
    registry.subscribe({ source: 'register', address: 2, name: 'B' }, 500);
    expect(registry.activeAddressCount).toBe(2);
  });

  it('clamps interval requests below the floor', () => {
    registry.subscribe({ source: 'register', address: 6, name: 'X' }, 1);
    expect(registry.effectiveIntervalMs).toBeGreaterThanOrEqual(50);
  });
});
