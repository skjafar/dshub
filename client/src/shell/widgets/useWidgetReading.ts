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
import type { MapEntry } from '../../maps/mapParser';
import { isBindingDrifted } from '../bindingResolver';
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
  | 'needs-review'
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
  /**
   * The Map entry behind the binding, whenever there is one — set for every
   * status except `'unbound'`/`'not-found'`, not only `'ready'`. A control
   * Widget needs the entry's own type and access permit to encode and gate a
   * write even before its first reading has arrived.
   */
  readonly entry: MapEntry | null;
  /**
   * The undecoded wire word, set only when `status` is `'ready'`. Distinct
   * from `value`: a control Widget seeds a write field from this, through
   * `editableEntryValue`, exactly as `WriteBar` does — `value` is decoded and
   * `formatted` is rounded for display, and either would write back a
   * different number than the Device actually holds.
   */
  readonly raw: number | null;
}

const UNBOUND: WidgetReading = { status: 'unbound', value: null, formatted: null, entry: null, raw: null };
const NOT_FOUND: WidgetReading = { status: 'not-found', value: null, formatted: null, entry: null, raw: null };

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

  /**
   * Drift, checked live against the currently active Map every time this
   * renders (`.scratch/map-binding-drift`, ticket 03) — not only when a Map
   * edit is reviewed, so a Dashboard that was not open when the edit
   * happened still shows the correct status the first time it is viewed
   * afterward. Deliberately does not gate on `entry` (the by-address lookup
   * just above): `mapParser.ts` assigns addresses sequentially with no
   * gaps, so deleting or resizing an earlier entry shifts every later one's
   * address down and leaves the old address genuinely vacant — a routine
   * "moved" outcome that a by-address-first check would misclassify as
   * plain "not found" instead. `isBindingDrifted` itself returns `false`
   * when there is no captured snapshot to check against: a binding
   * predating this feature that has not been backfilled yet (or, per
   * `backfillSnapshot`, one whose stored address matched nothing at
   * backfill time) has nothing to diff, so it falls through to today's
   * behavior rather than being flagged for drift that cannot be measured.
   */
  const needsReview = useMemo(
    () => (binding ? isBindingDrifted(binding.snapshot, binding.address, map.entries) : false),
    [binding, map.entries]
  );

  const targets = useMemo(
    () => (binding && entry ? [{ source: binding.space, address: binding.address, name: entry.name }] : []),
    [binding, entry]
  );
  usePolledTargets(targets, WIDGET_POLL_INTERVAL_MS, isLive(link) && targets.length > 0);

  return useMemo(() => {
    if (!binding) return UNBOUND;
    if (needsReview) return { status: 'needs-review', value: null, formatted: null, entry: null, raw: null };
    if (!entry) return NOT_FOUND;
    if (isStale(link)) return { status: 'stale', value: null, formatted: null, entry, raw: null };

    const reading = spaceBinding.readings.get(binding.address);
    if (!reading) return { status: 'pending', value: null, formatted: null, entry, raw: null };
    if (!reading.valid) return { status: 'invalid', value: null, formatted: null, entry, raw: null };

    return {
      status: 'ready',
      value: getPlotValue(reading.value, entry),
      formatted: formatEntryValue(reading.value, entry.type, format),
      entry,
      raw: reading.value,
    };
  }, [binding, entry, needsReview, link, spaceBinding.readings, format]);
}
