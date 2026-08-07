import { useEffect, useMemo, useRef, useState } from 'react';
import GridLayout from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import { cx } from '../../ui';
import type { StoredDashboard, WidgetLayout } from '../widgets/dashboardStore';
import { widgetDefinition } from '../widgets/widgetRegistry';
import type { WidgetConfig } from '../widgets/widgetConfig';
import { FALLBACK_WIDTH, GRID_COLS, GRID_MARGIN, ROW_HEIGHT } from '../widgets/gridLayout';
import { WIDGET_DRAG_CANCEL_CLASS, WidgetShell } from './WidgetShell';
import styles from './DashboardGrid.module.css';

import 'react-grid-layout/css/styles.css';

export interface DashboardGridProps {
  readonly dashboard: StoredDashboard | null;
  /** Threaded to every Widget unchanged — see `WidgetProps.paneId`. */
  readonly paneId: string;
  /**
   * Whether layout may be rearranged and Widgets configured or removed.
   * `false` is what makes a grid locked rather than merely read-only: it
   * gates `react-grid-layout`'s own drag/resize the same way it gates
   * `WidgetShell`'s configure/remove affordances, so there is one flag
   * rather than two that could disagree. Focus Mode (ticket 18) never
   * offers a way to flip this to `true` at all, which is what keeps its
   * layout locked rather than merely defaulted to unlocked.
   */
  readonly editing: boolean;
  readonly emptyMessage: string;
  /** Omitted by a caller that never edits — Focus Mode passes none. */
  readonly onLayoutChange?: (layouts: ReadonlyMap<string, WidgetLayout>) => void;
  readonly onConfigureWidget?: (widgetId: string) => void;
  readonly onRemoveWidget?: (widgetId: string) => void;
  readonly onUpdateWidgetConfig: (widgetId: string, config: WidgetConfig) => void;
}

/**
 * One Dashboard's Widget grid: the `react-grid-layout` instance, its
 * container-width measurement, and the per-Widget `WidgetShell` wrapping.
 *
 * Shared by `DashboardPane` (editable) and `FocusModeView` (ticket 18,
 * permanently `editing={false}`) so the two can never render a Dashboard
 * differently — the same grid math, the same Widget lookup, the same empty
 * state, rather than a second implementation Focus Mode's locked view could
 * drift out of sync with.
 *
 * Placing and resizing a Widget is pointer-only: `react-grid-layout` supplies
 * no keyboard equivalent for its own drag and resize handles. This is the
 * Widget grid's counterpart to dockview's own spatial rearrangement — dragging
 * a Pane to a new edge, resizing it by its sash — which is pointer-only in
 * exactly the same way and for which this codebase has never built or
 * required a keyboard alternative either; ticket 23's own "Dock manipulation"
 * requirement reaches only switching, closing and reopening Panes, not
 * dragging one to a new position. Ticket 23 considered building a keyboard
 * move/resize mode for the grid and declined, a deliberate call confirmed
 * during that ticket's implementation rather than a gap left unnoticed. Every
 * Widget's own reading, writing and configuring stays fully keyboard-operable;
 * only its position on the grid does not.
 */
export function DashboardGrid({
  dashboard,
  paneId,
  editing,
  emptyMessage,
  onLayoutChange,
  onConfigureWidget,
  onRemoveWidget,
  onUpdateWidgetConfig,
}: DashboardGridProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = (): void => {
      if (el.clientWidth > 0) setContainerWidth(el.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rglLayout = useMemo<Layout[]>(
    () =>
      dashboard?.widgets.map(w => {
        const definition = widgetDefinition(w.kind);
        return {
          i: w.id,
          x: w.layout.x,
          y: w.layout.y,
          w: w.layout.w,
          h: w.layout.h,
          minW: definition?.defaultSize.minW ?? 1,
          minH: definition?.defaultSize.minH ?? 1,
        };
      }) ?? [],
    [dashboard]
  );

  const handleLayoutChange = (layout: readonly Layout[]): void => {
    if (!editing || !onLayoutChange) return;
    const layouts = new Map(layout.map(l => [l.i, { x: l.x, y: l.y, w: l.w, h: l.h }]));
    onLayoutChange(layouts);
  };

  const populated = dashboard !== null && dashboard.widgets.length > 0 ? dashboard : null;

  return (
    <div ref={containerRef} className={styles.gridHost}>
      {populated === null ? (
        <p className={styles.notice}>{emptyMessage}</p>
      ) : (
        <GridLayout
          className={cx('layout', styles.grid)}
          layout={rglLayout}
          cols={GRID_COLS}
          rowHeight={ROW_HEIGHT}
          width={containerWidth}
          margin={[GRID_MARGIN, GRID_MARGIN]}
          isDraggable={editing}
          isResizable={editing}
          onLayoutChange={handleLayoutChange}
          compactType={null}
          preventCollision={false}
          draggableCancel={`.${WIDGET_DRAG_CANCEL_CLASS}`}
        >
          {populated.widgets.map(widget => {
            const definition = widgetDefinition(widget.kind);
            if (!definition) return null;
            const WidgetComponent = definition.component;
            return (
              <div key={widget.id}>
                <WidgetShell
                  label={widget.config.label}
                  editing={editing}
                  onConfigure={() => onConfigureWidget?.(widget.id)}
                  onRemove={() => onRemoveWidget?.(widget.id)}
                >
                  <WidgetComponent
                    config={widget.config}
                    paneId={paneId}
                    editing={editing}
                    onConfigChange={config => onUpdateWidgetConfig(widget.id, config)}
                  />
                </WidgetShell>
              </div>
            );
          })}
        </GridLayout>
      )}
    </div>
  );
}
