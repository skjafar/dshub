import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GridLayout from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import { Check, PencilSimple, Plus, TrashSimple, X } from '@phosphor-icons/react';
import { useSettings } from '../../contexts/SettingsContext';
import { Button, Menu, MenuItem, TabPanel, Tabs, TextField, cx } from '../../ui';
import type { TabDefinition } from '../../ui';
import {
  addDashboard,
  addWidget,
  applyWidgetLayouts,
  createDashboardId,
  createStoredWidget,
  removeDashboard,
  removeWidget,
  renameDashboard,
  sanitizeProfileDashboards,
  seedProfileDashboards,
  updateDashboard,
  updateWidgetConfig,
} from '../widgets/dashboardStore';
import type { ProfileDashboards, StoredDashboard } from '../widgets/dashboardStore';
import { WIDGETS, widgetDefinition } from '../widgets/widgetRegistry';
import type { WidgetKind } from '../widgets/widgetRegistry';
import type { WidgetConfig } from '../widgets/widgetConfig';
import { FALLBACK_WIDTH, GRID_COLS, GRID_MARGIN, ROW_HEIGHT } from '../widgets/gridLayout';
import { instanceOfPaneId } from '../paneRegistry';
import type { PaneProps } from '../paneRegistry';
import { usePaneState } from '../paneState';
import { WidgetConfigDialog } from './WidgetConfigDialog';
import { WIDGET_DRAG_CANCEL_CLASS, WidgetShell } from './WidgetShell';
import styles from './DashboardPane.module.css';

import 'react-grid-layout/css/styles.css';

interface DashboardPaneState {
  readonly viewingDashboardId: string | null;
}

function dashboardPaneTitle(instance: number, dashboardName: string | null): string {
  const base = instance === 0 ? 'Dashboard' : `Dashboard ${instance}`;
  return dashboardName === null ? base : `${base} · ${dashboardName}`;
}

function newDashboard(name: string): StoredDashboard {
  return { id: createDashboardId(), name, widgets: [] };
}

/**
 * The composed Dashboard: a Widget grid a Profile can hold several of,
 * switchable within this Pane.
 *
 * Deliberately not dissolved into Panes (spec.md) — it keeps its own internal
 * layout system, `react-grid-layout`, separate from the Workspace's dockview.
 * Every Widget on the grid configures through one shared surface
 * (`WidgetConfigDialog`) regardless of kind — seven kinds share it as of
 * ticket 15; the remaining nine join `widgetRegistry.ts`'s list in later
 * tickets without this Pane changing at all.
 */
