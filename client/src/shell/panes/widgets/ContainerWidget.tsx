import { useCallback, useMemo, useRef, useState } from 'react';
import GridLayout from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import { Plus } from '@phosphor-icons/react';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import { Button, Menu, MenuItem } from '../../../ui';
import { createStoredWidget } from '../../widgets/dashboardStore';
import { FALLBACK_WIDTH, GRID_COLS, ROW_HEIGHT } from '../../widgets/gridLayout';
import type { ContainerWidgetConfig, StoredWidget, WidgetConfig } from '../../widgets/widgetConfig';
import { WIDGETS, widgetDefinition } from '../../widgets/widgetRegistry';
import type { WidgetKind, WidgetProps } from '../../widgets/widgetRegistry';
import { WIDGET_DRAG_CANCEL_CLASS, WidgetShell } from '../WidgetShell';
import { WidgetConfigDialog } from '../WidgetConfigDialog';
import styles from './ContainerWidget.module.css';

import 'react-grid-layout/css/styles.css';

/**
 * Groups other Widgets in their own nested grid — a Dashboard-within-a-Widget
 * on purpose: this is the same `react-grid-layout` mechanism, the same fixed
 * `GRID_COLS` safety `gridLayout.ts` documents, and the same `WidgetShell`
 * chrome one level down, so a child here looks and behaves exactly as it
 * would as a top-level Dashboard Widget.
 *
 * Its children are added, configured and removed from directly within
 * itself — `onConfigChange` (from `WidgetProps`) is how that reaches the
 * Dashboard's own stored state, since a Container's children are not
 * individually visible to `DashboardPane`'s own single-selection
 * `configuringWidgetId`.
 */
export function ContainerWidget({ config, paneId, editing, onConfigChange }: WidgetProps): React.JSX.Element {
  const containerConfig = config as ContainerWidgetConfig;
  const { childWidgets, padding, spacing } = containerConfig;

  const hostRef = useRef<HTMLDivElement>(null);
  const size = useWidgetSize(hostRef);
  const width = size.width > 0 ? size.width : FALLBACK_WIDTH;

  // Read from `WIDGETS` at render time rather than module scope: `widgetRegistry.ts`
  // imports this component (for its own `component` field), so a module-level
  // read here would run mid-way through that very module's own initialization,
  // before its `WIDGETS` export exists yet — a real circular import, not one
  // worth restructuring the registry to avoid for one filtered list.
  const childKinds = useMemo(() => WIDGETS.filter(definition => definition.kind !== 'container'), []);

  const [configuringChildId, setConfiguringChildId] = useState<string | null>(null);

  const updateChildWidgets = useCallback(
    (next: readonly StoredWidget[]) => {
      onConfigChange({ ...containerConfig, childWidgets: next });
    },
    [containerConfig, onConfigChange]
  );

  const handleAddChild = useCallback(
    (kind: WidgetKind) => {
      const child = createStoredWidget(kind, childWidgets.map(w => w.layout), GRID_COLS);
      if (!child) return;
      updateChildWidgets([...childWidgets, child]);
    },
    [childWidgets, updateChildWidgets]
  );

  const handleRemoveChild = useCallback(
    (childId: string) => {
      updateChildWidgets(childWidgets.filter(w => w.id !== childId));
    },
    [childWidgets, updateChildWidgets]
  );

  const updateChildConfig = useCallback(
    (childId: string, childConfig: WidgetConfig) => {
      updateChildWidgets(childWidgets.map(w => (w.id === childId ? { ...w, config: childConfig } : w)));
    },
    [childWidgets, updateChildWidgets]
  );

  const handleLayoutChange = useCallback(
    (layout: readonly Layout[]) => {
      if (!editing) return;
      const layouts = new Map(layout.map(l => [l.i, { x: l.x, y: l.y, w: l.w, h: l.h }]));
      updateChildWidgets(childWidgets.map(w => {
        const next = layouts.get(w.id);
        return next ? { ...w, layout: next } : w;
      }));
    },
    [editing, childWidgets, updateChildWidgets]
  );

  const rglLayout = useMemo<Layout[]>(
    () =>
      childWidgets.map(w => {
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
      }),
    [childWidgets]
  );

  const configuringChild = childWidgets.find(w => w.id === configuringChildId) ?? null;

  return (
    <div className={styles.host} style={{ padding }}>
      {editing ? (
        <div className={`${WIDGET_DRAG_CANCEL_CLASS} ${styles.toolbar}`}>
          <Menu
            trigger={
              <Button size="sm">
                <Plus size={14} weight="bold" /> Add Widget
              </Button>
            }
          >
            {childKinds.map(definition => (
              <MenuItem key={definition.kind} onSelect={() => handleAddChild(definition.kind)}>
                {definition.title}
              </MenuItem>
            ))}
          </Menu>
        </div>
      ) : null}

      {childWidgets.length === 0 ? (
        <p className={styles.notice}>{editing ? 'Add a Widget above.' : 'Empty container.'}</p>
      ) : (
        <div ref={hostRef} className={styles.gridHost}>
          <GridLayout
            className="layout"
            layout={rglLayout}
            cols={GRID_COLS}
            rowHeight={ROW_HEIGHT}
            width={width}
            margin={[spacing, spacing]}
            isDraggable={editing}
            isResizable={editing}
            onLayoutChange={handleLayoutChange}
            compactType={null}
            preventCollision={false}
            draggableCancel={`.${WIDGET_DRAG_CANCEL_CLASS}`}
          >
            {childWidgets.map(child => {
              const definition = widgetDefinition(child.kind);
              if (!definition) return null;
              const ChildComponent = definition.component;
              return (
                <div key={child.id}>
                  <WidgetShell
                    label={child.config.label}
                    editing={editing}
                    onConfigure={() => setConfiguringChildId(child.id)}
                    onRemove={() => handleRemoveChild(child.id)}
                  >
                    <ChildComponent
                      config={child.config}
                      paneId={paneId}
                      editing={editing}
                      onConfigChange={childConfig => updateChildConfig(child.id, childConfig)}
                    />
                  </WidgetShell>
                </div>
              );
            })}
          </GridLayout>
        </div>
      )}

      {configuringChild ? (
        <WidgetConfigDialog
          open
          onOpenChange={open => {
            if (!open) setConfiguringChildId(null);
          }}
          kind={configuringChild.kind}
          config={configuringChild.config}
          onSave={childConfig => updateChildConfig(configuringChild.id, childConfig)}
        />
      ) : null}
    </div>
  );
}
