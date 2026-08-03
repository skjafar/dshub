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
