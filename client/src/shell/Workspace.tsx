import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { DockviewReact } from 'dockview-react';
import type { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from 'dockview';
import { PaneBoundary } from './PaneBoundary';
import { PortalContainerScope } from '../ui';
import { PANES, paneDefinition } from './paneRegistry';
import type { PaneKind } from './paneRegistry';
import styles from './Workspace.module.css';

import 'dockview/dist/styles/dockview.css';

export interface WorkspaceProps {
  /** Handed the dock api once it is live, so the chrome can open Panes. */
  readonly onReady: (api: DockviewApi) => void;
  /**
   * A tab's right-click menu — "Move to new window" (issue 03) is the one
   * entry the shell adds; passed straight through since dockview has no
   * "drag to here" equivalent of a context menu of its own to compose with.
   */
  readonly getTabContextMenuItems?: ComponentProps<typeof DockviewReact>['getTabContextMenuItems'];
}

/**
 * Wraps a Pane's content in its own error boundary.
 *
 * Built per pane kind rather than once, because React unwinds to the nearest
 * boundary — one boundary around the Workspace would let a single failing Pane
 * blank every other.
 *
 * This is also where dockview stops. A Pane receives its own id and a way to
 * rename its tab, and nothing else: handed the dock api it could rearrange the
 * Workspace around itself, and every Pane would have to be read to know what the
 * layout can do.
 */
function paneComponentFor(kind: PaneKind): React.FunctionComponent<IDockviewPanelProps> {
  const definition = paneDefinition(kind);
  if (!definition) throw new Error(`No pane definition for "${kind}"`);
  const Pane = definition.component;

  return function DockedPane({ api }: IDockviewPanelProps) {
    const setTitle = useCallback((title: string) => api.setTitle(title), [api]);

    // Which document a Radix menu, dialog or tooltip this Pane opens should
    // portal into — this Pane's own, which is wherever dockview has actually
    // adopted its DOM right now (a Daughter Window, once one exists — ADR
    // 0004). Resolved from the rendered node itself rather than cached from
    // props: a cross-Window drag relocates the DOM without remounting this
    // component, so `onDidLocationChange` is the cue to re-read it, not a
    // value to hold onto.
    const rootRef = useRef<HTMLDivElement>(null);
    const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

    useEffect(() => {
      const resolve = (): void => {
        const doc = rootRef.current?.ownerDocument;
        // null for the Main Window is deliberate, not a missing case:
        // `usePortalContainer`'s own default is `document.body`, so naming it
        // here would just be a second place that default is decided.
        setPortalContainer(doc && doc !== document ? doc.body : null);
      };
      resolve();
      const subscription = api.onDidLocationChange(resolve);
      return () => subscription.dispose();
    }, [api]);

    return (
      <div ref={rootRef} className={styles.paneContent}>
        <PortalContainerScope container={portalContainer}>
          <PaneBoundary title={definition.title}>
            <Pane paneId={api.id} setTitle={setTitle} />
          </PaneBoundary>
        </PortalContainerScope>
      </div>
    );
  };
}

function Watermark(): React.JSX.Element {
  return (
    <div className={styles.watermark}>
      <p className={styles.watermarkTitle}>No panes open</p>
      <p>Reopen one from the Panes menu above.</p>
    </div>
  );
}

/**
 * The Workspace: a dockable arrangement of Panes.
 *
 * Panes can be dragged to any edge, resized by their shared border, and closed.
 * Nothing here decides *which* Panes are open — that is the chrome's job through
 * the api handed back on ready, so that opening a Pane and reopening a closed
 * one are the same operation rather than two.
 */
export function Workspace({ onReady, getTabContextMenuItems }: WorkspaceProps): React.JSX.Element {
  const components = useMemo(
    () =>
      Object.fromEntries(
        PANES.map(pane => [pane.kind, paneComponentFor(pane.kind)])
      ) as Record<string, React.FunctionComponent<IDockviewPanelProps>>,
    []
  );

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      onReady(event.api);
    },
    [onReady]
  );

  return (
    <DockviewReact
      className={styles.workspace}
      components={components}
      watermarkComponent={Watermark}
      onReady={handleReady}
      getTabContextMenuItems={getTabContextMenuItems}
    />
  );
}
