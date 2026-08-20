/**
 * "Move to new window" — the tab-context-menu action shared by the Main
 * Window and every Daughter Window (`.scratch/daughter-windows-native`
 * issue 02). Reused rather than built twice: the ticket's own wording
 * ("using the *existing* 'Move to new window' tab command") doesn't
 * restrict this to the Main Window, and the mechanism is identical
 * regardless of which window's tab it was invoked from.
 *
 * Only removes the source panel *after* the new window opens successfully —
 * removing first and creating second would risk losing the Pane entirely if
 * window creation fails.
 */

import { useCallback, useState } from 'react';
import type { RefObject } from 'react';
import type { DockviewApi, IDockviewPanel } from 'dockview';
import { openDaughterWindow, useDaughterWindows } from './daughterWindowNative';
import { shouldWarnBeforeNewDaughterWindow } from './daughterWindows';
import { kindOfPaneId } from './paneRegistry';

export interface MoveToNewDaughterWindow {
  /** Call from a tab's "Move to new window" context-menu action. */
  requestMove(panel: IDockviewPanel): void;
  /** Non-null while the 5th-window confirmation dialog should show. */
  readonly pendingPanel: IDockviewPanel | null;
  confirm(): void;
  cancel(): void;
}

export function useMoveToNewDaughterWindow(apiRef: RefObject<DockviewApi | null>): MoveToNewDaughterWindow {
  const openWindows = useDaughterWindows();
  const [pendingPanel, setPendingPanel] = useState<IDockviewPanel | null>(null);

  const reallyMove = useCallback(
    (panel: IDockviewPanel) => {
      const kind = kindOfPaneId(panel.id);
      if (!kind) return;
      void openDaughterWindow(kind)
        .then(() => {
          apiRef.current?.removePanel(panel);
        })
        .catch(error => {
          console.error('Failed to open a new Daughter Window.', error);
        });
    },
    [apiRef]
  );

  const requestMove = useCallback(
    (panel: IDockviewPanel) => {
      if (shouldWarnBeforeNewDaughterWindow(openWindows.length)) {
        setPendingPanel(panel);
        return;
      }
      reallyMove(panel);
    },
    [openWindows.length, reallyMove]
  );

  const confirm = useCallback(() => {
    if (pendingPanel) reallyMove(pendingPanel);
    setPendingPanel(null);
  }, [pendingPanel, reallyMove]);

  const cancel = useCallback(() => setPendingPanel(null), []);

  return { requestMove, pendingPanel, confirm, cancel };
}
