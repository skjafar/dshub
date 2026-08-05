import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { FONT_MONO } from '../../design/tokens';
import { seriesColorAt } from '../../design/dataColors';
import { formatFractional } from '../../utils/numberFormat';
import { formatClockTime } from '../plotExport';
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

/** One wheel notch narrows or widens the visible window by this factor. */
const WHEEL_ZOOM_FACTOR = 1.15;

/** Floor on a zoomed window's width, so scrolling in cannot collapse it to nothing. */
const MIN_ZOOM_RANGE_S = 0.5;

export interface PlotChartSeries {
  readonly name: string;
  readonly colorSlot: number;
  readonly visible: boolean;
  /**
   * The raw wire word `plotStream` retains, decoded to the reading it
   * represents. `plotStream` deliberately stores exactly what the Device sent —
   * it has no notion of a Map or a type — so a float series' bit pattern is
   * only ever a float once this has run. Skipping it is the bug this type
   * exists to make impossible: a float register's raw int32 plotted as a plain
   * integer reads as a huge, unrelated number, not as that register's value.
   */
  readonly decode: (raw: number) => number;
}

export interface PlotChartProps {
  readonly series: readonly PlotChartSeries[];
  readonly mode: 'dark' | 'light';
  /** Axis, tick and label colour. Follows the theme rather than a fixed value. */
  readonly textColor: string;
  /** Gridline colour. Follows the theme rather than a fixed value. */
  readonly gridColor: string;
  /** Seconds of history the visible window shows, absent a manual zoom. */
  readonly timeSpan: number;
  /** Freezes the visible window without stopping retention. */
  readonly paused: boolean;
}

/** The X window a manual zoom or pan has set. `null` means "follow live/paused as usual". */
interface XWindow {
  readonly min: number;
  readonly max: number;
}

function visibleOf(series: readonly PlotChartSeries[]): readonly PlotChartSeries[] {
  return series.filter(s => s.visible);
}

/** Builds one aligned table from independently-timestamped per-series buffers. */
function alignedDataFor(visible: readonly PlotChartSeries[]): uPlot.AlignedData {
  if (visible.length === 0) return [[]];
  if (visible.length === 1) {
    const buffer = bufferOf(visible[0].name);
    return [buffer?.x ?? [], buffer ? buffer.y.map(visible[0].decode) : []];
  }
  const tables: uPlot.AlignedData[] = visible.map(s => {
    const buffer = bufferOf(s.name);
    return [buffer?.x ?? [], buffer ? buffer.y.map(s.decode) : []];
  });
  return uPlot.join(tables);
}

/**
 * The cursor tooltip: one instant's reading from every visible series, in the
 * vertical line the cursor is on.
 *
 * Built as plain DOM once per chart and mutated in place on every cursor move,
 * not held in React state — a hover can move dozens of times a second, and
 * routing that through a render is exactly what this component exists to
 * avoid for the data itself. The row for a series is created once because the
 * set of visible series only changes on a structural rebuild, which discards
 * this tooltip along with the chart it belongs to.
 */
interface Tooltip {
  readonly el: HTMLDivElement;
  readonly timeEl: HTMLDivElement;
  readonly rows: readonly { readonly valueEl: HTMLSpanElement }[];
}

function buildTooltip(
  over: HTMLElement,
  visible: readonly PlotChartSeries[],
  mode: 'dark' | 'light'
): Tooltip {
  const el = document.createElement('div');
  el.className = styles.tooltip;
  el.style.display = 'none';

  const timeEl = document.createElement('div');
  timeEl.className = styles.tooltipTime;
  el.appendChild(timeEl);

  const rows = visible.map(s => {
    const row = document.createElement('div');
    row.className = styles.tooltipRow;

    const swatch = document.createElement('span');
    swatch.className = styles.tooltipSwatch;
    swatch.style.background = seriesColorAt(s.colorSlot, mode);

    const name = document.createElement('span');
    name.className = styles.tooltipName;
    name.textContent = s.name;

    const valueEl = document.createElement('span');
    valueEl.className = styles.tooltipValue;

    row.append(swatch, name, valueEl);
    el.appendChild(row);
    return { valueEl };
  });

  over.appendChild(el);
  return { el, timeEl, rows };
}

