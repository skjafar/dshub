import { useCallback, useMemo } from 'react';
import { DockviewReact } from 'dockview-react';
import type { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from 'dockview';
import { PaneBoundary } from './PaneBoundary';
import { PANES, paneDefinition } from './paneRegistry';
import type { PaneKind } from './paneRegistry';
import styles from './Workspace.module.css';

import 'dockview/dist/styles/dockview.css';

export interface WorkspaceProps {
  /** Handed the dock api once it is live, so the chrome can open Panes. */
  readonly onReady: (api: DockviewApi) => void;
}

/**
 * Wraps a Pane's content in its own error boundary.
 *
 * Built per pane kind rather than once, because React unwinds to the nearest
 * boundary — one boundary around the Workspace would let a single failing Pane
 * blank every other.
 */
function paneComponentFor(kind: PaneKind): React.FunctionComponent<IDockviewPanelProps> {
  const definition = paneDefinition(kind);
  if (!definition) throw new Error(`No pane definition for "${kind}"`);
  const Pane = definition.component;

  return function DockedPane() {
    return (
      <div className={styles.paneContent}>
        <PaneBoundary title={definition.title}>
          <Pane />
        </PaneBoundary>
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
export function Workspace({ onReady }: WorkspaceProps): React.JSX.Element {
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
    />
  );
}
