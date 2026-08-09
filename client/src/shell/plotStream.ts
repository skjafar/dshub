/**
 * Live plot data acquisition, independent of any Plot Pane's own component
 * lifecycle.
 *
 * The backend keys a running plot stream by register name alone (see
 * `fakeBackendPort`'s `beginPlot`), with no notion of which Pane asked for it:
 * restarting an already-running series replaces it, and stopping it removes it
 * outright. Two Plot Panes plotting the same name would silently fight over the
 * poll interval, and closing either one would cut the other's data with no sign
 * anything happened. A name is therefore claimed by exactly one Pane at a time;
 * a second Pane is told plainly rather than left reading a trace that quietly
 * stopped.
 *
 * Retained points live here too, rather than inside a Plot Pane's own component
 * state. `paneRegistry.ts` already documents why that matters: dockview detaches
 * a Pane whose tab is not the visible one in its group, which unmounts its React
 * tree for reasons that have nothing to do with the user's intent. A capture
 * held in component state would be discarded the moment its tab is backgrounded.
 * Acquisition is subscribed once, here, and keeps running for as long as a Pane
 * anywhere owns the name — a Plot Pane only ever *reads* what has accumulated.
 */

import type { BackendPort } from '../services/backendPort';
import type { AddressSpace } from './addressSpace';

/** The two spaces the Device port can stream: `startPlotting` has no Parameter form. */
export type PlottableSpace = Extract<AddressSpace, 'register' | 'sysRegister'>;

export interface PlotSeriesRef {
  readonly name: string;
  readonly source: PlottableSpace;
  readonly address: number;
}

export interface PlotBuffer {
  readonly x: number[];
  readonly y: number[];
  /**
   * Bumped on every point appended, including once retention is capped and
   * old points are evicted one-for-one with new ones — unlike `x.length`,
   * which then stays pinned at {@link MAX_RETAINED_POINTS} forever. A reader
   * that needs to know whether a capped buffer actually changed since it last
   * looked (`PlotChart`'s redraw tick) has no other signal available: the
   * array's own length stops moving right when its content keeps sliding.
   */
  readonly revision: number;
}

/**
 * Hard cap on retained points per series, independent of the viewing Pane's own
 * time span. Matches `DEFAULT_SETTINGS.plotDefaults.maxDataPoints` — the figure
 * the application has already settled on as the balance between a useful
 * capture and unbounded memory.
 */
export const MAX_RETAINED_POINTS = 20_000;

const owners = new Map<string, string>(); // series name -> owning pane id
const buffers = new Map<string, { x: number[]; y: number[]; revision: number }>();

let subscribedPort: BackendPort | null = null;
let unlisten: (() => void) | null = null;

function bufferFor(name: string): { x: number[]; y: number[]; revision: number } {
  let buffer = buffers.get(name);
  if (!buffer) {
    buffer = { x: [], y: [], revision: 0 };
    buffers.set(name, buffer);
  }
  return buffer;
}

function append(name: string, x: number, y: number): void {
  // A point for a name nothing currently owns is one that arrived after its
  // Pane released it — the backend's response to a stop is not synchronous with
  // the request, so a handful of in-flight points can still land.
  if (!owners.has(name)) return;
  const buffer = bufferFor(name);
  buffer.x.push(x);
  buffer.y.push(y);
  if (buffer.x.length > MAX_RETAINED_POINTS) {
    const overflow = buffer.x.length - MAX_RETAINED_POINTS;
    buffer.x.splice(0, overflow);
    buffer.y.splice(0, overflow);
  }
  buffer.revision++;
}

/**
 * Subscribes to the port's `plotData` event exactly once per port identity.
 *
 * A fresh `port` (a new fake in each test, the one real port for the app's
 * whole lifetime otherwise) gets its own subscription; the previous one is torn
 * down first so two do not both feed the buffers.
 */
function ensureSubscribed(port: BackendPort): void {
  if (subscribedPort === port) return;
  unlisten?.();
  unlisten = null;
  subscribedPort = port;
  port.events
    .on('plotData', ({ seriesName, point }) => append(seriesName, point.x, point.y))
    .then(off => {
      // The port changed again while registration was in flight — leave the
      // newer subscription alone and drop this one immediately.
      if (subscribedPort !== port) {
        off();
        return;
      }
      unlisten = off;
    })
    .catch(console.error);
}

/**
 * Claims a series for a Pane and (re)starts the Device stream for it.
 *
 * Safe to call again for a name the same Pane already owns — restarting an
 * already-running series is how a changed poll interval takes effect, and the
 * backend replaces rather than doubles it. Returns `false`, claiming nothing,
 * when another Pane already owns the name.
 */
export function claimSeries(
  port: BackendPort,
  paneId: string,
  ref: PlotSeriesRef,
  pollIntervalMs: number
): boolean {
  const owner = owners.get(ref.name);
  if (owner !== undefined && owner !== paneId) return false;

  owners.set(ref.name, paneId);
  bufferFor(ref.name);
  ensureSubscribed(port);

  const start =
    ref.source === 'sysRegister' ? port.device.startPlottingSysRegister : port.device.startPlotting;
  start(ref.name, pollIntervalMs, ref.address).catch(console.error);
  return true;
}

/** Who owns a series, or `undefined` when nothing currently does. */
export function ownerOf(name: string): string | undefined {
  return owners.get(name);
}

/** Releases a Pane's claim on a series and stops the Device stream for it. */
export function releaseSeries(port: BackendPort, paneId: string, name: string): void {
  if (owners.get(name) !== paneId) return;
  owners.delete(name);
  buffers.delete(name);
  port.device.stopPlotting(name).catch(console.error);
}

/**
 * Releases every claim held by a Pane no longer open.
 *
 * Mirrors `retainPaneState` and `SelectionContext`'s `retainPanes`: called from
 * the shell whenever dockview's panel list changes, so a genuinely closed Pane's
 * series are freed for another Pane to plot, while a merely backgrounded one
 * keeps its claim and keeps accumulating.
 */
export function retainSeriesFor(port: BackendPort, openPaneIds: Iterable<string>): void {
  const open = new Set(openPaneIds);
  for (const [name, owner] of [...owners]) {
    if (!open.has(owner)) releaseSeries(port, owner, name);
  }
}

/** The points retained for a series, or `undefined` once nothing owns it. */
export function bufferOf(name: string): PlotBuffer | undefined {
  return buffers.get(name);
}

/**
 * Test-only reset. Component unmounts in a test do not go through
 * `retainSeriesFor` the way the real shell does, so state from one test would
 * otherwise leak into the next.
 */
export function __resetPlotStreamForTests(): void {
  unlisten?.();
  unlisten = null;
  subscribedPort = null;
  owners.clear();
  buffers.clear();
}