/** Reads the cursor's current index straight off the chart and repaints the tooltip from it. */
function updateTooltip(tooltip: Tooltip, chart: uPlot, visible: readonly PlotChartSeries[]): void {
  const idx = chart.cursor.idx;
  const x = idx == null ? null : (chart.data[0]?.[idx] as number | null | undefined);

  if (idx == null || x == null) {
    tooltip.el.style.display = 'none';
    return;
  }

  tooltip.timeEl.textContent = formatClockTime(new Date(x * 1000));
  visible.forEach((_s, i) => {
    const y = chart.data[i + 1]?.[idx] as number | null | undefined;
    tooltip.rows[i].valueEl.textContent = y == null ? '—' : formatFractional(y);
  });

  tooltip.el.style.display = '';

  // Flips to the cursor's left, and clamps vertically, rather than running off
  // the plotting area — a Pane docked into a narrow column puts the cursor
  // within the margin's reach of the right edge often enough that this is the
  // common case, not an edge case.
  const margin = 12;
  const cursorLeft = chart.cursor.left ?? 0;
  const cursorTop = chart.cursor.top ?? 0;
  const overflowsRight = cursorLeft + margin + tooltip.el.offsetWidth > chart.rect.width;
  const left = overflowsRight
    ? Math.max(0, cursorLeft - margin - tooltip.el.offsetWidth)
    : cursorLeft + margin;
  const top = Math.min(cursorTop + margin, Math.max(0, chart.rect.height - tooltip.el.offsetHeight - margin));
  tooltip.el.style.transform = `translate(${left}px, ${top}px)`;
}

