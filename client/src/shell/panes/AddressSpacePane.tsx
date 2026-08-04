import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDSHub } from '../../contexts/DSHubContext';
import { usePolledTargets } from '../../hooks/useAutoRefresh';
import type { MapEntry } from '../../maps/mapParser';
import { ADDRESS_SPACE_NAME } from '../addressSpace';
import type { AddressSpace } from '../addressSpace';
import { useSelection } from '../SelectionContext';
import { filterEntries } from '../entryFilter';
import { holdsControl, isLive, linkStateOf } from '../linkState';
import { instanceOfPaneId } from '../paneRegistry';
import type { PaneProps } from '../paneRegistry';
import { usePaneState } from '../paneState';
import { useSpaceBinding } from '../spaceBinding';
import { useMapEntries } from '../useMapEntries';
import type { DisplayFormat } from '../valueFormat';
import { Entries } from './Entries';
import type { EntryRow } from './Entries';
import type { WriteBarProps } from './WriteBar';

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

/**
 * How long to wait for the Device to answer a write before saying it did not.
 *
 * A write that is never confirmed must not sit reading "Sending…" forever: an
 * unfinished write looks like a slow one, and a slow one looks like a successful
 * one to anybody who glances away.
 */
const WRITE_ANSWER_TIMEOUT_MS = 4000;

/**
 * A write, from the moment it is sent to the moment the Device answers.
 *
 * `sending` is not success. The backend resolves a write command as soon as the
 * request is *queued* — it cannot do otherwise, since responses arrive as events
 * — so treating the resolved command as a completed write reports every refused
 * write as a successful one. The answer is what settles it.
 */
type WriteOutcome =
  | { readonly status: 'idle' }
  | { readonly status: 'sending'; readonly address: number; readonly sentAt: number }
  | { readonly status: 'refused'; readonly address: number; readonly message: string };

interface SpacePaneState {
  readonly query: string;
  readonly format: DisplayFormat;
  /** This Pane's own highlighted row, which is not the shared selection. */
  readonly selectedAddress: number | null;
  readonly live: boolean;
}

export interface AddressSpacePaneProps extends PaneProps {
  /** The Address Space this Pane lists, reads and — where permitted — writes. */
  readonly space: AddressSpace;
}

/**
 * What this Pane's tab says.
 *
 * The space comes first because it is what a bare address needs in order to mean
 * anything, and the filter follows because that is what distinguishes two Panes
 * of the same kind: an Engineer comparing two subsystems has one Pane showing
 * each, and two tabs both reading "Registers" would have to be clicked to be told
 * apart. The instance number is the fallback for the case where nothing has been
 * narrowed yet and there is nothing better to say.
 */
function spacePaneTitle(space: AddressSpace, instance: number, query: string): string {
  const name = ADDRESS_SPACE_NAME[space];
  const base = instance === 0 ? name : `${name} ${instance}`;
  const trimmed = query.trim();
  return trimmed === '' ? base : `${base} · ${trimmed}`;
}

/**
 * Binds one Address Space's Pane to the Map, the Device and the shared selection.
 *
 * One component serves all three spaces. They are the same tool pointed at
 * different halves of the Device — the same filtering, the same per-instance
 * state, the same shared Inspector — and the ways they genuinely differ travel
 * with the space itself rather than in three near-copies that would drift: which
 * Map is listed, which readings are shown, which command is sent, and whether a
 * write may be sent at all.
 *
 * Every piece of state here is per-instance and keyed by panel id, because two
 * Panes of a kind are two independent tools that happen to share a component.
 * The one thing they do share is the selection they publish: the Inspector shows
 * whichever was selected most recently, wherever it was docked.
 */
