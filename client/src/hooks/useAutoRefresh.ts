import { useEffect, useMemo } from 'react';
import { useBackendPort } from '../contexts/BackendPortContext';
import { useDSHub } from '../contexts/DSHubContext';
import { mapManager } from '../maps/mapManager';
import type { DataSource } from '../types/dashboard';

export interface PollTarget {
  source: DataSource;
  address: number;
  /** Resolved register/parameter name, required by the backend read commands. */
  name: string;
}

/**
 * Declares interest in a set of already-resolved addresses.
 *
 * The one place a surface subscribes to the backend's per-address poll
 * subscription mechanism (`src-tauri/src/poll.rs`, `.scratch/rust-owned-polling`
 * issue 03). Widgets reach it through `useAutoRefresh`/`useAutoRefreshMulti`,
 * which look a name up from an address first; a Pane listing entries from the
 * Map already holds the names and calls this directly. Either way there is a
 * single subscribe-and-release path, so "how does a surface declare interest"
 * has one answer.
 *
 * Callers may rebuild `targets` on every render — the subscription only restarts
 * when the addresses themselves change. Re-subscribing on each arriving value
 * would cancel and reissue the very polling that produced it.
 */
export function usePolledTargets(
  targets: readonly PollTarget[],
  intervalMs: number,
  enabled: boolean
): void {
  const port = useBackendPort();
  const key = targets.map(t => `${t.source}:${t.address}:${t.name}`).join(',');

  const stable = useMemo(
    () => targets,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  useEffect(() => {
    if (!enabled || stable.length === 0) return;

    // Subscribing is asynchronous (it crosses the IPC boundary) but this
    // effect's cleanup is not, so a fast mount/unmount — React StrictMode's
    // double-invoke included — can run the cleanup before any subscription id
    // has come back. Without this guard a subscription that resolved after
    // unmount would never be released. Mirrors the same race
    // `DSHubContext.tsx`'s event-listener registration guards against
    // (ADR 0003's second amendment).
    let cancelled = false;
    let subscriptionIds: number[] = [];

    const setup = async () => {
      const ids = await Promise.all(
        stable.map(target => port.device.subscribeAddress(target.source, target.address, target.name, intervalMs))
      );
      if (cancelled) {
        // Cleaned up while subscribing. Undo it here, since the cleanup that
        // would have done so has already run.
        ids.forEach(id => { port.device.unsubscribeAddress(id).catch(console.error); });
        return;
      }
      subscriptionIds = ids;
    };

    setup().catch(console.error);

    return () => {
      cancelled = true;
      subscriptionIds.forEach(id => { port.device.unsubscribeAddress(id).catch(console.error); });
      subscriptionIds = [];
    };
  }, [stable, intervalMs, enabled, port]);
}

interface UseAutoRefreshOptions {
  source: DataSource;
  address: number;
  refreshInterval: number;
  isEditMode: boolean;
}

export interface AutoRefreshStatus {
  error: string | null;
}

function lookupName(source: DataSource, address: number): string | undefined {
  const entry = source === 'register'
    ? mapManager.getRegisterByAddress(address)
    : source === 'sysRegister'
    ? mapManager.getSystemRegisterByAddress(address)
    : mapManager.getParameterByAddress(address);
  return entry?.name;
}

/**
 * Subscribes a widget to periodic refresh of a single register/parameter.
 *
 * Subscriptions are coalesced address-side, so N widgets bound to the same
 * address produce one device read rather than N. Delegates to
 * `usePolledTargets` — the one place a surface actually subscribes — rather
 * than declaring interest a second way.
 */
export function useAutoRefresh({ source, address, refreshInterval, isEditMode }: UseAutoRefreshOptions): AutoRefreshStatus {
  const { state } = useDSHub();
  const connected = !!state.connection?.connected;
  const actualName = lookupName(source, address);

  const targets = useMemo(
    () => (actualName ? [{ source, address, name: actualName }] : []),
    [source, address, actualName]
  );

  usePolledTargets(targets, refreshInterval, !isEditMode && connected && mapManager.isInitialized());

  if (!isEditMode && connected) {
    if (!mapManager.isInitialized()) {
      return { error: 'Map not loaded' };
    }
    if (!actualName) {
      return { error: `${source} address ${address} not found in map` };
    }
  }
  return { error: null };
}

interface SystemInfoItem {
  label: string;
  source: DataSource;
  address: number;
  format?: string;
  unit?: string;
  color?: string;
}

interface UseAutoRefreshMultiOptions {
  items: SystemInfoItem[];
  refreshInterval: number;
  isEditMode: boolean;
}

/**
 * Multi-address variant, used by widgets that read several values at once.
 * Each address becomes its own coalesced subscription.
 */
export function useAutoRefreshMulti({ items, refreshInterval, isEditMode }: UseAutoRefreshMultiOptions): AutoRefreshStatus {
  const { state } = useDSHub();
  const connected = !!state.connection?.connected;

  // Stable key so the effect only restarts when the address set actually changes,
  // not on every render due to a new array reference.
  const itemsKey = items.map(i => `${i.source}:${i.address}`).join(',');

  const targets = useMemo(
    () => items
      .map(i => ({ source: i.source, address: i.address, name: lookupName(i.source, i.address) }))
      .filter((t): t is { source: DataSource; address: number; name: string } => Boolean(t.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemsKey, connected]
  );

  usePolledTargets(targets, refreshInterval, !isEditMode && connected && mapManager.isInitialized());

  if (!isEditMode && connected && !mapManager.isInitialized()) {
    return { error: 'Map not loaded' };
  }
  return { error: null };
}
