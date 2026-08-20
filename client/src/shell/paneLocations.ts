/**
 * Cross-window knowledge of which Window each Pane is currently open in
 * (`.scratch/daughter-windows-native` issue 04).
 *
 * ADR 0005 left no shared JS realm, so there is no live query against
 * another Window's dock api the way `focusMode.ts`'s old, now-deleted
 * `windowIdForPane` ran against a single realm's `getPopouts()`. Every
 * Window instead broadcasts its own open panel ids whenever they change
 * (`@tauri-apps/api/event`'s `emit`/`listen`, already covered by
 * `capabilities/default.json`'s `core:default` grant — no new Rust command,
 * per spec.md), and every Window, including the one broadcasting, aggregates
 * every Window's most recent announcement into one local map. This is
 * eventually consistent rather than always-live: a stale read is possible
 * for the brief gap between a change and its broadcast landing everywhere,
 * an accepted consequence of the realm split. Issue 05's own cross-window
 * "Move to Window" handoff reuses this same broadcast.
 *
 * A freshly-mounted Window's own `listen` has nothing to catch it up on a
 * Window that already announced its panes *before* the new one existed —
 * pure push, with no persistent registry anywhere, means a late joiner
 * would otherwise never learn what every already-open Window currently
 * holds until one of them happens to change again for an unrelated reason
 * (found by hand: opening a Daughter Window while a singleton was already
 * open in the Main Window left it un-disabled there until *something* in
 * the Main Window's own layout changed). `PANE_LOCATIONS_REQUEST_EVENT`
 * closes that gap: a Window asks, once, right after its own "changed"
 * listener is confirmed registered; every Window (including itself,
 * harmlessly) answers by re-announcing its current panes.
 */

import { isTauri } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WindowId } from './focusMode';

/** Exported so `paneLocations.test.ts` asserts against this module's own constant rather than re-typing the string. */
export const PANE_LOCATIONS_EVENT = 'window-panes-changed';

/** A late-joining Window's own catch-up request — see this module's own doc comment. Carries no payload; every listener answers with its own `PANE_LOCATIONS_EVENT`. */
export const PANE_LOCATIONS_REQUEST_EVENT = 'window-panes-request';

/** Exported for the same reason as {@link PANE_LOCATIONS_EVENT} — one payload shape, not a second one redeclared in the test file. */
export interface PaneLocationsAnnouncement {
  readonly windowId: WindowId;
  readonly paneIds: readonly string[];
}

/** Tells every Window (including this one) which panel ids this Window currently has open. A safe no-op outside Tauri — there is only ever one realm there, so nothing needs telling. */
function announceOwnPanes(windowId: WindowId, paneIds: readonly string[]): void {
  if (!isTauri()) return;
  const payload: PaneLocationsAnnouncement = { windowId, paneIds };
  void emit(PANE_LOCATIONS_EVENT, payload);
}

/**
 * This Window's own aggregated view of every open Window's panel ids, keyed
 * by {@link WindowId} — what `daughterWindows.ts`'s `paneMenuEntries` needs
 * to tell a singleton open locally from one open elsewhere.
 *
 * `ownWindowId`'s own entry always comes straight from `ownPaneIds` — this
 * Window's own dockview state, known synchronously — rather than waiting for
 * this Window's own broadcast to round-trip back to it, so a Window's dedup
 * check against itself never lags one tick behind its own layout. `stillOpen`
 * prunes a Window that has since closed: nothing else ever tells this Window
 * that happened (a native title-bar close leaves no trace here), so without
 * this its last announcement would otherwise linger forever, wrongly showing
 * a singleton as still open there. Callers pass `knownWindowIds` (this
 * module's own pure helper, fed by `useDaughterWindows`) for that list.
 * Pruning happens where `otherLocations` is read below, not by ever writing
 * a pruned copy back into state — the raw state a closed Window's last
 * broadcast still sits in is harmless and bounded (one entry per distinct
 * Window id ever seen this session), and deriving the exposed view during
 * render rather than from a second `setState` in its own effect keeps this
 * in the "subscribe, don't re-derive" shape `react-hooks/set-state-in-effect`
 * asks effects to stay in.
 */
export function usePaneLocations(
  ownWindowId: WindowId,
  ownPaneIds: readonly string[],
  stillOpen: readonly WindowId[]
): ReadonlyMap<WindowId, readonly string[]> {
  const [otherLocations, setOtherLocations] = useState<ReadonlyMap<WindowId, readonly string[]>>(() => new Map());

  // Read from the catch-up request handler below, which is registered once
  // per `ownWindowId` (not re-registered on every `ownPaneIds` change) but
  // must always answer with this Window's *current* panes, not whatever
  // they were the render it was registered. Synced from its own effect
  // rather than during render: an effect still lands well before any
  // external Tauri event could possibly arrive to read it (IPC delivery is
  // inherently asynchronous), and keeps this module clear of
  // `react-hooks/refs`' "cannot update ref during render" warning.
  const ownPaneIdsRef = useRef(ownPaneIds);
  useEffect(() => {
    ownPaneIdsRef.current = ownPaneIds;
  }, [ownPaneIds]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlistenChanged: (() => void) | null = null;
    let unlistenRequest: (() => void) | null = null;

    void Promise.all([
      listen<PaneLocationsAnnouncement>(PANE_LOCATIONS_EVENT, event => {
        const { windowId, paneIds } = event.payload;
        if (windowId === ownWindowId) return; // this Window's own entry comes from `ownPaneIds` below, always current already
        setOtherLocations(prev => {
          const next = new Map(prev);
          next.set(windowId, paneIds);
          return next;
        });
      }),
      // Answers another Window's catch-up request (see this module's own
      // doc comment) by re-announcing this Window's current panes — the
      // exact same shape as the change-driven announce below, just
      // triggered by a different event.
      listen(PANE_LOCATIONS_REQUEST_EVENT, () => {
        announceOwnPanes(ownWindowId, ownPaneIdsRef.current);
      }),
    ]).then(([changedFn, requestFn]) => {
      if (cancelled) {
        changedFn();
        requestFn();
        return;
      }
      unlistenChanged = changedFn;
      unlistenRequest = requestFn;
      // Only sent once both listeners above are confirmed registered, so
      // this Window is guaranteed to hear every reply, including one an
      // already-open Window answers with immediately.
      void emit(PANE_LOCATIONS_REQUEST_EVENT);
    });

    return () => {
      cancelled = true;
      unlistenChanged?.();
      unlistenRequest?.();
    };
  }, [ownWindowId]);

  useEffect(() => {
    announceOwnPanes(ownWindowId, ownPaneIds);
  }, [ownWindowId, ownPaneIds]);

  return useMemo(() => {
    const known = new Set(stillOpen);
    const merged = new Map<WindowId, readonly string[]>();
    for (const [windowId, paneIds] of otherLocations) {
      if (known.has(windowId)) merged.set(windowId, paneIds);
    }
    merged.set(ownWindowId, ownPaneIds);
    return merged;
  }, [otherLocations, stillOpen, ownWindowId, ownPaneIds]);
}