export function AddressSpacePane({
  space,
  paneId,
  setTitle,
}: AddressSpacePaneProps): React.JSX.Element {
  const { state } = useDSHub();
  const { select, retitleSelection } = useSelection();
  const binding = useSpaceBinding(space);
  const map = useMapEntries(space);

  // Not held with the rest of the Pane's state: a write in flight belongs to
  // this mount, and restoring "sending…" from a Pane that was closed mid-write
  // would report a request nobody is waiting on.
  const [outcome, setOutcome] = useState<WriteOutcome>({ status: 'idle' });
  const [committed, setCommitted] = useState(0);

  const [pane, updatePane] = usePaneState<SpacePaneState>(paneId, () => ({
    query: '',
    format: 'decimal',
    selectedAddress: null,
    live: false,
  }));

  const link = linkStateOf(state.connection, state.connecting);
  const connected = isLive(link);
  const { readings, read, write: sendWrite } = binding;

  const filtered = useMemo(
    () => filterEntries(map.entries, pane.query),
    [map.entries, pane.query]
  );

  const rows = useMemo<readonly EntryRow[]>(
    () =>
      filtered.map(entry => {
        const reading = readings.get(entry.address);
        return {
          entry,
          value: reading?.value ?? null,
          valid: reading?.valid ?? true,
        };
      }),
    [filtered, readings]
  );

  const followed = useMemo(() => filtered.slice(0, FOLLOW_LIMIT), [filtered]);

  const title = useMemo(
    () => spacePaneTitle(space, instanceOfPaneId(paneId), pane.query),
    [space, paneId, pane.query]
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
    () => followed.map(entry => ({ source: space, address: entry.address, name: entry.name })),
    [space, followed]
  );

  usePolledTargets(targets, LIVE_INTERVAL_MS, pane.live && connected);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleRead = useCallback(() => {
    for (const entry of followed) {
      read(entry.address, entry.name);
    }
  }, [followed, read]);

  const handleSelect = useCallback(
    (entry: MapEntry) => {
      updatePane(previous => ({ ...previous, selectedAddress: entry.address }));
      select({ space, address: entry.address, paneId, paneTitle: title });
      // Read it now rather than waiting for a poll that may not be running: the
      // Inspector opening on a dash is the common case this avoids, and one read
      // is what the user just asked for by selecting the row.
      if (connected) read(entry.address, entry.name);
    },
    [updatePane, select, space, paneId, title, connected, read]
  );

  // ── Writing ───────────────────────────────────────────────────────────────

  const selectedEntry = useMemo(
    () =>
      pane.selectedAddress === null
        ? null
        : map.entries.find(entry => entry.address === pane.selectedAddress) ?? null,
    [map.entries, pane.selectedAddress]
  );

  const handleWrite = useCallback(
    (raw: number) => {
      if (selectedEntry === null || sendWrite === null) return;
      const address = selectedEntry.address;
      setOutcome({ status: 'sending', address, sentAt: Date.now() });
      sendWrite(address, raw).catch((error: unknown) => {
        setOutcome({
          status: 'refused',
          address,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [sendWrite, selectedEntry]
  );

  /**
   * Settles a write against the Device's answer.
   *
   * An effect rather than a derivation because the answer is an event that has
   * to be *latched*. The obvious derivation — comparing the entry's latest
   * reading against the moment the write was sent — keeps being true afterwards,
   * so the next poll of that entry would read as another confirmation and
   * discard whatever had been typed since.
   */
  useEffect(() => {
    if (outcome.status !== 'sending') return;

    const answer = readings.get(outcome.address);
    if (answer !== undefined && answer.timestamp >= outcome.sentAt) {
      if (answer.valid) {
        setCommitted(count => count + 1);
        setOutcome({ status: 'idle' });
      } else {
        setOutcome({
          status: 'refused',
          address: outcome.address,
          message: 'The Device refused the write. This entry is unchanged.',
        });
      }
      return;
    }

    const timer = setTimeout(() => {
      setOutcome({
        status: 'refused',
        address: outcome.address,
        message: 'The Device did not answer. It is not known whether the write took effect.',
      });
    }, WRITE_ANSWER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [readings, outcome]);

  /** Why this entry cannot be written right now, or null when it can. */
  const writeBlockedReason = useMemo(() => {
    if (!connected) return 'Not connected — writing is unavailable.';
    if (!holdsControl(state.connection)) {
      return 'Another interface holds Control. Take Control from the chrome above to write.';
    }
    return null;
  }, [connected, state.connection]);

  const write = useMemo<WriteBarProps | null>(() => {
    // No write bar at all in a read-only space — not a disabled one. Disabled
    // says "not right now", and the protocol's answer for System Registers is
    // never. The Pane states that in words instead.
    if (sendWrite === null || selectedEntry === null) return null;
    return {
      entry: selectedEntry,
      value: readings.get(selectedEntry.address)?.value ?? null,
      format: pane.format,
      blockedReason: writeBlockedReason,
      pending: outcome.status === 'sending' && outcome.address === selectedEntry.address,
      // Scoped to the entry it happened to. A refusal left standing under the
      // next entry's field reports a failure that surface never had.
      failure:
        outcome.status === 'refused' && outcome.address === selectedEntry.address
          ? outcome.message
          : null,
      committed,
      onWrite: handleWrite,
    };
  }, [
    sendWrite,
    selectedEntry,
    readings,
    pane.format,
    writeBlockedReason,
    outcome,
    committed,
    handleWrite,
  ]);

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
    <Entries
      space={space}
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
      write={write}
    />
  );
}
