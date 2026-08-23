/**
 * "Move to new window" — the tab-context-menu action shared by the Main
 * Window and every Daughter Window (`.scratch/daughter-windows-native`
 * issue 02) — plus the drag-out gesture that restores the original spec's
 * headline interaction against the new mechanism (issue 07): dragging a
 * Pane's tab past every open Window's edge and releasing it there. Both
 * paths open a genuinely new Daughter Window and only remove the source
 * panel once that succeeds ("only remove after success" — a lost or
 * refused window creation must never drop a Pane entirely), so they share
 * one hook, one pending-confirmation dialog and one 5th-window warning
 * rather than two independent copies of the same shape.
 *
 * Unlike the menu command, drag-out carries the dragged Pane's own state
 * (`paneState.ts`'s `snapshotPaneStates`) into the fresh window — the menu
 * command still opens empty (ADR 0005's own documented consequence,
 * unchanged here), but a drag the user is watching land somewhere and lose
 * its filter would read as a bug, not a feature. See
 * `daughterWindowNative.ts`'s `openDaughterWindowAt` for why this travels
 * on the new window's own URL rather than through `paneHandoff.ts`'s live
 * broadcast: that mechanism assumes its target is already open and already
 * listening, which a window this call is still in the middle of creating is
 * not.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { DockviewApi, IDockviewPanel } from 'dockview';
import { openDaughterWindow, openDaughterWindowAt, readWindowBounds, useDaughterWindows } from './daughterWindowNative';
import {
  DAUGHTER_WINDOW_DEFAULT_HEIGHT,
  DAUGHTER_WINDOW_DEFAULT_WIDTH,
  dragOutTarget,
  knownWindowIds,
  shouldWarnBeforeNewDaughterWindow,
} from './daughterWindows';
import { kindOfPaneId } from './paneRegistry';
import { snapshotPaneStates } from './paneState';
import type { DaughterWindowBounds } from './workspaceStore';

type PendingRequest =
  | { readonly kind: 'menu'; readonly panel: IDockviewPanel }
  | { readonly kind: 'dragout'; readonly panel: IDockviewPanel; readonly bounds: DaughterWindowBounds };

export interface MoveToNewDaughterWindow {
  /** Call from a tab's "Move to new window" context-menu action. */
  requestMove(panel: IDockviewPanel): void;
  /** Non-null while the 5th-window confirmation dialog should show. */
  readonly pendingPanel: IDockviewPanel | null;
  confirm(): void;
  cancel(): void;
  /**
   * Wires the drag-out gesture onto a live dockview instance. Call exactly
   * once, from `handleReady` — mirrors how that same handler registers
   * dockview's other lifetime-of-the-instance listeners (`onDidLayoutChange`
   * and the like).
   */
  attachDragOutListener(api: DockviewApi): void;
}

export function useMoveToNewDaughterWindow(apiRef: RefObject<DockviewApi | null>): MoveToNewDaughterWindow {
  const openWindows = useDaughterWindows();
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);

  const reallyMove = useCallback(
    (panel: IDockviewPanel, bounds: DaughterWindowBounds | null) => {
      const kind = kindOfPaneId(panel.id);
      if (!kind) return;
      const opened =
        bounds === null
          ? openDaughterWindow(kind)
          : openDaughterWindowAt(kind, bounds, snapshotPaneStates([panel.id])[panel.id]);
      void opened
        .then(() => {
          apiRef.current?.removePanel(panel);
        })
        .catch(error => {
          console.error('Failed to open a new Daughter Window.', error);
        });
    },
    [apiRef]
  );

  // Shared by both public entry points below: queue for confirmation past
  // the warning threshold, otherwise open immediately. `bounds` alone tells
  // `reallyMove` which of the two Rust commands to call, so this is the one
  // place that decision and the queued request's own `kind` tag are set
  // together, rather than each public method repeating both.
  const requestOpen = useCallback(
    (panel: IDockviewPanel, bounds: DaughterWindowBounds | null) => {
      if (shouldWarnBeforeNewDaughterWindow(openWindows.length)) {
        setPendingRequest(bounds === null ? { kind: 'menu', panel } : { kind: 'dragout', panel, bounds });
        return;
      }
      reallyMove(panel, bounds);
    },
    [openWindows.length, reallyMove]
  );

  const requestMove = useCallback((panel: IDockviewPanel) => requestOpen(panel, null), [requestOpen]);

  const requestDragOut = useCallback(
    (panel: IDockviewPanel, bounds: DaughterWindowBounds) => requestOpen(panel, bounds),
    [requestOpen]
  );

  const confirm = useCallback(() => {
    if (pendingRequest) reallyMove(pendingRequest.panel, pendingRequest.kind === 'dragout' ? pendingRequest.bounds : null);
    setPendingRequest(null);
  }, [pendingRequest, reallyMove]);

  const cancel = useCallback(() => setPendingRequest(null), []);

  // Read fresh from a ref rather than closed over directly by the dockview
  // listener below: `attachDragOutListener` itself only ever runs once per
  // dockview instance (called from `handleReady`), so a value it captured
  // directly at that moment would stay frozen at whatever it was when the
  // Workspace first mounted — typically before any Daughter Window was open
  // — and the 5th-window warning would never see a later, truer count.
  const requestDragOutRef = useRef(requestDragOut);
  useEffect(() => {
    requestDragOutRef.current = requestDragOut;
  }, [requestDragOut]);
  const openWindowsRef = useRef(openWindows);
  useEffect(() => {
    openWindowsRef.current = openWindows;
  }, [openWindows]);

  const attachDragOutListener = useCallback((api: DockviewApi) => {
    // dockview has no "did drag end" event of its own — `onWillDragPanel`
    // only fires at drag start — so the native `dragend`, the only signal
    // for where the pointer actually let go, is attached by hand, to the
    // dragged tab's own document: the drag may have started inside a
    // Daughter Window rather than this one.
    api.onWillDragPanel(({ panel, nativeEvent }) => {
      if (!(nativeEvent instanceof DragEvent)) return;
      const doc = nativeEvent.target instanceof Node ? nativeEvent.target.ownerDocument : document;

      const handleDragEnd = (event: DragEvent): void => {
        doc.removeEventListener('dragend', handleDragEnd);

        const point = { x: event.screenX, y: event.screenY };
        void readWindowBounds(knownWindowIds(openWindowsRef.current)).then(bounds => {
          const target = dragOutTarget(point, bounds);
          // Dropped inside an already-open Window's bounds — dockview's own
          // in-window drop (or, dropped over a *different* open Window,
          // simply nothing) handles it; this gesture only ever creates a
          // window for a point outside every one of them.
          if (target === null) return;
          requestDragOutRef.current(panel, {
            x: target.left,
            y: target.top,
            width: DAUGHTER_WINDOW_DEFAULT_WIDTH,
            height: DAUGHTER_WINDOW_DEFAULT_HEIGHT,
          });
        });
      };
      doc.addEventListener('dragend', handleDragEnd);
    });
  }, []);

  return { requestMove, pendingPanel: pendingRequest?.panel ?? null, confirm, cancel, attachDragOutListener };
}
