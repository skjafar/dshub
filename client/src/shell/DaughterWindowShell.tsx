import { useCallback, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import type { DockviewApi } from 'dockview';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Button, Dialog, TooltipProvider } from '../ui';
import { useBackendPort } from '../contexts/BackendPortContext';
import { DaughterWindowChrome } from './DaughterWindowChrome';
import { paneMenuEntries } from './daughterWindows';
import { closeDaughterWindow } from './daughterWindowNative';
import { FocusModeProvider } from './FocusModeContext';
import { FocusModeView } from './FocusModeView';
import { MAIN_WINDOW_ID } from './focusMode';
import { SelectionProvider, useSelection } from './SelectionContext';
import { Workspace } from './Workspace';
import { PANES, isKnownPaneKind, kindOfPaneId, paneDefinition, paneId } from './paneRegistry';
import type { PaneKind } from './paneRegistry';
import { retainPaneState } from './paneState';
import { retainSeriesFor } from './plotStream';
import { useMoveToNewDaughterWindow } from './useMoveToNewDaughterWindow';
import styles from './DaughterWindowShell.module.css';

/**
 * A genuinely separate `WebviewWindow`'s own top-level shell
 * (`.scratch/daughter-windows-native` issue 02) — its own React tree, its
 * own dockview instance, not dockview's own adopted-DOM popout (ADR 0004,
 * superseded by ADR 0005). Reads the one Pane it opens with from
 * `window.location.search` (`?pane=<kind>`, set by
 * `src-tauri/src/daughter_windows.rs`'s `open_daughter_window`), then behaves
 * like a small, single-purpose Workspace: an "add a Pane" control, Device
 * link/Control state read-only, and nothing else (spec.md) —
 * Connect/Control/Workspace/Profile/Settings stay exclusive to the Main
 * Window (`AppShell.tsx`).
 *
 * Persisting this Window's own arrangement across an app restart is issue
 * 03's job, not this one's — every Pane here starts fresh each time the
 * Window is created, seeded only from the query string above.
 */
function initialPaneKind(): PaneKind | null {
  const raw = new URLSearchParams(window.location.search).get('pane');
  return raw !== null && isKnownPaneKind(raw) ? raw : null;
}

