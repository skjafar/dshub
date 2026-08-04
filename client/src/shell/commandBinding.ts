/**
 * The Device's Command answers, as a Pane reads them.
 *
 * Subscribed directly from the port rather than through `DSHubContext`: the
 * device half of the application context is frozen (ADR-0003) and had no case
 * for `commandResponse` before this ticket added the event itself, so adding a
 * second, larger change there — a new reducer case and state field — is not
 * warranted when the one Pane that needs the answer can read it at the boundary,
 * the same reasoning `spaceBinding.ts`'s write already follows for sending one.
 */

import { useEffect, useState } from 'react';
import { useBackendPort } from '../contexts/BackendPortContext';
import type { CommandResponse } from '../types/shared';

/**
 * Every Command's most recent answer, keyed by its code.
 *
 * Registration is asynchronous and this effect's cleanup is not, so a cleanup
 * that ran while registration was still in flight would otherwise leave a live
 * subscription behind with nothing left to remove it — the same race
 * `DSHubContext`'s own listener effect guards against (ADR-0003).
 */
export function useCommandResponses(): ReadonlyMap<number, CommandResponse> {
  const port = useBackendPort();
  const [responses, setResponses] = useState<ReadonlyMap<number, CommandResponse>>(
    () => new Map()
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    port.events
      .on('commandResponse', response => {
        setResponses(previous => {
          const next = new Map(previous);
          next.set(response.command, response);
          return next;
        });
      })
      .then(off => {
        if (cancelled) {
          off();
          return;
        }
        unlisten = off;
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [port]);

  return responses;
}
