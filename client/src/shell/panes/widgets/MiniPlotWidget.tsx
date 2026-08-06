import { useEffect, useMemo } from 'react';
import { getThemeById } from '../../../appThemes';
import { useBackendPort } from '../../../contexts/BackendPortContext';
import { useDSHub } from '../../../contexts/DSHubContext';
import { useSettings } from '../../../contexts/SettingsContext';
import { getPlotValue } from '../../../utils/dataTableUtils';
import { isLive, isStale, linkStateOf } from '../../linkState';
import { claimSeries } from '../../plotStream';
import { useMapEntries } from '../../useMapEntries';
import type { MiniPlotWidgetConfig } from '../../widgets/widgetConfig';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import { PlotChart } from '../PlotChart';
import type { PlotChartSeries } from '../PlotChart';
import { WidgetStatusNotice } from './WidgetStatusNotice';
import styles from './MiniPlotWidget.module.css';

/**
 * The one palette slot a single-series Mini-Plot draws its line in — there is
 * no legend to keep distinct colours apart from, unlike a multi-series Plot
 * Pane, so the first accent slot always does.
 */
const SERIES_COLOR_SLOT = 0;

/**
 * One bound value, traced live on the exact same engine `PlotPane.tsx` uses
 * — `PlotChart` and `plotStream`, not a re-implementation. `plotStream`
 * claims a series under a Pane's own id, but a Widget has no dockview
 * identity of its own to claim under; `paneId` (from `WidgetProps`) is the
 * enclosing Dashboard Pane's, threaded down so a Mini-Plot's claim is
 * released the same way a Plot Pane's own series are — when the Dashboard
 * Pane itself closes, via `retainSeriesFor`'s dockview-driven pass, not on
 * this component's own mount/unmount (a backgrounded Dashboard tab unmounts
 * this Widget too, and re-claiming on remount would needlessly restart the
 * Device's own stream).
 */
export function MiniPlotWidget({ config, paneId }: WidgetProps): React.JSX.Element {
  const { series, pollInterval, timeSpan } = config as MiniPlotWidgetConfig;
  const { state } = useDSHub();
  const { settings } = useSettings();
  const port = useBackendPort();
  const registers = useMapEntries('register');
  const sysRegisters = useMapEntries('sysRegister');

  const link = linkStateOf(state.connection, state.connecting);
  const connected = isLive(link);
  const stale = isStale(link);

  const entry = useMemo(() => {
    if (series === null) return null;
    const map = series.space === 'sysRegister' ? sysRegisters : registers;
    return map.entries.find(candidate => candidate.address === series.address) ?? null;
  }, [series, registers, sysRegisters]);

  useEffect(() => {
    if (!connected || series === null || entry === null) return;
    claimSeries(port, paneId, { name: entry.name, source: series.space, address: series.address }, pollInterval);
  }, [connected, series, entry, pollInterval, port, paneId]);

  if (series === null) return <WidgetStatusNotice status="unbound" />;
  if (entry === null) return <WidgetStatusNotice status="not-found" />;

  const appTheme = getThemeById(settings.colorThemeId);
  const chartSeries: readonly PlotChartSeries[] = [
    {
      name: entry.name,
      colorSlot: SERIES_COLOR_SLOT,
      visible: true,
      decode: (raw: number) => getPlotValue(raw, entry),
    },
  ];

  return (
    <div className={styles.widget}>
      {stale ? (
        <p className={styles.staleNote} role="status">
          Stale — the Device stopped answering.
        </p>
      ) : null}
      <div className={styles.chartHost}>
        <PlotChart
          series={chartSeries}
          mode={appTheme.mode}
          textColor={appTheme.colors.onSurfaceVar}
          gridColor={appTheme.colors.ghostSep}
          timeSpan={timeSpan}
          paused={false}
        />
      </div>
    </div>
  );
}
