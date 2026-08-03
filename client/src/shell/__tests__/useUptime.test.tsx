// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useUptime } from '../useUptime';

afterEach(cleanup);

describe('useUptime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T08:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('reports nothing while the link is down', () => {
    const { result } = renderHook(() => useUptime(false));
    expect(result.current).toBeNull();
  });

  it('counts from the moment the link came up', () => {
    const { result } = renderHook(({ up }) => useUptime(up), {
      initialProps: { up: true },
    });
    expect(result.current).toBe(0);

    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current).toBe(5);
  });

  it('starts again from zero on a new connection', () => {
    const { result, rerender } = renderHook(({ up }) => useUptime(up), {
      initialProps: { up: true },
    });
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(result.current).toBe(30);

    rerender({ up: false });
    expect(result.current).toBeNull();

    rerender({ up: true });
    expect(result.current).toBe(0);
  });

  it('reads the clock rather than counting ticks', () => {
    // A tab in the background has its timers throttled. A counter incremented
    // once per tick would under-report; wall-clock arithmetic does not.
    const { result } = renderHook(() => useUptime(true));

    act(() => {
      // A minute of wall clock passes while only one tick is delivered.
      // `advanceTimersByTime` moves the clock too, so land on 08:00:59 and let
      // the single tick carry it to the minute.
      vi.setSystemTime(new Date('2026-08-03T08:00:59Z'));
      vi.advanceTimersByTime(1_000);
    });

    expect(result.current).toBe(60);
  });
});
