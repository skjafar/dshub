import { useCallback, useRef, useState } from 'react';
import type { DockviewApi } from 'dockview';
import { TooltipProvider } from '../ui';
import { AppChrome } from './AppChrome';
import { Workspace } from './Workspace';
import { kindOfPaneId, paneDefinition, paneId } from './paneRegistry';
import type { PaneKind } from './paneRegistry';
import styles from './AppShell.module.css';

/** The arrangement a session opens into before anyone has rearranged anything. */
const DEFAULT_LAYOUT: readonly PaneKind[] = ['overview'];

/**
 * The application shell: chrome above, Workspace below.
 *
 * The shell owns which Panes are open — not the Workspace — because opening a
 * Pane and reopening a closed one have to be the same operation. Two paths for
 * that is how you end up with a Pane that can be closed and never recovered.
 */
export function AppShell(): React.JSX.Element {
  const apiRef = useRef<DockviewApi | null>(null);
  const [openKinds, setOpenKinds] = useState<readonly PaneKind[]>([]);

  /** Mirrors dockview's own panel list, which is the only authority on it. */
  const syncOpenKinds = useCallback((api: DockviewApi) => {
    const kinds = api.panels
      .map(panel => kindOfPaneId(panel.id))
      .filter((kind): kind is PaneKind => kind !== undefined);
    setOpenKinds([...new Set(kinds)]);
  }, []);

  const openPane = useCallback((kind: PaneKind) => {
    const api = apiRef.current;
    const definition = paneDefinition(kind);
    if (!api || !definition) return;

    if (definition.singleton) {
      // Already open: focus it rather than duplicate it, so the menu entry
      // reads as "take me there" instead of appearing to do nothing.
      const existing = api.getPanel(paneId(kind));
      if (existing) {
        existing.api.setActive();
        return;
      }
      api.addPanel({ id: paneId(kind), component: kind, title: definition.title });
      return;
    }

    // Several of this kind may be open at once, each with its own filter and
    // selection, so each needs its own identity.
    const taken = new Set(api.panels.map(panel => panel.id));
    let instance = 1;
    while (taken.has(paneId(kind, instance))) instance += 1;
    api.addPanel({
      id: paneId(kind, instance),
      component: kind,
      title: `${definition.title} ${instance}`,
    });
  }, []);

  const handleReady = useCallback(
    (api: DockviewApi) => {
      apiRef.current = api;

      for (const kind of DEFAULT_LAYOUT) {
        const definition = paneDefinition(kind);
        if (definition) {
          api.addPanel({ id: paneId(kind), component: kind, title: definition.title });
        }
      }

      // Closing or opening a Pane changes what the reopen menu should offer, so
      // the shell follows dockview rather than trying to predict it.
      api.onDidLayoutChange(() => syncOpenKinds(api));
      syncOpenKinds(api);

      // Reachable from the browser console during development, alongside
      // `window.dshubFaults`. An arrangement is the thing this shell is for, and
      // being able to build one from the console is what makes it reviewable
      // before there are enough Pane kinds to build one by hand. Gated on the
      // dev build rather than on the absence of Tauri, so it cannot ship.
      if (import.meta.env.DEV) {
        (window as unknown as { dshubWorkspace?: DockviewApi }).dshubWorkspace = api;
      }
    },
    [syncOpenKinds]
  );

  return (
    <TooltipProvider>
      <div className={styles.shell}>
        <AppChrome openKinds={openKinds} onOpenPane={openPane} />
        <div className={styles.workspaceHost}>
          <Workspace onReady={handleReady} />
        </div>
      </div>
    </TooltipProvider>
  );
}
