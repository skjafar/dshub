import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBackendPort } from '../../contexts/BackendPortContext';
import { useDSHub } from '../../contexts/DSHubContext';
import { useSettings } from '../../contexts/SettingsContext';
import type { SysCommand } from '../../types/settings';
import { useCommandResponses } from '../commandBinding';
import { filterCommands } from '../commandFilter';
import { holdsControl, isLive, linkStateOf } from '../linkState';
import { instanceOfPaneId } from '../paneRegistry';
import type { PaneProps } from '../paneRegistry';
import { usePaneState } from '../paneState';
import { Commands } from './Commands';
import type { CatalogueStatus } from './Commands';
import type { CommandSendBarProps } from './CommandSendBar';

/**
 * How long to wait for the Device to answer a Command before saying it did not.
 *
 * Matches `AddressSpacePane`'s write timeout: a Command that is never confirmed
 * must not sit reading "Sending…" forever — an unfinished send looks like a slow
 * one, and a slow one looks like a successful one to anybody who glances away.
 */
const ANSWER_TIMEOUT_MS = 4000;

/**
 * SYS_COMMAND, the wire type every Profile Command travels as — its own code
 * rides in the address field, not the command field. Matches
 * `communicator.rs`'s `CMD_SYS_COMMAND`.
 */
const CMD_SYS_COMMAND = 0;

/** Shared so a Profile with no catalogue is the same empty array every render. */
const NO_COMMANDS: readonly SysCommand[] = [];

/**
 * A send, from the moment it leaves to the moment the Device answers.
 *
 * `sending` is not success. `sendCommand` resolves as soon as the request is
 * *queued* — it cannot do otherwise, since the answer arrives as an event — so
 * treating the resolved call as a completed send would report every refusal as
 * a successful one.
 */
type SendOutcome =
  | { readonly status: 'idle' }
  | { readonly status: 'sending'; readonly code: number; readonly sentAt: number }
  | { readonly status: 'refused'; readonly code: number; readonly message: string };

interface CommandPaneState {
  readonly query: string;
  readonly selectedCode: number | null;
}

/**
 * What this Pane's tab says. Mirrors `spacePaneTitle` in `AddressSpacePane.tsx`:
 * the filter is what tells two open Command Panes apart, so it is part of the
 * title rather than left only in the Pane body.
 */
function commandPaneTitle(instance: number, query: string): string {
  const base = instance === 0 ? 'Commands' : `Commands ${instance}`;
  const trimmed = query.trim();
  return trimmed === '' ? base : `${base} · ${trimmed}`;
}

/**
 * Sending Commands to the Device: numbered instructions that make it act, as
 * distinct from writing a value to a Register or a Parameter.
 *
 * Commands are presented by name from the active Profile's catalogue, so an
 * Engineer is never transcribing numbers from a separate document. A Command
 * reaching live equipment carries the same weight as a write, so sending
 * inherits the write path's confirmation pattern rather than inventing its own:
 * send, then wait for the Device's own answer — not for the send resolving,
 * which happens as soon as the request is queued — and report the outcome
 * plainly, including a refusal, once the answer arrives or the wait times out.
 */
export function CommandPane({ paneId, setTitle }: PaneProps): React.JSX.Element {
  const { state } = useDSHub();
  const { getActiveProfile } = useSettings();
  const port = useBackendPort();
  const responses = useCommandResponses();

  // Not held with the rest of the Pane's state: a send in flight belongs to
  // this mount, and restoring "sending…" from a Pane that was closed mid-send
  // would report a request nobody is waiting on.
  const [outcome, setOutcome] = useState<SendOutcome>({ status: 'idle' });

  const [pane, updatePane] = usePaneState<CommandPaneState>(paneId, () => ({
    query: '',
    selectedCode: null,
  }));

  const profile = getActiveProfile();
  const catalogue = profile?.sysCommands ?? NO_COMMANDS;
  const status: CatalogueStatus = profile === null ? 'unavailable' : 'ready';

  const link = linkStateOf(state.connection, state.connecting);
  const connected = isLive(link);

  const filtered = useMemo(() => filterCommands(catalogue, pane.query), [catalogue, pane.query]);

  const title = useMemo(
    () => commandPaneTitle(instanceOfPaneId(paneId), pane.query),
    [paneId, pane.query]
  );

  useEffect(() => {
    setTitle(title);
  }, [setTitle, title]);

  const handleQueryChange = useCallback(
    (query: string) => updatePane(previous => ({ ...previous, query })),
    [updatePane]
  );

  const handleSelect = useCallback(
    (command: SysCommand) => updatePane(previous => ({ ...previous, selectedCode: command.code })),
    [updatePane]
  );

  const selected = useMemo(
    () => catalogue.find(command => command.code === pane.selectedCode) ?? null,
    [catalogue, pane.selectedCode]
  );

  const handleSend = useCallback(
    (value: number) => {
      if (selected === null) return;
      const code = selected.code;
      setOutcome({ status: 'sending', code, sentAt: Date.now() });
      port.device.sendCommand(CMD_SYS_COMMAND, code, value).catch((error: unknown) => {
        setOutcome({
          status: 'refused',
          code,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [port, selected]
  );

  /**
   * Settles a send against the Device's answer.
   *
   * An effect rather than a derivation, for the same reason `AddressSpacePane`'s
   * write settlement is one: the answer is an event that has to be *latched*, or
   * the next unrelated `commandResponse` for this code would read as a second
   * confirmation of a send that already settled.
   */
  useEffect(() => {
    if (outcome.status !== 'sending') return;

    const answer = responses.get(outcome.code);
    if (answer !== undefined && answer.timestamp >= outcome.sentAt) {
      setOutcome(
        answer.valid
          ? { status: 'idle' }
          : { status: 'refused', code: outcome.code, message: 'The Device refused this Command.' }
      );
      return;
    }

    const timer = setTimeout(() => {
      setOutcome({
        status: 'refused',
        code: outcome.code,
        message: 'The Device did not answer. It is not known whether the Command took effect.',
      });
    }, ANSWER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [responses, outcome]);

  /** Why a Command cannot be sent right now, or null when it can. */
  const blockedReason = useMemo(() => {
    if (!connected) return 'Not connected — sending is unavailable.';
    if (!holdsControl(state.connection)) {
      return 'Another interface holds Control. Take Control from the chrome above to send a Command.';
    }
    return null;
  }, [connected, state.connection]);

  const send = useMemo<CommandSendBarProps | null>(() => {
    if (selected === null) return null;
    return {
      command: selected,
      blockedReason,
      pending: outcome.status === 'sending' && outcome.code === selected.code,
      // Scoped to the Command it happened to. A refusal left standing under the
      // next Command's field would report a failure that Command never had.
      failure:
        outcome.status === 'refused' && outcome.code === selected.code ? outcome.message : null,
      onSend: handleSend,
    };
  }, [selected, blockedReason, outcome, handleSend]);

  return (
    <Commands
      commands={filtered}
      totalCount={catalogue.length}
      status={status}
      query={pane.query}
      onQueryChange={handleQueryChange}
      selectedCode={pane.selectedCode}
      onSelect={handleSelect}
      send={send}
    />
  );
}
