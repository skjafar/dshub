import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import { InterfaceType } from '../../types/shared';
import {
  MAX_RETAINED_POINTS,
  __resetPlotStreamForTests,
  bufferOf,
  claimSeries,
  ownerOf,
  releaseSeries,
  retainSeriesFor,
} from '../plotStream';

/**
 * Exclusive series ownership and point acquisition, driven through the fake
 * port.
 *
 * The backend keys a running plot stream by name alone, with no notion of
 * which Pane asked for it — see `plotStream.ts`'s own docblock. What is pinned
 * here is the guard this module adds on top of that: a name belongs to one
 * Pane at a time, a second Pane is refused rather than silently sharing it,
 * and releasing on behalf of a Pane that never owned it is a no-op rather
 * than a way to steal another Pane's series.
 */

const SPINDLE_RPM = { name: 'SPINDLE_RPM', source: 'register' as const, address: 10 };

async function connected() {
  const port = createFakeBackendPort({ deliver: fn => fn() });
  await port.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
  return port;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  __resetPlotStreamForTests();
  vi.useRealTimers();
});

describe('claimSeries', () => {
  it('claims an unclaimed series and starts the Device stream for it', async () => {
    const port = await connected();
    const started = vi.spyOn(port.device, 'startPlotting');

    const claimed = claimSeries(port, 'plot#1', SPINDLE_RPM, 100);

    expect(claimed).toBe(true);
    expect(ownerOf('SPINDLE_RPM')).toBe('plot#1');
    expect(started).toHaveBeenCalledWith('SPINDLE_RPM', 100, 10);
  });

  it('starts a System Register through the System Register form', async () => {
    const port = await connected();
    const started = vi.spyOn(port.device, 'startPlottingSysRegister');

    claimSeries(port, 'plot#1', { name: 'FAULT_CODE', source: 'sysRegister', address: 4 }, 100);

    expect(started).toHaveBeenCalledWith('FAULT_CODE', 100, 4);
  });

  it('refuses a series another Pane already owns', async () => {
    const port = await connected();
    claimSeries(port, 'plot#1', SPINDLE_RPM, 100);

    const claimed = claimSeries(port, 'plot#2', SPINDLE_RPM, 100);

    expect(claimed).toBe(false);
    expect(ownerOf('SPINDLE_RPM')).toBe('plot#1');
  });

  it('lets the owning Pane re-claim its own series, restarting the stream at the new interval', async () => {
    const port = await connected();
    const started = vi.spyOn(port.device, 'startPlotting');
    claimSeries(port, 'plot#1', SPINDLE_RPM, 100);

    const claimed = claimSeries(port, 'plot#1', SPINDLE_RPM, 50);

    expect(claimed).toBe(true);
    expect(started).toHaveBeenLastCalledWith('SPINDLE_RPM', 50, 10);
  });
});

describe('releaseSeries', () => {
  it('stops the Device stream and frees the name for another Pane', async () => {
    const port = await connected();
    const stopped = vi.spyOn(port.device, 'stopPlotting');
    claimSeries(port, 'plot#1', SPINDLE_RPM, 100);

    releaseSeries(port, 'plot#1', 'SPINDLE_RPM');

    expect(stopped).toHaveBeenCalledWith('SPINDLE_RPM');
    expect(ownerOf('SPINDLE_RPM')).toBeUndefined();
    expect(claimSeries(port, 'plot#2', SPINDLE_RPM, 100)).toBe(true);
  });

  it('does nothing on behalf of a Pane that does not own the series', async () => {
    const port = await connected();
    claimSeries(port, 'plot#1', SPINDLE_RPM, 100);

    releaseSeries(port, 'plot#2', 'SPINDLE_RPM');

    expect(ownerOf('SPINDLE_RPM')).toBe('plot#1');
  });
});

describe('retainSeriesFor', () => {
  it('releases every claim held by a Pane no longer open, leaving the rest', async () => {
    const port = await connected();
    claimSeries(port, 'plot#1', SPINDLE_RPM, 100);
    claimSeries(port, 'plot#2', { name: 'COOLANT_TEMP', source: 'register', address: 2 }, 100);

    retainSeriesFor(port, ['plot#1']);

    expect(ownerOf('SPINDLE_RPM')).toBe('plot#1');
    expect(ownerOf('COOLANT_TEMP')).toBeUndefined();
  });

  it('leaves a still-open Pane’s claim alone — backgrounding is not closing', async () => {
    const port = await connected();
    claimSeries(port, 'plot#1', SPINDLE_RPM, 100);

    retainSeriesFor(port, ['plot#1', 'plot#2']);

    expect(ownerOf('SPINDLE_RPM')).toBe('plot#1');
  });
});

describe('bufferOf', () => {
  it('accumulates points the Device sends for a claimed series', async () => {
    const port = await connected();
    claimSeries(port, 'plot#1', SPINDLE_RPM, 50);

    await vi.advanceTimersByTimeAsync(160);

    const buffer = bufferOf('SPINDLE_RPM');
    expect(buffer?.x.length).toBeGreaterThanOrEqual(2);
    expect(buffer?.y.length).toBe(buffer?.x.length);
  });

  it('is undefined once nothing owns the series', async () => {
    const port = await connected();
    claimSeries(port, 'plot#1', SPINDLE_RPM, 50);
    await vi.advanceTimersByTimeAsync(60);

    releaseSeries(port, 'plot#1', 'SPINDLE_RPM');

    expect(bufferOf('SPINDLE_RPM')).toBeUndefined();
  });

  it('caps retained points so a long capture cannot grow without bound', async () => {
    const port = await connected();
    claimSeries(port, 'plot#1', SPINDLE_RPM, 10);

    // The floor on the fake's own poll interval is 10 ms — advancing well past
    // the cap in ticks, not wall-clock time, since these are fake timers.
    await vi.advanceTimersByTimeAsync((MAX_RETAINED_POINTS + 200) * 10);

    expect(bufferOf('SPINDLE_RPM')?.x.length).toBe(MAX_RETAINED_POINTS);
  });

  it('keeps bumping revision past the cap, where length alone stops moving', async () => {
    // A capped buffer evicts one old point for every new one, so `x.length`
    // pins at MAX_RETAINED_POINTS forever — PlotChart's redraw tick relies on
    // `revision` instead to tell a genuinely stale buffer from one that is
    // still sliding, and this is the case that would otherwise fool it.
    const port = await connected();
    claimSeries(port, 'plot#1', SPINDLE_RPM, 10);

    await vi.advanceTimersByTimeAsync((MAX_RETAINED_POINTS + 50) * 10);
    const revisionAtCap = bufferOf('SPINDLE_RPM')?.revision ?? 0;
    const lengthAtCap = bufferOf('SPINDLE_RPM')?.x.length;

    await vi.advanceTimersByTimeAsync(100 * 10);

    expect(bufferOf('SPINDLE_RPM')?.x.length).toBe(lengthAtCap);
    expect(bufferOf('SPINDLE_RPM')?.revision ?? 0).toBeGreaterThan(revisionAtCap);
  });
});
