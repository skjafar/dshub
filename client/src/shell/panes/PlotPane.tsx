import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DownloadSimple, Pause, Play, Plus, X } from '@phosphor-icons/react';
import { getThemeById } from '../../appThemes';
import { useBackendPort } from '../../contexts/BackendPortContext';
import { useDSHub } from '../../contexts/DSHubContext';
import { useSettings } from '../../contexts/SettingsContext';
import { seriesColorAt } from '../../design/dataColors';
import type { MapEntry } from '../../maps/mapParser';
import { getPlotValue } from '../../utils/dataTableUtils';
import { Button, NumericInput, Popover, Select, Table, TextField, cx } from '../../ui';
import type { Column } from '../../ui';
import { filterEntries } from '../entryFilter';
import { isLive, isStale, linkStateOf } from '../linkState';
import { instanceOfPaneId } from '../paneRegistry';
import type { PaneProps } from '../paneRegistry';
import { usePaneState } from '../paneState';
import { bufferOf, claimSeries, releaseSeries } from '../plotStream';
import type { PlotSeriesRef, PlottableSpace } from '../plotStream';
import { buildPlotCsv } from '../plotExport';
import { useMapEntries } from '../useMapEntries';
import { PlotChart } from './PlotChart';
import styles from './PlotPane.module.css';

/**
 * The Device floors a plot's poll interval at 10 ms — `start_plotting`'s own
 * `poll_interval.max(10)`, mirrored by the fake's `PLOT_INTERVAL_FLOOR_MS`.
 * Asking for anything faster is asking for something it cannot deliver.
 */
const MIN_POLL_INTERVAL_MS = 10;
const MAX_POLL_INTERVAL_MS = 10_000;
const MIN_TIME_SPAN_S = 5;

/** How many picker results to show before asking for a narrower filter. */
const PICKER_LIMIT = 30;

const SOURCE_LABEL: Readonly<Record<PlottableSpace, string>> = {
  register: 'Register',
  sysRegister: 'System Register',
};

const SOURCE_OPTIONS = [
  { value: 'register' as const, label: SOURCE_LABEL.register },
  { value: 'sysRegister' as const, label: SOURCE_LABEL.sysRegister },
];

interface PlotSeriesConfig {
  readonly name: string;
  readonly source: PlottableSpace;
  readonly address: number;
  readonly colorSlot: number;
  readonly visible: boolean;
}

interface PlotPaneState {
  readonly series: readonly PlotSeriesConfig[];
  readonly pollInterval: number;
  readonly timeSpan: number;
  readonly pickerSource: PlottableSpace;
  readonly pickerQuery: string;
}

/** The lowest palette slot not already carried by one of this Pane's series. */
function nextColorSlot(existing: readonly PlotSeriesConfig[]): number {
  const taken = new Set(existing.map(s => s.colorSlot));
  let slot = 0;
  while (taken.has(slot)) slot += 1;
  return slot;
}

function plotPaneTitle(instance: number, series: readonly PlotSeriesConfig[]): string {
  const base = instance === 0 ? 'Plot' : `Plot ${instance}`;
  if (series.length === 0) return base;
  if (series.length === 1) return `${base} · ${series[0].name}`;
  return `${base} · ${series[0].name} +${series.length - 1} more`;
}

/**
 * Live plotting, rebuilt on uPlot and driven imperatively.
 *
 * What this Pane owns and what `plotStream` owns are deliberately different
 * things. This Pane owns *configuration* — which series, what poll interval,
 * what time span, whether the view is paused — all of it small and all of it
 * worth restoring with a saved Workspace, so it lives in `usePaneState` like
 * every other Pane's settings. Retained points are neither: at up to twenty
 * per second per series they are far too large to serialise, and unlike this
 * component they must survive dockview backgrounding the tab, so they live in
 * `plotStream` instead and this Pane only ever reads them through `PlotChart`.
 */
