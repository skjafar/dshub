import { useCallback, useRef, useState } from 'react';
import type { AddPanelPositionOptions, DockviewApi } from 'dockview';
import { TooltipProvider } from '../ui';
import { AppChrome } from './AppChrome';
import { SelectionProvider, useSelection } from './SelectionContext';
import { Workspace } from './Workspace';
import { kindOfPaneId, paneDefinition, paneId } from './paneRegistry';
import type { PaneKind } from './paneRegistry';
import { retainPaneState } from './paneState';
import styles from './AppShell.module.css';

/** One Pane of the arrangement a session opens into. */
interface DefaultPane {
  readonly kind: PaneKind;
  /** Where it goes relative to the Pane opened before it. */
  readonly direction?: 'right' | 'below';
  readonly initialWidth?: number;
}

/**
 * The arrangement a session opens into before anyone has rearranged anything.
 *
 * Three Panes side by side rather than three tabs, because seeing two surfaces
 * at once is the entire reason the sidebar was replaced — an arrangement that
 * opens stacked would demonstrate none of it. The Inspector is narrow: it reads
 * one entry, and giving it an even third would take that width from the table it
 * is describing.
 */
const INSPECTOR_WIDTH = 340;
const REGISTER_WIDTH = 620;

const DEFAULT_LAYOUT: readonly DefaultPane[] = [
  { kind: 'overview' },
  // A new Pane's width comes out of the Pane it is placed against, so the
  // Register Pane has to be opened wide enough to still have its own width left
  // after the Inspector takes a share of it. Asking for 620 directly leaves 280,
  // which is narrow enough to push the value column out of sight — the one
  // column the Pane exists to show.
  { kind: 'register', direction: 'right', initialWidth: REGISTER_WIDTH + INSPECTOR_WIDTH },
  { kind: 'inspector', direction: 'right', initialWidth: INSPECTOR_WIDTH },
];

/**
 * The application shell: chrome above, Workspace below.
 *
 * The shell owns which Panes are open — not the Workspace — because opening a
 * Pane and reopening a closed one have to be the same operation. Two paths for
 * that is how you end up with a Pane that can be closed and never recovered.
 */
function WorkspaceShell(): React.JSX.Element {
  const apiRef = useRef<DockviewApi | null>(null);
  const [openKinds, setOpenKinds] = useState<readonly PaneKind[]>([]);
  const { retainPanes } = useSelection();

  /** Mirrors dockview's own panel list, which is the only authority on it. */
  const syncOpenPanes = useCallback(
    (api: DockviewApi) => {
      const ids = api.panels.map(panel => panel.id);

      const kinds = ids
        .map(id => kindOfPaneId(id))
        .filter((kind): kind is PaneKind => kind !== undefined);
      setOpenKinds([...new Set(kinds)]);

      // A closed Pane is gone: its filter must not come back with the next Pane
      // of its kind, and the Inspector must not keep describing a selection made
      // in a surface that is no longer on screen.
      retainPaneState(ids);
      retainPanes(ids);
    },
    [retainPanes]
  );

  const openPane = useCallback(
    (kind: PaneKind, position?: AddPanelPositionOptions, initialWidth?: number): string | null => {
      const api = apiRef.current;
      const definition = paneDefinition(kind);
      if (!api || !definition) return null;

      if (definition.singleton) {
        // Already open: focus it rather than duplicate it, so the menu entry
        // reads as "take me there" instead of appearing to do nothing.
        const existing = api.getPanel(paneId(kind));
        if (existing) {
          existing.api.setActive();
          return existing.id;
        }
        const id = paneId(kind);
        api.addPanel({ id, component: kind, title: definition.title, position, initialWidth });
        return id;
      }

      // Several of this kind may be open at once, each with its own filter and
      // selection, so each needs its own identity. Numbering from 1 rather than
      // 0 keeps every instance's tab reading the same way, instead of the first
      // being unnumbered and every later one numbered.
      const taken = new Set(api.panels.map(panel => panel.id));
      let instance = 1;
      while (taken.has(paneId(kind, instance))) instance += 1;
      const id = paneId(kind, instance);
      api.addPanel({
        id,
        component: kind,
        title: `${definition.title} ${instance}`,
        position,
        initialWidth,
      });
      return id;
    },
    []
  );

  const handleReady = useCallback(
    (api: DockviewApi) => {
      apiRef.current = api;

      // Each Pane is placed against the one before it, so the arrangement is the
      // one written here rather than whichever group happened to be active.
      let previousId: string | null = null;
      for (const entry of DEFAULT_LAYOUT) {
        const position: AddPanelPositionOptions | undefined =
          previousId !== null && entry.direction !== undefined
            ? { referencePanel: previousId, direction: entry.direction }
            : undefined;
        const id = openPane(entry.kind, position, entry.initialWidth);
        if (id !== null) previousId = id;
      }

      // Closing or opening a Pane changes what the reopen menu should offer, so
      // the shell follows dockview rather than trying to predict it.
      api.onDidLayoutChange(() => syncOpenPanes(api));
      syncOpenPanes(api);

      // Reachable from the browser console during development, alongside
      // `window.dshubFaults`. An arrangement is the thing this shell is for, and
      // being able to build one from the console is what makes it reviewable
      // before there are enough Pane kinds to build one by hand. Gated on the
      // dev build rather than on the absence of Tauri, so it cannot ship.
      if (import.meta.env.DEV) {
        (window as unknown as { dshubWorkspace?: DockviewApi }).dshubWorkspace = api;
      }
    },
    [openPane, syncOpenPanes]
  );

  const handleOpenPane = useCallback((kind: PaneKind) => openPane(kind), [openPane]);

  return (
    <div className={styles.shell}>
      <AppChrome openKinds={openKinds} onOpenPane={handleOpenPane} />
      <div className={styles.workspaceHost}>
        <Workspace onReady={handleReady} />
      </div>
    </div>
  );
}

/**
 * The shell's providers.
 *
 * Separate from the shell body only because the body has to *read* the selection
 * to prune it when a Pane closes, and a component cannot consume a context it
 * provides.
 */
export function AppShell(): React.JSX.Element {
  return (
    <TooltipProvider>
      <SelectionProvider>
        <WorkspaceShell />
      </SelectionProvider>
    </TooltipProvider>
  );
}
