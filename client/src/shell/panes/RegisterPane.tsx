import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBackendPort } from '../../contexts/BackendPortContext';
import { useDSHub } from '../../contexts/DSHubContext';
import { usePolledTargets } from '../../hooks/useAutoRefresh';
import type { MapEntry } from '../../maps/mapParser';
import type { AddressSpace } from '../addressSpace';
import { useSelection } from '../SelectionContext';
import { filterEntries } from '../entryFilter';
import { holdsControl, isLive, linkStateOf } from '../linkState';
import { instanceOfPaneId } from '../paneRegistry';
import type { PaneProps } from '../paneRegistry';
import { usePaneState } from '../paneState';
import { useMapEntries } from '../useMapEntries';
import type { DisplayFormat } from '../valueFormat';
import { Registers } from './Registers';
import type { RegisterRow } from './Registers';
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

/** The Address Space this Pane lists. Ticket 09 gives the other two their own. */
const SPACE: AddressSpace = 'register';

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
  const port = useBackendPort();
  const { select, retitleSelection } = useSelection();
  const map = useMapEntries(SPACE);

  // Not held with the rest of the Pane's state: a write in flight belongs to
  // this mount, and restoring "sending…" from a Pane that was closed mid-write
  // would report a request nobody is waiting on.
  const [outcome, setOutcome] = useState<WriteOutcome>({ status: 'idle' });
  const [committed, setCommitted] = useState(0);

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

  // ── Writing ───────────────────────────────────────────────────────────────

  const selectedEntry = useMemo(
    () =>
      pane.selectedAddress === null
        ? null
        : map.entries.find(entry => entry.address === pane.selectedAddress) ?? null,
    [map.entries, pane.selectedAddress]
  );

  /**
   * Writes go through the port rather than through the context action, because
   * the outcome is the point. The action returns void by design — it logs a
   * failure and swallows it, which is right for a read, whose value arrives as
   * an event anyway. A write has to say at the field whether it reached the
   * board: a failure noticed later, in a log, is a failure noticed after the
   * operator has already decided the value was sent.
   */
  const handleWrite = useCallback(
    (raw: number) => {
      if (selectedEntry === null) return;
      const address = selectedEntry.address;
      setOutcome({ status: 'sending', address, sentAt: Date.now() });
      port.device.writeRegister(address, raw).catch((error: unknown) => {
        setOutcome({
          status: 'refused',
          address,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [port, selectedEntry]
  );

  /**
   * Settles a write against the Device's answer.
   *
   * An effect rather than a derivation because the answer is an event that has
   * to be *latched*. The obvious derivation — comparing the register's latest
   * reading against the moment the write was sent — keeps being true afterwards,
   * so the next poll of that register would read as another confirmation and
   * discard whatever had been typed since.
   */
  useEffect(() => {
    if (outcome.status !== 'sending') return;

    const answer = state.registers.get(outcome.address);
    if (answer !== undefined && answer.timestamp >= outcome.sentAt) {
      if (answer.valid) {
        setCommitted(count => count + 1);
        setOutcome({ status: 'idle' });
      } else {
        setOutcome({
          status: 'refused',
          address: outcome.address,
          message: 'The Device refused the write. This register is unchanged.',
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
  }, [state.registers, outcome]);

  /** Why this entry cannot be written right now, or null when it can. */
  const writeBlockedReason = useMemo(() => {
    if (!connected) return 'Not connected — writing is unavailable.';
    if (!holdsControl(state.connection)) {
      return 'Another interface holds Control. Take Control from the chrome above to write.';
    }
    return null;
  }, [connected, state.connection]);

  const write = useMemo<WriteBarProps | null>(() => {
    if (selectedEntry === null) return null;
    return {
      entry: selectedEntry,
      value: state.registers.get(selectedEntry.address)?.value ?? null,
      format: pane.format,
      blockedReason: writeBlockedReason,
      pending: outcome.status === 'sending' && outcome.address === selectedEntry.address,
      // Scoped to the entry it happened to. A refusal left standing under the
      // next register's field reports a failure that surface never had.
      failure:
        outcome.status === 'refused' && outcome.address === selectedEntry.address
          ? outcome.message
          : null,
      committed,
      onWrite: handleWrite,
    };
  }, [selectedEntry, state.registers, pane.format, writeBlockedReason, outcome, committed, handleWrite]);

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
      write={write}
    />
  );
}
