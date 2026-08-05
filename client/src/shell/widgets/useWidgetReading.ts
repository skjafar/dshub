/**
 * The one place a bound Widget turns an address into a reading.
 *
 * Every bound Widget kind needs the same three things from the Device — is
 * there anything at this address, is the link current, what does it say — and
 * needs them derived the same way every other new-shell surface derives them:
 * `useMapEntries` for the name behind an address, `useSpaceBinding` for the
 * live readings table, `usePolledTargets` for the coalesced subscription, and
 * `linkState` for whether a reading is current enough to show as live. A
 * Widget re-deriving any of the four its own way is exactly the duplication
 * the shared configuration surface exists to remove.
 */

import { useMemo } from 'react';
import { useDSHub } from '../../contexts/DSHubContext';
import { usePolledTargets } from '../../hooks/useAutoRefresh';
import { getPlotValue } from '../../utils/dataTableUtils';
import { isLive, isStale, linkStateOf } from '../linkState';
import { useSpaceBinding } from '../spaceBinding';
import { useMapEntries } from '../useMapEntries';
import { formatEntryValue } from '../valueFormat';
import type { DisplayFormat } from '../valueFormat';
import type { WidgetBinding } from './widgetConfig';

/**
 * How often a bound Widget asks. Coalesced with every other watcher of the
 * same address by the shared poller, so several Widgets bound to one address
 * cost one round-trip rather than several.
 */
const WIDGET_POLL_INTERVAL_MS = 1000;

export type WidgetReadingStatus =
  | 'unbound'
  | 'not-found'
  | 'stale'
  | 'pending'
  | 'invalid'
  | 'ready';

export interface WidgetReading {
  readonly status: WidgetReadingStatus;
  /**
   * Decoded per the entry's own type — a float register reads as its float, not
   * the raw wire word — so a threshold rule judges the reading a person sees.
   * Set only when `status` is `'ready'`.
   */
  readonly value: number | null;
  /** Set only when `status` is `'ready'`. */
  readonly formatted: string | null;
}

const UNBOUND: WidgetReading = { status: 'unbound', value: null, formatted: null };
const NOT_FOUND: WidgetReading = { status: 'not-found', value: null, formatted: null };
const STALE: WidgetReading = { status: 'stale', value: null, formatted: null };
const PENDING: WidgetReading = { status: 'pending', value: null, formatted: null };
const INVALID: WidgetReading = { status: 'invalid', value: null, formatted: null };

/** Binds one Widget to its configured address and turns the answer into a reading fit to display. */
export function useWidgetReading(binding: WidgetBinding | null, format: DisplayFormat): WidgetReading {
  const { state } = useDSHub();
  const map = useMapEntries(binding?.space ?? 'register');
  const spaceBinding = useSpaceBinding(binding?.space ?? 'register');
  const link = linkStateOf(state.connection, state.connecting);

  const entry = useMemo(
    () => (binding ? (map.entries.find(candidate => candidate.address === binding.address) ?? null) : null),
    [map.entries, binding]
  );

  const targets = useMemo(
    () => (binding && entry ? [{ source: binding.space, address: binding.address, name: entry.name }] : []),
    [binding, entry]
  );
  usePolledTargets(targets, WIDGET_POLL_INTERVAL_MS, isLive(link) && targets.length > 0);

  return useMemo(() => {
    if (!binding) return UNBOUND;
    if (!entry) return NOT_FOUND;
    if (isStale(link)) return STALE;

    const reading = spaceBinding.readings.get(binding.address);
    if (!reading) return PENDING;
    if (!reading.valid) return INVALID;

    return {
      status: 'ready',
      value: getPlotValue(reading.value, entry),
      formatted: formatEntryValue(reading.value, entry.type, format),
    };
  }, [binding, entry, link, spaceBinding.readings, format]);
}
