/**
 * The selection the Inspector follows.
 *
 * Every data surface used to carry its own embedded Inspector, so the same
 * decoding panel was built three times and took a third of each surface's width
 * whether or not anything was selected. There is one Inspector now, and this is
 * what tells it what to inspect: the most recent selection made in any Pane,
 * wherever that Pane is docked.
 *
 * A Pane's *own* selection — the row it draws as current — is its own state and
 * does not live here. Two Register Panes each keep their highlighted row; only
 * the latest of them is what the Inspector is showing.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AddressSpace } from './addressSpace';

export interface EntrySelection {
  readonly space: AddressSpace;
  readonly address: number;
  /** The Pane the selection was made in. */
  readonly paneId: string;
  /**
   * That Pane's title at the time. Carried rather than looked up so the
   * Inspector can say where the selection came from when several Panes of a kind
   * are open, which is otherwise unanswerable from an address alone.
   */
  readonly paneTitle: string;
}

interface SelectionContextValue {
  readonly selection: EntrySelection | null;
  readonly select: (selection: EntrySelection) => void;
  /**
   * Drops the selection if the Pane that made it is no longer open.
   *
   * Expressed as "keep only these" rather than "clear this one" because the
   * shell learns that a Pane has closed by comparing what dockview holds against
   * what it held before, and because a Pane cannot report its own closure: its
   * component also unmounts when its tab merely stops being the visible one.
   */
  readonly retainPanes: (openPaneIds: Iterable<string>) => void;
  /**
   * Follows a Pane's tab as it renames itself.
   *
   * A Register Pane's title tracks its filter, so the title captured when a row
   * was selected goes out of date the moment the filter is retyped — leaving the
   * Inspector citing a Pane by a name that is no longer on any tab.
   */
  readonly retitleSelection: (paneId: string, paneTitle: string) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const [selection, setSelection] = useState<EntrySelection | null>(null);

  const select = useCallback((next: EntrySelection) => {
    setSelection(next);
  }, []);

  const retainPanes = useCallback((openPaneIds: Iterable<string>) => {
    const open = new Set(openPaneIds);
    setSelection(current => (current === null || open.has(current.paneId) ? current : null));
  }, []);

  const retitleSelection = useCallback((paneId: string, paneTitle: string) => {
    setSelection(current =>
      current?.paneId === paneId && current.paneTitle !== paneTitle
        ? { ...current, paneTitle }
        : current
    );
  }, []);

  const value = useMemo(
    () => ({ selection, select, retainPanes, retitleSelection }),
    [selection, select, retainPanes, retitleSelection]
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/**
 * There is no default value on purpose: a Pane reading this outside the shell is
 * misplaced, and a silent null selection would look like "nothing selected yet"
 * rather than like the wiring fault it is.
 */
export function useSelection(): SelectionContextValue {
  const value = useContext(SelectionContext);
  if (value === null) {
    throw new Error('useSelection must be used within a SelectionProvider');
  }
  return value;
}
