import { useCallback, useEffect, useMemo } from 'react';
import { useDSHub } from '../../contexts/DSHubContext';
import { usePolledTargets } from '../../hooks/useAutoRefresh';
import type { MapEntry } from '../../maps/mapParser';
import type { AddressSpace } from '../addressSpace';
import { useSelection } from '../SelectionContext';
import { filterEntries } from '../entryFilter';
import { isLive, linkStateOf } from '../linkState';
import { instanceOfPaneId } from '../paneRegistry';
import type { PaneProps } from '../paneRegistry';
import { usePaneState } from '../paneState';
import { useMapEntries } from '../useMapEntries';
import type { DisplayFormat } from '../valueFormat';
import { Registers } from './Registers';
import type { RegisterRow } from './Registers';

/**
 * How many addresses one Pane will read at a time.
 *
 * The link is strictly request/response, so every address followed is latency
 * charged to every other. A Pane whose filter is empty is showing the whole Map,
 * and reading all of it would saturate the link with values nobody is looking
 * at — the filter is how you say which ones you mean.
 */
const FOLLOW_LIMIT = 50;

/** How often a live Pane asks. Coalesced with every other watcher by address. */
const LIVE_INTERVAL_MS = 1000;

/** The Address Space this Pane lists. Ticket 09 gives the other two their own. */
const SPACE: AddressSpace = 'register';

interface RegisterPaneState {
  readonly query: string;
  readonly format: DisplayFormat;
  /** This Pane's own highlighted row, which is not the shared selection. */
  readonly selectedAddress: number | null;
  readonly live: boolean;
}

/**
 * What this Pane's tab says.
 *
 * The filter is in the title because that is what distinguishes two Register
 * Panes from each other: an Engineer comparing two subsystems has one Pane
 * showing each, and two tabs both reading "Registers" would have to be clicked
 * to be told apart. The instance number is the fallback for the case where
 * nothing has been narrowed yet and there is nothing better to say.
 */
function registerPaneTitle(instance: number, query: string): string {
  const base = instance === 0 ? 'Registers' : `Registers ${instance}`;
  const trimmed = query.trim();
  return trimmed === '' ? base : `${base} · ${trimmed}`;
}

/**
 * Binds a Register Pane to the Map, the Device and the shared selection.
 *
 * Every piece of state here is per-instance and keyed by panel id, because two
 * Register Panes are two independent tools that happen to share a component.
 * The one thing they do share is the selection they publish: the Inspector shows
 * whichever was selected most recently, wherever it was docked.
 */
export function RegisterPane({ paneId, setTitle }: PaneProps): React.JSX.Element {
  const { state, actions } = useDSHub();
  const { select, retitleSelection } = useSelection();
  const map = useMapEntries(SPACE);

  const [pane, updatePane] = usePaneState<RegisterPaneState>(paneId, () => ({
    query: '',
    format: 'decimal',
    selectedAddress: null,
    live: false,
  }));

  const link = linkStateOf(state.connection, state.connecting);
  const connected = isLive(link);

  const filtered = useMemo(
    () => filterEntries(map.entries, pane.query),
    [map.entries, pane.query]
  );

  const rows = useMemo<readonly RegisterRow[]>(
    () =>
      filtered.map(entry => {
        const reading = state.registers.get(entry.address);
        return {
          entry,
          value: reading?.value ?? null,
          valid: reading?.valid ?? true,
        };
      }),
    [filtered, state.registers]
  );

  const followed = useMemo(() => filtered.slice(0, FOLLOW_LIMIT), [filtered]);

  const title = useMemo(
    () => registerPaneTitle(instanceOfPaneId(paneId), pane.query),
    [paneId, pane.query]
  );

  useEffect(() => {
    setTitle(title);
    // The Inspector names the Pane a selection came from. Renaming the tab
    // without saying so would leave it citing a filter this Pane no longer has.
    retitleSelection(paneId, title);
  }, [setTitle, retitleSelection, paneId, title]);

  // Declared through the shared poller rather than by owning a timer, so two
  // Panes watching the same address cost one round-trip rather than two.
  const targets = useMemo(
    () => followed.map(entry => ({ source: SPACE, address: entry.address, name: entry.name })),
    [followed]
  );

  usePolledTargets(targets, LIVE_INTERVAL_MS, pane.live && connected);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleRead = useCallback(() => {
    for (const entry of followed) {
      actions.readRegister(entry.address, entry.name);
    }
  }, [followed, actions]);

  const handleSelect = useCallback(
    (entry: MapEntry) => {
      updatePane(previous => ({ ...previous, selectedAddress: entry.address }));
      select({ space: SPACE, address: entry.address, paneId, paneTitle: title });
      // Read it now rather than waiting for a poll that may not be running: the
      // Inspector opening on a dash is the common case this avoids, and one read
      // is what the user just asked for by selecting the row.
      if (connected) actions.readRegister(entry.address, entry.name);
    },
    [updatePane, select, paneId, title, connected, actions]
  );

  const handleQueryChange = useCallback(
    (query: string) => updatePane(previous => ({ ...previous, query })),
    [updatePane]
  );

  const handleFormatChange = useCallback(
    (format: DisplayFormat) => updatePane(previous => ({ ...previous, format })),
    [updatePane]
  );

  const handleLiveChange = useCallback(
    (live: boolean) => updatePane(previous => ({ ...previous, live })),
    [updatePane]
  );

  return (
    <Registers
      rows={rows}
      query={pane.query}
      onQueryChange={handleQueryChange}
      format={pane.format}
      onFormatChange={handleFormatChange}
      selectedAddress={pane.selectedAddress}
      onSelect={handleSelect}
      live={pane.live}
      onLiveChange={handleLiveChange}
      followedCount={followed.length}
      onRead={handleRead}
      link={link}
      map={map}
    />
  );
}
