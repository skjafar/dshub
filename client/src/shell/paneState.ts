/**
 * State belonging to one Pane instance rather than to its kind.
 *
 * Two Register Panes are two independent tools that happen to be built from the
 * same component — each with its own filter, display format and selection. Plain
 * component state nearly gives that, but it is lost whenever the component
 * unmounts, and a Pane's component unmounts for reasons that have nothing to do
 * with the user's intent: dockview detaches a Pane whose tab is not the visible
 * one in its group. Losing a carefully typed filter by clicking a neighbouring
 * tab would make two Panes worth less than one.
 *
 * Keyed by panel id, which `paneRegistry` guarantees is unique per instance.
 */

import { useCallback, useState } from 'react';

const states = new Map<string, unknown>();

/**
 * Fires whenever any Pane updates its own state.
 *
 * A saved Workspace has to stay current with what its Panes are actually
 * showing — a filter retyped after the Workspace was last saved is exactly the
 * kind of change "restores what the Panes were actually showing" promises not
 * to lose. Layout changes reach the shell through dockview's own event; typing
 * into a filter does not touch dockview at all, so this is the other half of
 * what tells the shell a Workspace needs to be saved again.
 */
const listeners = new Set<() => void>();

export function subscribePaneStateChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Per-instance state that survives the component being unmounted and remounted.
 *
 * Exactly one component holds a given panel id at a time, so this needs no
 * cross-component notification — the store is a place to leave state, not a
 * channel to share it. Sharing between Panes is the Inspector's job and goes
 * through the selection context instead.
 */
export function usePaneState<T>(
  paneId: string,
  initial: () => T
): [T, (updater: (previous: T) => T) => void] {
  const [state, setState] = useState<T>(() => {
    const kept = states.get(paneId);
    return kept === undefined ? initial() : (kept as T);
  });

  const update = useCallback(
    (updater: (previous: T) => T) => {
      setState(previous => {
        const next = updater(previous);
        states.set(paneId, next);
        return next;
      });
      for (const listener of listeners) listener();
    },
    [paneId]
  );

  return [state, update];
}

/**
 * Forgets the state of every Pane that is no longer open.
 *
 * Called from the shell whenever the layout changes, because a Pane that has
 * been closed is gone — reopening its kind produces a new instance with a new
 * id, and its predecessor's filter should not come back with it.
 */
export function retainPaneState(openPaneIds: Iterable<string>): void {
  const open = new Set(openPaneIds);
  for (const id of states.keys()) {
    if (!open.has(id)) states.delete(id);
  }
}

/**
 * Reads back the current state of exactly the given Panes.
 *
 * Scoped to the ids handed in rather than the whole store, because a Workspace
 * is saved with the Panes that are actually open in it — the store may still
 * hold another Pane's state from earlier in the session, and that state
 * belongs to whichever Workspace it was opened under, not this one.
 */
export function snapshotPaneStates(paneIds: Iterable<string>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const id of paneIds) {
    if (states.has(id)) snapshot[id] = states.get(id);
  }
  return snapshot;
}

/**
 * Seeds the store from a saved Workspace, replacing whatever it held.
 *
 * Must run before the Workspace's Panes are (re)created: `usePaneState` only
 * reads the store on a Pane's first mount, so loading after dockview has
 * already restored the layout would seed nothing. Replacing rather than
 * merging matches `fromJSON` clearing the previous layout outright — the
 * Workspace being left is gone, and its Panes' state should not linger for a
 * reused panel id in the one being entered.
 */
export function loadPaneStates(paneStates: Readonly<Record<string, unknown>>): void {
  states.clear();
  for (const [id, value] of Object.entries(paneStates)) {
    states.set(id, value);
  }
}

/**
 * Seeds exactly one Pane's own state ahead of its first mount, without
 * touching any other entry — unlike {@link loadPaneStates}'s whole-store
 * replace, which is right for loading a Workspace wholesale but would
 * destroy every other open Pane's state here. A Pane moved into this Window
 * from another (`.scratch/daughter-windows-native` issue 05) needs exactly
 * this: the receiving Window already has its own open Panes' state in the
 * store, and the moved Pane is joining them, not replacing them.
 */
export function restorePaneState(paneId: string, value: unknown): void {
  states.set(paneId, value);
}
