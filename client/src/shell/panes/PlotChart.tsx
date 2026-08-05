import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { FONT_MONO } from '../../design/tokens';
import { seriesColorAt } from '../../design/dataColors';
import { bufferOf } from '../plotStream';
import styles from './PlotChart.module.css';

/**
 * How often the visible window is redrawn.
 *
 * Independent of poll interval, which can be as fast as 50 ms: without a
 * separate ticker, a slow series would only ever redraw when a point of its own
 * happened to arrive, and the window would visibly jump rather than scroll. 200
 * ms is frequent enough to read as continuous motion and infrequent enough that
 * redrawing costs nothing worth measuring.
 */
const REDRAW_INTERVAL_MS = 200;

/** Used only until the host has been measured at least once. */
const FALLBACK_SIZE = { width: 400, height: 240 };

// Monospace rather than the body face: canvas text has no `tabular-nums`, so a
// true fixed-width face is the only way a changing tick value does not jitter
// the axis width from one redraw to the next.
const AXIS_FONT = `11px ${FONT_MONO}`;

export interface PlotChartSeries {
  readonly name: string;
  readonly colorSlot: number;
  readonly visible: boolean;
}

export interface PlotChartProps {
  readonly series: readonly PlotChartSeries[];
  readonly mode: 'dark' | 'light';
  /** Axis, tick and label colour. Follows the theme rather than a fixed value. */
  readonly textColor: string;
  /** Gridline colour. Follows the theme rather than a fixed value. */
  readonly gridColor: string;
  /** Seconds of history the visible window shows. */
  readonly timeSpan: number;
  /** Freezes the visible window without stopping retention. */
  readonly paused: boolean;
}

function visibleOf(series: readonly PlotChartSeries[]): readonly PlotChartSeries[] {
  return series.filter(s => s.visible);
}

/** Builds one aligned table from independently-timestamped per-series buffers. */
function alignedDataFor(visible: readonly PlotChartSeries[]): uPlot.AlignedData {
  if (visible.length === 0) return [[]];
  if (visible.length === 1) {
    const buffer = bufferOf(visible[0].name);
    return [buffer?.x ?? [], buffer?.y ?? []];
  }
  const tables: uPlot.AlignedData[] = visible.map(s => {
    const buffer = bufferOf(s.name);
    return [buffer?.x ?? [], buffer?.y ?? []];
  });
  return uPlot.join(tables);
}

function buildOptions(
  width: number,
  height: number,
  visible: readonly PlotChartSeries[],
  mode: 'dark' | 'light',
  textColor: string,
  gridColor: string
): uPlot.Options {
  const axisLine: uPlot.Axis.Grid = { stroke: gridColor, width: 1 };
  return {
    width,
    height,
    padding: [8, 8, 0, 4],
    ms: 1e-3, // data.x is unix seconds, uPlot's own default — stated rather than left implicit
    scales: {
      x: { time: true },
    },
    axes: [
      { stroke: textColor, grid: axisLine, ticks: axisLine, font: AXIS_FONT },
      { stroke: textColor, grid: axisLine, ticks: axisLine, font: AXIS_FONT },
    ],
    legend: { show: false },
    cursor: { points: { show: false } },
    series: [
      {},
      ...visible.map(s => ({
        label: s.name,
        stroke: seriesColorAt(s.colorSlot, mode),
        width: 1.5,
        points: { show: false },
      })),
    ],
  };
}

/**
 * Live series, drawn imperatively.
 *
 * Retained points are read from `plotStream`, not held here and not passed
 * through props: a point arrives as often as every 50 ms, and routing each one
 * through React state would mean a render on every tick — precisely what this
 * ticket exists to avoid. This component only rebuilds its uPlot instance when
 * something *structural* changes (which series are shown, their colours, the
 * active theme); the data itself is pulled on a fixed redraw tick, decoupled
 * from both React's render cycle and the Device's own poll rate.
 */
export function PlotChart({
  series,
  mode,
  textColor,
  gridColor,
  timeSpan,
  paused,
}: PlotChartProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const sizeRef = useRef(FALLBACK_SIZE);
  const lastLengthsRef = useRef<Map<string, number>>(new Map());

  // Mirrored into refs so the redraw tick — set up once, on mount — always
  // reads the latest value rather than the one in scope when it was created.
  const timeSpanRef = useRef(timeSpan);
  const pausedRef = useRef(paused);
  const pausedAtRef = useRef<number | null>(null);
  const visibleRef = useRef<readonly PlotChartSeries[]>(visibleOf(series));

  useEffect(() => {
    timeSpanRef.current = timeSpan;
  }, [timeSpan]);

  useEffect(() => {
    visibleRef.current = visibleOf(series);
  }, [series]);

  useEffect(() => {
    pausedRef.current = paused;
    // The frozen instant is captured once, on the transition into pause — not
    // recomputed on every tick — so the window stays put rather than creeping
    // forward with whatever "now" happens to be at redraw time.
    if (paused) pausedAtRef.current = Date.now() / 1000;
  }, [paused]);

  // Structural rebuild: which series are visible, their colours, and the
  // theme. A rare, user-driven change, so destroying and recreating the uPlot
  // instance is the simplest correct thing — cheap next to the redraw tick
  // below, which is the path that actually has to stay fast.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const visible = visibleOf(series);
    const { width, height } = sizeRef.current;
    const options = buildOptions(width, height, visible, mode, textColor, gridColor);
    const chart = new uPlot(options, alignedDataFor(visible), host);
    chartRef.current = chart;
    lastLengthsRef.current.clear();

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [series, mode, textColor, gridColor]);

  // Resize: independent of the structural effect above, so a resize never
  // tears down and rebuilds the chart — only ever calls `setSize`.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      sizeRef.current = { width, height };
      chartRef.current?.setSize({ width, height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // The redraw tick: the one thing that runs on a fixed clock rather than in
  // response to a prop change. Rebuilding the aligned data table is skipped
  // unless a buffer's length actually changed since the last tick — cheap for
  // the common single-series case regardless, and what keeps a multi-series
  // Plot from re-joining tens of thousands of retained points many times a
  // second once history has built up.
  useEffect(() => {
    const id = setInterval(() => {
      const chart = chartRef.current;
      if (!chart) return;

      const effectiveNow = pausedRef.current ? (pausedAtRef.current ?? Date.now() / 1000) : Date.now() / 1000;
      const min = effectiveNow - timeSpanRef.current;

      let dirty = false;
      for (const s of visibleRef.current) {
        const length = bufferOf(s.name)?.x.length ?? 0;
        if (lastLengthsRef.current.get(s.name) !== length) {
          lastLengthsRef.current.set(s.name, length);
          dirty = true;
        }
      }

      chart.batch(() => {
        if (dirty) chart.setData(alignedDataFor(visibleRef.current), false);
        chart.setScale('x', { min, max: effectiveNow });
      });
    }, REDRAW_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return <div ref={hostRef} className={styles.host} />;
}