export function DashboardPane({ paneId, setTitle }: PaneProps): React.JSX.Element {
  const { settings, updateSettings } = useSettings();
  const profileId = settings.activeMapProfileId;
  const rawCollection = settings.dashboardsByProfile[profileId];
  const collection = useMemo(
    () => (rawCollection === undefined ? undefined : sanitizeProfileDashboards(rawCollection)),
    [rawCollection]
  );

  const [pane, updatePane] = usePaneState<DashboardPaneState>(paneId, () => ({ viewingDashboardId: null }));
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [configuringWidgetId, setConfiguringWidgetId] = useState<string | null>(null);

  const instance = instanceOfPaneId(paneId);

  const commit = useCallback(
    (next: ProfileDashboards) => {
      updateSettings({ dashboardsByProfile: { ...settings.dashboardsByProfile, [profileId]: next } });
    },
    [settings.dashboardsByProfile, profileId, updateSettings]
  );

  // A Profile that has never had a Dashboard collection at all gets a first
  // one seeded, the same first-run treatment `workspacesByProfile` gives a
  // fresh Profile. A collection that exists but is deliberately empty — every
  // Dashboard deleted — is left alone; that is the empty state below, not a
  // gap to paper over.
  useEffect(() => {
    if (collection !== undefined) return;
    commit(seedProfileDashboards(newDashboard('Dashboard 1')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection]);

  const activeDashboard = useMemo<StoredDashboard | null>(() => {
    if (!collection) return null;
    return collection.dashboards.find(d => d.id === pane.viewingDashboardId) ?? collection.dashboards[0] ?? null;
  }, [collection, pane.viewingDashboardId]);

  // Keeps this instance's own choice of Dashboard pointed at something real:
  // the first mount (nothing chosen yet), and a Dashboard deleted out from
  // under a Pane instance still viewing it.
  useEffect(() => {
    const resolved = activeDashboard?.id ?? null;
    if (resolved !== pane.viewingDashboardId) {
      updatePane(previous => ({ ...previous, viewingDashboardId: resolved }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDashboard]);

  const title = useMemo(
    () => dashboardPaneTitle(instance, activeDashboard?.name ?? null),
    [instance, activeDashboard]
  );
  useEffect(() => {
    setTitle(title);
  }, [setTitle, title]);

  // ── Dashboard-level actions ─────────────────────────────────────────────

  const handleAddDashboard = useCallback(() => {
    const base = collection ?? { dashboards: [] };
    const created = newDashboard(`Dashboard ${base.dashboards.length + 1}`);
    commit(addDashboard(base, created));
    updatePane(previous => ({ ...previous, viewingDashboardId: created.id }));
  }, [collection, commit, updatePane]);

  const handleSwitchDashboard = useCallback(
    (id: string) => updatePane(previous => ({ ...previous, viewingDashboardId: id })),
    [updatePane]
  );

  const startRename = useCallback(() => {
    if (activeDashboard) setRenaming(activeDashboard.name);
  }, [activeDashboard]);

  const commitRename = useCallback(() => {
    const trimmed = renaming?.trim() ?? '';
    if (collection && activeDashboard && trimmed !== '') {
      commit(renameDashboard(collection, activeDashboard.id, trimmed));
    }
    setRenaming(null);
  }, [renaming, collection, activeDashboard, commit]);

  const handleDeleteDashboard = useCallback(() => {
    if (!collection || !activeDashboard) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    commit(removeDashboard(collection, activeDashboard.id));
    setDeleteArmed(false);
  }, [collection, activeDashboard, deleteArmed, commit]);

  // ── Widget-level actions ─────────────────────────────────────────────────

  const handleAddWidget = useCallback(
    (kind: WidgetKind) => {
      if (!collection || !activeDashboard) return;
      const widget = createStoredWidget(kind, activeDashboard.widgets.map(w => w.layout), GRID_COLS);
      if (!widget) return;
      commit(updateDashboard(collection, activeDashboard.id, d => addWidget(d, widget)));
    },
    [collection, activeDashboard, commit]
  );

  const handleRemoveWidget = useCallback(
    (widgetId: string) => {
      if (!collection || !activeDashboard) return;
      commit(updateDashboard(collection, activeDashboard.id, d => removeWidget(d, widgetId)));
    },
    [collection, activeDashboard, commit]
  );

  /**
   * The one place a Widget's config is persisted, by id — shared by the
   * dialog's own Save (`configuringWidgetId`, closed over below) and by a
   * Container Widget's `onConfigChange`, which needs to name the Widget it is
   * updating explicitly rather than relying on whichever one the dialog
   * currently has open.
   */
  const handleUpdateWidgetConfig = useCallback(
    (widgetId: string, config: WidgetConfig) => {
      if (!collection || !activeDashboard) return;
      commit(updateDashboard(collection, activeDashboard.id, d => updateWidgetConfig(d, widgetId, config)));
    },
    [collection, activeDashboard, commit]
  );

  const handleSaveWidgetConfig = useCallback(
    (config: WidgetConfig) => {
      if (configuringWidgetId === null) return;
      handleUpdateWidgetConfig(configuringWidgetId, config);
    },
    [configuringWidgetId, handleUpdateWidgetConfig]
  );

  const handleLayoutChange = useCallback(
    (layout: readonly Layout[]) => {
      if (!editing || !collection || !activeDashboard) return;
      const layouts = new Map(layout.map(l => [l.i, { x: l.x, y: l.y, w: l.w, h: l.h }]));
      commit(updateDashboard(collection, activeDashboard.id, d => applyWidgetLayouts(d, layouts)));
    },
    [editing, collection, activeDashboard, commit]
  );

  // ── Grid sizing ───────────────────────────────────────────────────────────

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
      activeDashboard?.widgets.map(w => {
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
    [activeDashboard]
  );

  const configuringWidget = useMemo(
    () => activeDashboard?.widgets.find(w => w.id === configuringWidgetId) ?? null,
    [activeDashboard, configuringWidgetId]
  );

  const tabs: readonly TabDefinition<string>[] = useMemo(
    () => (collection?.dashboards ?? []).map(d => ({ value: d.id, label: d.name })),
    [collection]
  );

  if (collection === undefined || collection.dashboards.length === 0) {
    return (
      <div className={styles.pane}>
        <p className={styles.notice}>
          {collection === undefined ? 'Loading…' : 'No Dashboards yet.'}
        </p>
        {collection !== undefined ? (
          <Button variant="primary" onClick={handleAddDashboard}>
            <Plus size={14} weight="bold" /> Create Dashboard
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.pane}>
      <Tabs value={activeDashboard?.id ?? ''} onValueChange={handleSwitchDashboard} tabs={tabs} aria-label="Dashboards">
        <div className={styles.actions}>
          <Button variant="ghost" size="sm" aria-label="New Dashboard" onClick={handleAddDashboard}>
            <Plus size={14} weight="bold" />
          </Button>

          {renaming !== null ? (
            <>
              <TextField
                aria-label="Dashboard name"
                autoFocus
                value={renaming}
                onChange={e => setRenaming(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
              <Button variant="ghost" size="sm" aria-label="Save Dashboard name" onClick={commitRename}>
                <Check size={14} weight="bold" />
              </Button>
              <Button variant="ghost" size="sm" aria-label="Cancel rename" onClick={() => setRenaming(null)}>
                <X size={14} />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Rename ${activeDashboard?.name ?? 'Dashboard'}`}
                onClick={startRename}
              >
                <PencilSimple size={14} />
              </Button>
              <Button
                variant={deleteArmed ? 'danger' : 'ghost'}
                size="sm"
                aria-label={deleteArmed ? `Confirm deleting ${activeDashboard?.name}` : `Delete ${activeDashboard?.name}`}
                onClick={handleDeleteDashboard}
                onBlur={() => setDeleteArmed(false)}
              >
                <TrashSimple size={14} />
                {deleteArmed ? 'Confirm?' : null}
              </Button>
            </>
          )}

          <span className={styles.spacer} />

          <Button variant={editing ? 'primary' : 'secondary'} size="sm" onClick={() => setEditing(v => !v)}>
            {editing ? 'Done Editing' : 'Edit'}
          </Button>
          {editing ? (
            <Menu
              trigger={
                <Button size="sm">
                  <Plus size={14} weight="bold" /> Add Widget
                </Button>
              }
            >
              {WIDGETS.map(definition => (
                <MenuItem key={definition.kind} onSelect={() => handleAddWidget(definition.kind)}>
                  {definition.title}
                </MenuItem>
              ))}
            </Menu>
          ) : null}
        </div>

        <TabPanel value={activeDashboard?.id ?? ''}>
          <div ref={containerRef} className={styles.gridHost}>
            {activeDashboard && activeDashboard.widgets.length === 0 ? (
              <p className={styles.notice}>
                {editing ? 'Add a Widget above to start building this Dashboard.' : 'This Dashboard has no Widgets yet.'}
              </p>
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
                {activeDashboard?.widgets.map(widget => {
                  const definition = widgetDefinition(widget.kind);
                  if (!definition) return null;
                  const WidgetComponent = definition.component;
                  return (
                    <div key={widget.id}>
                      <WidgetShell
                        label={widget.config.label}
                        editing={editing}
                        onConfigure={() => setConfiguringWidgetId(widget.id)}
                        onRemove={() => handleRemoveWidget(widget.id)}
                      >
                        <WidgetComponent
                          config={widget.config}
                          paneId={paneId}
                          editing={editing}
                          onConfigChange={config => handleUpdateWidgetConfig(widget.id, config)}
                        />
                      </WidgetShell>
                    </div>
                  );
                })}
              </GridLayout>
            )}
          </div>
        </TabPanel>
      </Tabs>

      {configuringWidget ? (
        <WidgetConfigDialog
          open
          onOpenChange={open => {
            if (!open) setConfiguringWidgetId(null);
          }}
          kind={configuringWidget.kind}
          config={configuringWidget.config}
          onSave={handleSaveWidgetConfig}
        />
      ) : null}
    </div>
  );
}
