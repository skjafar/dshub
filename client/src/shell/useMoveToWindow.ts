/**
 * "Move to Window" — relocating a Pane into a different, already-open
 * Window with its filter and selection intact
 * (`.scratch/daughter-windows-native` issue 05). Shared by the Main
 * Window and every Daughter Window, the same way `useMoveToNewDaughterWindow.ts`
 * already is: the mechanism is identical regardless of which Window's tab
 * it was invoked from, or which Window ends up receiving the Pane.
 *
 * Only removes the source panel *after* the handoff itself is confirmed
 * sent — mirroring `useMoveToNewDaughterWindow.ts`'s own "only remove after
 * success" reasoning, so a lost or refused `emit` cannot drop a Pane
 * entirely.
 */

import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { DockviewApi, IDockviewPanel } from 'dockview';
import { moveTargets } from './daughterWindows';
import type { MoveTarget } from './daughterWindows';
import type { WindowId } from './focusMode';
import { sendPaneHandoff, useIncomingPaneHandoffs } from './paneHandoff';
import type { PaneHandoffPayload } from './paneHandoff';
import { kindOfPaneId, paneDefinition } from './paneRegistry';
import type { PaneKind } from './paneRegistry';
import { snapshotPaneStates } from './paneState';

export interface MoveToWindow {
  /**
   * Every open Window `panel` could move into right now — for the tab
   * context menu's own item list. Computed fresh per call rather than held
   * as hook state, since it depends on which specific panel the menu was
   * opened for, not on anything this hook alone tracks.
   */
  targetsFor(panel: IDockviewPanel): readonly MoveTarget[];
  /** Call from a tab's "Move to [Window]" context-menu action. */
  requestMove(panel: IDockviewPanel, targetWindowId: WindowId): void;
}

export function useMoveToWindow(
  apiRef: RefObject<DockviewApi | null>,
  ownWindowId: WindowId,
  openDaughterWindowLabels: readonly string[],
  paneLocations: ReadonlyMap<WindowId, readonly string[]>,
  openPane: (kind: PaneKind, paneState: unknown) => void
): MoveToWindow {
  const targetsFor = useCallback(
    (panel: IDockviewPanel): readonly MoveTarget[] => {
      const kind = kindOfPaneId(panel.id);
      const definition = kind && paneDefinition(kind);
      if (!definition) return [];
      return moveTargets(definition, ownWindowId, paneLocations, openDaughterWindowLabels);
    },
    [ownWindowId, paneLocations, openDaughterWindowLabels]
  );

  const requestMove = useCallback(
    (panel: IDockviewPanel, targetWindowId: WindowId) => {
      const kind = kindOfPaneId(panel.id);
      if (!kind) return;
      const paneState = snapshotPaneStates([panel.id])[panel.id];

      sendPaneHandoff({ targetWindowId, kind, paneState })
        .then(() => {
          apiRef.current?.removePanel(panel);
        })
        .catch(error => {
          console.error('Failed to hand this Pane off to another Window.', error);
        });
    },
    [apiRef]
  );

  const handleIncoming = useCallback(
    (payload: PaneHandoffPayload) => {
      openPane(payload.kind, payload.paneState);
    },
    [openPane]
  );
  useIncomingPaneHandoffs(ownWindowId, handleIncoming);

  return { targetsFor, requestMove };
}