function buildOptions(
  width: number,
  height: number,
  visible: readonly PlotChartSeries[],
  mode: 'dark' | 'light',
  textColor: string,
  gridColor: string,
  onUserScale: (min: number, max: number) => void,
  onCursorMove: (self: uPlot) => void
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
    cursor: {
      points: { show: false },
      // Left-drag zooms to the selected X range. uPlot's own default — stated
      // rather than left implicit, since the wheel and middle-drag handlers
      // beside it are not.
      drag: { x: true, y: false, setScale: true },
    },
    hooks: {
      // Fires for a drag-zoom exactly as it does for this component's own
      // tick-driven `setScale` calls; `onUserScale` tells the two apart.
      setScale: [
        (self, key) => {
          if (key !== 'x') return;
          const { min, max } = self.scales.x;
          if (min != null && max != null) onUserScale(min, max);
        },
      ],
      setCursor: [onCursorMove],
    },
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

  // A manual zoom or pan's X window, or null to keep following live/paused
  // "now" as usual. `suppressScaleHookRef` is what lets the redraw tick's own
  // `setScale` calls share the same uPlot hook that observes a drag-zoom
  // without the tick's own upkeep being mistaken for a fresh manual zoom.
  const zoomRef = useRef<XWindow | null>(null);
  const suppressScaleHookRef = useRef(false);
  const tooltipRef = useRef<Tooltip | null>(null);

  useEffect(() => {
    timeSpanRef.current = timeSpan;
    // A newly-chosen span is a request to see that much history now, which a
    // stale zoom would otherwise silently override.
    zoomRef.current = null;
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

    const handleUserScale = (min: number, max: number): void => {
      if (suppressScaleHookRef.current) return;
      zoomRef.current = { min, max };
    };
    const handleCursorMove = (chart: uPlot): void => {
      if (tooltipRef.current) updateTooltip(tooltipRef.current, chart, visibleRef.current);
    };

    const options = buildOptions(width, height, visible, mode, textColor, gridColor, handleUserScale, handleCursorMove);
    const chart = new uPlot(options, alignedDataFor(visible), host);
    chartRef.current = chart;
    lastLengthsRef.current.clear();
    tooltipRef.current = buildTooltip(chart.over, visible, mode);

    const over = chart.over;

    // The scroll wheel zooms around the cursor's time position — uPlot has no
    // wheel behaviour of its own, unlike the left-drag zoom set in `cursor.drag`.
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const left = e.clientX - chart.rect.left;
      const cursorX = chart.posToVal(left, 'x');
      const current = zoomRef.current ?? {
        min: chart.scales.x.min ?? cursorX - 1,
        max: chart.scales.x.max ?? cursorX + 1,
      };
      const range = current.max - current.min;
      const factor = e.deltaY > 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
      const newRange = Math.max(MIN_ZOOM_RANGE_S, range * factor);
      const ratio = range > 0 ? (cursorX - current.min) / range : 0.5;
      const next = { min: cursorX - newRange * ratio, max: cursorX + newRange * (1 - ratio) };
      zoomRef.current = next;
      suppressScaleHookRef.current = true;
      chart.setScale('x', next);
      suppressScaleHookRef.current = false;
    };

    // Middle-button drag pans without changing the window's width — a
    // separate gesture from the left-drag zoom `cursor.drag` already owns.
    let panStart: { readonly clientX: number; readonly min: number; readonly max: number } | null = null;

    const handleMouseDown = (e: MouseEvent): void => {
      if (e.button !== 1) return;
      e.preventDefault();
      const current = zoomRef.current ?? { min: chart.scales.x.min ?? 0, max: chart.scales.x.max ?? 1 };
      panStart = { clientX: e.clientX, min: current.min, max: current.max };
      over.style.cursor = 'grabbing';
    };
    const handleMouseMove = (e: MouseEvent): void => {
      if (!panStart || chart.rect.width <= 0) return;
      const valuePerPixel = (panStart.max - panStart.min) / chart.rect.width;
      const deltaVal = (e.clientX - panStart.clientX) * valuePerPixel;
      const next = { min: panStart.min - deltaVal, max: panStart.max - deltaVal };
      zoomRef.current = next;
      suppressScaleHookRef.current = true;
      chart.setScale('x', next);
      suppressScaleHookRef.current = false;
    };
    const handleMouseUp = (e: MouseEvent): void => {
      if (e.button !== 1 || !panStart) return;
      panStart = null;
      over.style.cursor = 'crosshair';
    };

    // Double-click resets to following live/paused "now" again. uPlot's own
    // default double-click handler already ran by the time this fires (both
    // are bound to the same native event, in attachment order) and auto-scaled
    // to the full retained extent; setting the correct window here rather than
    // only clearing `zoomRef` avoids a visible flash of that wide view before
    // the next redraw tick would otherwise have corrected it, up to 200 ms later.
    const handleDoubleClick = (): void => {
      zoomRef.current = null;
      const effectiveNow = pausedRef.current ? (pausedAtRef.current ?? Date.now() / 1000) : Date.now() / 1000;
      suppressScaleHookRef.current = true;
      chart.setScale('x', { min: effectiveNow - timeSpanRef.current, max: effectiveNow });
      suppressScaleHookRef.current = false;
    };

    over.style.cursor = 'crosshair';
    over.addEventListener('wheel', handleWheel, { passive: false });
    over.addEventListener('mousedown', handleMouseDown);
    // Bound on the window rather than `over`, so a pan does not stop the
    // moment the cursor drifts off the plotting area mid-drag.
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    over.addEventListener('dblclick', handleDoubleClick);

    return () => {
      over.removeEventListener('wheel', handleWheel);
      over.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      over.removeEventListener('dblclick', handleDoubleClick);
      chart.destroy();
      chartRef.current = null;
      tooltipRef.current = null;
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
  // second once history has built up. A manual zoom or pan (`zoomRef`) is
  // honoured here too, including while paused — the whole point of being able
  // to zoom into a frozen trace is that this tick must not fight it.
  useEffect(() => {
    const id = setInterval(() => {
      const chart = chartRef.current;
      if (!chart) return;

      let min: number;
      let max: number;
      if (zoomRef.current) {
        ({ min, max } = zoomRef.current);
      } else {
        const effectiveNow = pausedRef.current ? (pausedAtRef.current ?? Date.now() / 1000) : Date.now() / 1000;
        min = effectiveNow - timeSpanRef.current;
        max = effectiveNow;
      }

      let dirty = false;
      for (const s of visibleRef.current) {
        const length = bufferOf(s.name)?.x.length ?? 0;
        if (lastLengthsRef.current.get(s.name) !== length) {
          lastLengthsRef.current.set(s.name, length);
          dirty = true;
        }
      }

      suppressScaleHookRef.current = true;
      chart.batch(() => {
        if (dirty) chart.setData(alignedDataFor(visibleRef.current), false);
        chart.setScale('x', { min, max });
      });
      suppressScaleHookRef.current = false;
    }, REDRAW_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return <div ref={hostRef} className={styles.host} />;
}