function DaughterWindowShellInner(): React.JSX.Element {
  const apiRef = useRef<DockviewApi | null>(null);
  const [openKinds, setOpenKinds] = useState<readonly PaneKind[]>([]);
  const [focusDashboardId, setFocusDashboardId] = useState<string | null>(null);
  const { retainPanes } = useSelection();
  const port = useBackendPort();
  const moveToNewWindow = useMoveToNewDaughterWindow(apiRef);

  const seed = useMemo(() => initialPaneKind(), []);

  /** This Window's own identity for Focus Mode's plot-series ownership key
   *  — distinct from `paneMenuEntries`' use of `MAIN_WINDOW_ID` below, which
   *  is a deliberate no-op simplification for a different concern (see
   *  that call site's own comment). This shell only ever mounts under real
   *  Tauri (`App.tsx`'s `isMainWindow()` routes everywhere else to
   *  `AppShell`), but the `isTauri()` guard is kept anyway, matching
   *  `windowRole.ts`'s own pattern, rather than assuming: a test rendering
   *  this component directly has no such guarantee. */
  const windowId = useMemo(() => (isTauri() ? getCurrentWindow().label : 'daughter'), []);

  const syncOpenPanes = useCallback(
    (api: DockviewApi) => {
      const ids = api.panels.map(panel => panel.id);
      const kinds = ids.map(id => kindOfPaneId(id)).filter((kind): kind is PaneKind => kind !== undefined);
      setOpenKinds([...new Set(kinds)]);
      retainPaneState(ids);
      retainPanes(ids);
      retainSeriesFor(port, ids);
    },
    [retainPanes, port]
  );

  const openPane = useCallback((kind: PaneKind) => {
    const api = apiRef.current;
    const definition = paneDefinition(kind);
    if (!api || !definition) return;

    if (definition.singleton) {
      const existing = api.getPanel(paneId(kind));
      if (existing) {
        existing.api.setActive();
        return;
      }
      api.addPanel({ id: paneId(kind), component: kind, title: definition.title });
      return;
    }

    const taken = new Set(api.panels.map(panel => panel.id));
    let instance = 1;
    while (taken.has(paneId(kind, instance))) instance += 1;
    api.addPanel({ id: paneId(kind, instance), component: kind, title: `${definition.title} ${instance}` });
  }, []);

  const handleReady = useCallback(
    (api: DockviewApi) => {
      apiRef.current = api;
      if (seed !== null) openPane(seed);
      syncOpenPanes(api);

      // A Daughter Window that loses its last Pane closes itself (spec.md) —
      // purely a local check against this window's own dockview instance,
      // unlike the Main Window's cross-window `closeEmptyPopouts` (which no
      // longer applies: nothing here has popouts of its own).
      api.onDidLayoutChange(() => {
        syncOpenPanes(api);
        if (api.panels.length === 0) {
          void closeDaughterWindow(windowId);
        }
      });
    },
    [seed, openPane, syncOpenPanes, windowId]
  );

  const handleOpenPane = useCallback((kind: PaneKind) => openPane(kind), [openPane]);

  const handleTabContextMenuItems: NonNullable<ComponentProps<typeof Workspace>['getTabContextMenuItems']> =
    useCallback(
      ({ panel }) => [
        'close',
        'closeOthers',
        'closeAll',
        'separator',
        { label: 'Move to new window', action: () => moveToNewWindow.requestMove(panel) },
      ],
      [moveToNewWindow]
    );

  const enterFocusMode = useCallback((dashboardId: string) => {
    setFocusDashboardId(dashboardId);
  }, []);

  const exitFocusMode = useCallback(() => setFocusDashboardId(null), []);

  return (
    <FocusModeProvider enter={enterFocusMode}>
      <div className={styles.shell}>
        {focusDashboardId !== null ? (
          <FocusModeView dashboardId={focusDashboardId} windowId={windowId} onExit={exitFocusMode} />
        ) : (
          <DaughterWindowChrome
            entries={apiRef.current ? paneMenuEntries(PANES, openKinds, apiRef.current, MAIN_WINDOW_ID, []) : []}
            onOpenPane={handleOpenPane}
          />
        )}
        {/* Always mounted, hidden rather than unmounted during Focus Mode —
            same reasoning as `AppShell.tsx`'s own `workspaceHost`, just for
            this Window's own arrangement rather than a shared instance
            other Windows depend on: unmounting would rebuild this Window's
            dockview from scratch on exit, losing whatever the user had
            added beyond the one seeded Pane, since nothing here is saved
            (issue 03's job). */}
        <div className={styles.workspaceHost} hidden={focusDashboardId !== null}>
          <Workspace onReady={handleReady} getTabContextMenuItems={handleTabContextMenuItems} />
        </div>
      </div>

      <Dialog
        open={moveToNewWindow.pendingPanel !== null}
        onOpenChange={open => {
          if (!open) moveToNewWindow.cancel();
        }}
        title="Open another Daughter Window?"
        description="You already have several Daughter Windows open."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={moveToNewWindow.cancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={moveToNewWindow.confirm}>
              Open window
            </Button>
          </>
        }
      >
        <p>Each one keeps arranging and polling — this is a soft limit, not a hard one, if your bench genuinely needs it.</p>
      </Dialog>
    </FocusModeProvider>
  );
}

export function DaughterWindowShell(): React.JSX.Element {
  return (
    <TooltipProvider>
      <SelectionProvider>
        <DaughterWindowShellInner />
      </SelectionProvider>
    </TooltipProvider>
  );
}
