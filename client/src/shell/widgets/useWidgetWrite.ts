/**
 * The one place a control Widget turns a click, a selection or a held button
 * into a write the Device actually answers.
 *
 * `AddressSpacePane` and `CommandPane` each settle a send against the
 * Device's own answer rather than the promise resolving — the backend
 * resolves as soon as a request is *queued*, so treating that as success
 * would report every refusal as a completed write. Button, Dropdown, Value
 * Write and Directional Control all need that same settling, now over two
 * kinds of target instead of one, so it lives here once rather than four
 * times over.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBackendPort } from '../../contexts/BackendPortContext';
import { useDSHub } from '../../contexts/DSHubContext';
import { useCommandResponses } from '../commandBinding';
import { holdsControl, isLive, linkStateOf } from '../linkState';
import { useSpaceBinding } from '../spaceBinding';
import type { WidgetTarget } from './widgetConfig';

/** SYS_COMMAND, the wire type every Profile Command travels as — matches `CommandPane.tsx`'s own constant. */
const CMD_SYS_COMMAND = 0;

/** Matches `AddressSpacePane`/`CommandPane`'s own timeout: an unanswered send must not read "sending" forever. */
const ANSWER_TIMEOUT_MS = 4000;

type Outcome =
  | { readonly status: 'idle' }
  | { readonly status: 'sending'; readonly target: WidgetTarget; readonly sentAt: number }
  | { readonly status: 'refused'; readonly target: WidgetTarget; readonly message: string };

export interface TargetStatus {
  readonly pending: boolean;
  readonly failure: string | null;
}

const IDLE_STATUS: TargetStatus = { pending: false, failure: null };

export interface WidgetWrite {
  /** Why nothing may be sent right now, or null when sending is permitted. */
  readonly blockedReason: string | null;
  /** Sends one value to one target, address or Command alike. */
  readonly send: (target: WidgetTarget, value: number) => void;
  /** This target's own pending/failure state — scoped, since one Widget (Directional Control) can offer several targets at once. */
  readonly statusFor: (target: WidgetTarget) => TargetStatus;
}

function sameTarget(a: WidgetTarget, b: WidgetTarget): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'address' && b.kind === 'address'
    ? a.space === b.space && a.address === b.address
    : a.kind === 'command' && b.kind === 'command' && a.code === b.code;
}

/**
 * Binds a control Widget to the write path, for a target resolved at send
 * time rather than fixed for the hook's lifetime — Directional Control has
 * several targets (one per direction) sharing one instance of this hook.
 */
export function useWidgetWrite(): WidgetWrite {
  const { state } = useDSHub();
  const port = useBackendPort();
  const registers = useSpaceBinding('register');
  const parameters = useSpaceBinding('parameter');
  const commandResponses = useCommandResponses();

  const [outcome, setOutcome] = useState<Outcome>({ status: 'idle' });

  const link = linkStateOf(state.connection, state.connecting);
  const connected = isLive(link);

  const blockedReason = useMemo(() => {
    if (!connected) return 'Not connected.';
    if (!holdsControl(state.connection)) {
      return 'Another interface holds Control. Take Control from the chrome above.';
    }
    return null;
  }, [connected, state.connection]);

  const send = useCallback(
    (target: WidgetTarget, value: number) => {
      setOutcome({ status: 'sending', target, sentAt: Date.now() });
      const promise =
        target.kind === 'command'
          ? port.device.sendCommand(CMD_SYS_COMMAND, target.code, value)
          : (target.space === 'register' ? registers.write : parameters.write)?.(target.address, value);
      promise?.catch((error: unknown) => {
        setOutcome({
          status: 'refused',
          target,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [port, registers.write, parameters.write]
  );

  /**
   * Settles a send against the Device's answer, the same shape as
   * `AddressSpacePane`/`CommandPane`'s own effects — latched, because the
   * obvious derivation (comparing the latest reading against the send time)
   * keeps being true afterwards, and the next unrelated poll of that address
   * would read as a second confirmation.
   */
  useEffect(() => {
    if (outcome.status !== 'sending') return;
    const { target, sentAt } = outcome;

    if (target.kind === 'command') {
      const answer = commandResponses.get(target.code);
      if (answer !== undefined && answer.timestamp >= sentAt) {
        setOutcome(
          answer.valid
            ? { status: 'idle' }
            : { status: 'refused', target, message: 'The Device refused this Command.' }
        );
        return;
      }
    } else {
      const readings = target.space === 'register' ? registers.readings : parameters.readings;
      const answer = readings.get(target.address);
      if (answer !== undefined && answer.timestamp >= sentAt) {
        setOutcome(
          answer.valid
            ? { status: 'idle' }
            : { status: 'refused', target, message: 'The Device refused the write. This entry is unchanged.' }
        );
        return;
      }
    }

    const timer = setTimeout(() => {
      setOutcome({
        status: 'refused',
        target,
        message: 'The Device did not answer. It is not known whether this took effect.',
      });
    }, ANSWER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [outcome, commandResponses, registers.readings, parameters.readings]);

  const statusFor = useCallback(
    (target: WidgetTarget): TargetStatus => {
      if (outcome.status === 'idle' || !sameTarget(outcome.target, target)) return IDLE_STATUS;
      return {
        pending: outcome.status === 'sending',
        failure: outcome.status === 'refused' ? outcome.message : null,
      };
    },
    [outcome]
  );

  return { blockedReason, send, statusFor };
}
