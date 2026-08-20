/**
 * Handing one Pane off from the Window it is open in to a different,
 * already-open Window — "Move to Window" (`.scratch/daughter-windows-native`
 * issue 05), reusing issue 04's own `@tauri-apps/api/event` broadcast
 * mechanism (`paneLocations.ts`) rather than building a second one: no
 * shared JS realm means the only way to move a Pane's own state across
 * Windows at all is to serialize it onto the wire.
 *
 * A genuinely new Daughter Window (`useMoveToNewDaughterWindow.ts`'s "Move
 * to new window") needs none of this — it opens fresh and empty by design
 * (ADR 0005's own documented consequence). This module is only for
 * relocating into a Window that is *already open*, where "already open"
 * means its own listener has been live for a while — unlike
 * `paneLocations.ts`'s late-joiner problem, there is no catch-up handshake
 * needed here, since a target only ever appears in `daughterWindows.ts`'s
 * `moveTargets` once it is already running and already listening.
 */

import { isTauri } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';
import type { WindowId } from './focusMode';
import type { PaneKind } from './paneRegistry';

export const PANE_HANDOFF_EVENT = 'pane-handoff';

/**
 * One Pane's own content, on its way from one Window's dockview to
 * another's. `paneState` is whatever `paneState.ts`'s `snapshotPaneStates`
 * held for the moved panel id — opaque here the same way it is opaque to
 * that module itself, since each Pane kind owns its own shape.
 *
 * Carries no title: every Pane kind that shows one computes it itself, from
 * its own state, in its own `useEffect(() => setTitle(...), ...)` —
 * `AddressSpacePane.tsx`'s own instance number and filter query,
 * `InspectorPane.tsx`'s currently-described entry, and so on — so whatever
 * title dockview's `addPanel` was given is superseded on the very first
 * render regardless (confirmed against a real dockview instance in
 * `DaughterWindowShell.test.tsx`, not assumed: an earlier draft carried a
 * `title` field here and asserted a moved Register Pane's tab kept its old
 * name — it did not, and could not, since `AddressSpacePane` always
 * recomputes it). Carrying one across the wire would be dead weight, not a
 * feature.
 */
export interface PaneHandoffPayload {
  readonly targetWindowId: WindowId;
  readonly kind: PaneKind;
  readonly paneState: unknown;
}

/**
 * Hands a Pane off to `payload.targetWindowId`, resolving once the local
 * IPC dispatch itself succeeds — not once the target has received or acted
 * on it, which nothing here can confirm. Callers still gate removing the
 * source panel on this resolving rather than firing it and forgetting,
 * mirroring `useMoveToNewDaughterWindow.ts`'s own "only remove after
 * success" reasoning: a `.catch()` upstream, not a dropped Pane, is the
 * outcome of the one real failure this can surface (a lost or refused
 * `emit`). A safe no-op outside Tauri — there is only ever one Window
 * there, so nothing to hand off to.
 */
export function sendPaneHandoff(payload: PaneHandoffPayload): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return emit(PANE_HANDOFF_EVENT, payload);
}

/**
 * Calls `onReceive` for every handoff addressed to `ownWindowId`, ignoring
 * every other Window's own. `onReceive` is read from a ref kept fresh by
 * its own effect rather than placed in the subscription effect's own
 * dependency array, so a caller passing a fresh callback each render (the
 * ordinary case) never tears down and re-registers the underlying `listen`
 * subscription for it — only `ownWindowId` changing does that, and a
 * Window's own id never changes across its lifetime.
 */
export function useIncomingPaneHandoffs(ownWindowId: WindowId, onReceive: (payload: PaneHandoffPayload) => void): void {
  const onReceiveRef = useRef(onReceive);
  useEffect(() => {
    onReceiveRef.current = onReceive;
  }, [onReceive]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void listen<PaneHandoffPayload>(PANE_HANDOFF_EVENT, event => {
      if (event.payload.targetWindowId !== ownWindowId) return;
      onReceiveRef.current(event.payload);
    }).then(fn => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [ownWindowId]);
}