export function PlotPane({ paneId, setTitle }: PaneProps): React.JSX.Element {
  const { state } = useDSHub();
  const { settings } = useSettings();
  const port = useBackendPort();
  const registers = useMapEntries('register');
  const sysRegisters = useMapEntries('sysRegister');

  const [pane, updatePane] = usePaneState<PlotPaneState>(paneId, () => ({
    series: [],
    pollInterval: settings.plotDefaults.pollInterval,
    timeSpan: settings.plotDefaults.timeSpan,
    pickerSource: 'register',
    pickerQuery: '',
  }));

  // Not persisted: a pause belongs to this mount, and a Pane reopened after a
  // restart has no reason to come back frozen at a moment nobody remembers.
  const [paused, setPaused] = useState(false);
  // Series this Pane still lists but does not currently own — another open
  // Plot Pane claimed the name first, most often after a reconnect raced it.
  const [conflicts, setConflicts] = useState<ReadonlySet<string>>(new Set());
  const [pickerError, setPickerError] = useState<string | null>(null);

  const instance = instanceOfPaneId(paneId);
  const link = linkStateOf(state.connection, state.connecting);
  const connected = isLive(link);
  const stale = isStale(link);

  const seriesRef = useRef(pane.series);
  useEffect(() => {
    seriesRef.current = pane.series;
  }, [pane.series]);

  const title = useMemo(() => plotPaneTitle(instance, pane.series), [instance, pane.series]);
  useEffect(() => {
    setTitle(title);
  }, [setTitle, title]);

  const entryByName = useMemo(() => {
    const map = new Map<string, MapEntry>();
    for (const entry of registers.entries) map.set(entry.name, entry);
    for (const entry of sysRegisters.entries) map.set(entry.name, entry);
    return map;
  }, [registers.entries, sysRegisters.entries]);

  /**
   * The one place a raw wire word becomes the reading it represents. Both the
   * live chart and the CSV export read through this, so a float series cannot
   * be decoded one way on screen and another in the file it is exported to.
   */
  const decodeSeriesValue = useCallback(
    (name: string, raw: number) => getPlotValue(raw, entryByName.get(name)),
    [entryByName]
  );

  /**
   * Ensures every listed series is claimed and streaming at the current poll
   * interval. Runs whenever the link comes up — covering both a fresh mount
   * while already connected and a reconnect after the backend discarded every
   * plot registration on disconnect — and whenever the interval changes, since
   * re-claiming a name already held is how a new interval takes effect.
   */
  useEffect(() => {
    if (!connected) return;
    const stillConflicted = new Set<string>();
    for (const series of seriesRef.current) {
      const ref: PlotSeriesRef = { name: series.name, source: series.source, address: series.address };
      if (!claimSeries(port, paneId, ref, pane.pollInterval)) stillConflicted.add(series.name);
    }
    setConflicts(stillConflicted);
  }, [connected, pane.pollInterval, paneId, port]);

  const handleAddSeries = useCallback(
    (entry: MapEntry, source: PlottableSpace) => {
      if (pane.series.some(s => s.name === entry.name)) return;
      const claimed = claimSeries(port, paneId, { name: entry.name, source, address: entry.address }, pane.pollInterval);
      if (!claimed) {
        setPickerError(`${entry.name} is already being plotted in another open Plot Pane.`);
        return;
      }
      setPickerError(null);
      updatePane(previous => ({
        ...previous,
        series: [
          ...previous.series,
          { name: entry.name, source, address: entry.address, colorSlot: nextColorSlot(previous.series), visible: true },
        ],
      }));
    },
    [pane.series, pane.pollInterval, port, paneId, updatePane]
  );

  const handleRemoveSeries = useCallback(
    (name: string) => {
      releaseSeries(port, paneId, name);
      setConflicts(previous => {
        if (!previous.has(name)) return previous;
        const next = new Set(previous);
        next.delete(name);
        return next;
      });
      updatePane(previous => ({ ...previous, series: previous.series.filter(s => s.name !== name) }));
    },
    [port, paneId, updatePane]
  );

  const handleToggleVisible = useCallback(
    (name: string) => {
      updatePane(previous => ({
        ...previous,
        series: previous.series.map(s => (s.name === name ? { ...s, visible: !s.visible } : s)),
      }));
    },
    [updatePane]
  );

  const handlePollIntervalChange = useCallback(
    (value: number) => {
      const clamped = Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, Math.round(value)));
      updatePane(previous => ({ ...previous, pollInterval: clamped }));
    },
    [updatePane]
  );

  const handleTimeSpanChange = useCallback(
    (value: number) => {
      const clamped = Math.min(settings.plotDefaults.maxTimeSpan, Math.max(MIN_TIME_SPAN_S, Math.round(value)));
      updatePane(previous => ({ ...previous, timeSpan: clamped }));
    },
    [updatePane, settings.plotDefaults.maxTimeSpan]
  );

  const handlePickerSourceChange = useCallback(
    (source: PlottableSpace) => {
      setPickerError(null);
      updatePane(previous => ({ ...previous, pickerSource: source }));
    },
    [updatePane]
  );

  const handlePickerQueryChange = useCallback(
    (query: string) => updatePane(previous => ({ ...previous, pickerQuery: query })),
    [updatePane]
  );

  const handleExport = useCallback(() => {
    const exportSeries = pane.series.map(series => {
      const buffer = bufferOf(series.name);
      const points = buffer ? buffer.x.map((x, i) => ({ x, y: decodeSeriesValue(series.name, buffer.y[i]) })) : [];
      return { name: series.name, points };
    });
    const { csv, suggestedName } = buildPlotCsv(exportSeries, new Date());
    port.files.saveCsv(csv, suggestedName).catch(console.error);
  }, [pane.series, decodeSeriesValue, port]);

  const pickerEntries = pane.pickerSource === 'sysRegister' ? sysRegisters.entries : registers.entries;
  const pickerMatches = useMemo(() => {
    const alreadyAdded = new Set(pane.series.map(s => s.name));
    return filterEntries(pickerEntries, pane.pickerQuery).filter(entry => !alreadyAdded.has(entry.name));
  }, [pickerEntries, pane.pickerQuery, pane.series]);
  const pickerShown = pickerMatches.slice(0, PICKER_LIMIT);

  const pickerColumns: readonly Column<MapEntry>[] = [
    { key: 'name', header: 'Name', render: entry => entry.name },
    { key: 'address', header: 'Addr', numeric: true, mono: true, width: '5.5rem', render: entry => entry.address },
  ];

  const appTheme = useMemo(() => getThemeById(settings.colorThemeId), [settings.colorThemeId]);

  const chartSeries = useMemo(
    () =>
      pane.series.map(s => ({
        name: s.name,
        colorSlot: s.colorSlot,
        visible: s.visible,
        decode: (raw: number) => decodeSeriesValue(s.name, raw),
      })),
    [pane.series, decodeSeriesValue]
  );

  return (
    <div className={styles.pane}>
      <div className={styles.toolbar}>
        <h2 className={styles.heading}>{instance === 0 ? 'Plot' : `Plot ${instance}`}</h2>

        <NumericInput
          label="Poll (ms)"
          value={pane.pollInterval}
          onCommit={handlePollIntervalChange}
          className={styles.numberField}
          aria-label="Poll interval in milliseconds"
        />
        <NumericInput
          label="Span (s)"
          value={pane.timeSpan}
          onCommit={handleTimeSpanChange}
          className={styles.numberField}
          aria-label="Time span in seconds"
        />

        <Popover
          trigger={
            <Button size="sm">
              <Plus size={14} weight="bold" /> Add series
            </Button>
          }
        >
          <div className={styles.picker}>
            <Select
              value={pane.pickerSource}
              onValueChange={handlePickerSourceChange}
              options={SOURCE_OPTIONS}
              aria-label="Series source"
            />
            <TextField
              value={pane.pickerQuery}
              onChange={event => handlePickerQueryChange(event.target.value)}
              placeholder="Filter by name or address (0x2A)"
              aria-label="Filter series to add by name or address"
              spellCheck={false}
              autoComplete="off"
            />
            {pickerError !== null ? (
              <p className={styles.pickerError} role="alert">
                {pickerError}
              </p>
            ) : null}
            <div className={styles.pickerTableHost}>
              <Table
                columns={pickerColumns}
                rows={pickerShown}
                rowKey={entry => entry.name}
                onSelect={entry => handleAddSeries(entry, pane.pickerSource)}
                emptyMessage="Nothing matches."
              />
            </div>
            {pickerMatches.length > pickerShown.length ? (
              <p className={styles.pickerCap}>
                Only the first {PICKER_LIMIT} are shown — narrow the filter to reach the rest.
              </p>
            ) : null}
          </div>
        </Popover>

        <Button size="sm" onClick={() => setPaused(p => !p)} disabled={pane.series.length === 0}>
          {paused ? <Play size={14} weight="fill" /> : <Pause size={14} weight="fill" />}
          {paused ? 'Resume' : 'Pause'}
        </Button>

        <Button size="sm" onClick={handleExport} disabled={pane.series.length === 0}>
          <DownloadSimple size={14} weight="bold" /> Export
        </Button>
      </div>

      {pane.series.length > 0 ? (
        <ul className={styles.legend}>
          {pane.series.map(series => (
            <li
              key={series.name}
              className={cx(styles.chip, conflicts.has(series.name) && styles.chipConflicted)}
            >
              <button
                type="button"
                className={styles.swatch}
                style={{ background: series.visible ? seriesColorAt(series.colorSlot, appTheme.mode) : 'transparent' }}
                onClick={() => handleToggleVisible(series.name)}
                aria-pressed={series.visible}
                aria-label={`${series.visible ? 'Hide' : 'Show'} ${series.name}`}
                title={
                  conflicts.has(series.name)
                    ? `${series.name} is being plotted in another open Plot Pane — showing no data here.`
                    : undefined
                }
              />
              <span className={styles.chipName}>{series.name}</span>
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => handleRemoveSeries(series.name)}
                aria-label={`Remove ${series.name}`}
              >
                <X size={12} weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className={styles.status} role="status">
        {paused ? <span className={styles.pausedNote}>paused — still recording</span> : null}
        {conflicts.size > 0 ? (
          <span className={styles.conflictNote}>
            {conflicts.size} series already plotted elsewhere — showing no data.
          </span>
        ) : null}
        {stale ? (
          <span className={styles.staleNote}>
            {link === 'reconnecting'
              ? 'The Device stopped answering. Plotting will resume once it does.'
              : 'Disconnected. Nothing is being plotted.'}
          </span>
        ) : null}
        {link === 'no device' ? (
          <span className={styles.idleNote}>Connect from the chrome above to start plotting.</span>
        ) : null}
      </p>

      {pane.series.length === 0 ? (
        <p className={styles.notice}>Add a series above to begin plotting.</p>
      ) : (
        <PlotChart
          series={chartSeries}
          mode={appTheme.mode}
          textColor={appTheme.colors.onSurfaceVar}
          gridColor={appTheme.colors.ghostSep}
          timeSpan={pane.timeSpan}
          paused={paused}
        />
      )}
    </div>
  );
}
