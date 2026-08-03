import { useEffect, useMemo } from 'react';
import { useDSHub } from '../contexts/DSHubContext';
import { mapManager } from '../maps/mapManager';
import { pollRegistry } from '../services/pollRegistry';
import type { PollTarget } from '../services/pollRegistry';
import type { DataSource } from '../types/dashboard';

/**
 * Declares interest in a set of already-resolved addresses.
 *
 * The one place a surface subscribes to the shared poller. Widgets reach it
 * through `useAutoRefresh`/`useAutoRefreshMulti`, which look a name up from an
 * address first; a Pane listing entries from the Map already holds the names and
 * calls this directly. Either way there is a single subscribe-and-release path,
 * so "how does a surface declare interest" has one answer.
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
  const key = targets.map(t => `${t.source}:${t.address}:${t.name}`).join(',');

  const stable = useMemo(
    () => targets,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  useEffect(() => {
    if (!enabled || stable.length === 0) return;
    const unsubscribes = stable.map(target => pollRegistry.subscribe(target, intervalMs));
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [stable, intervalMs, enabled]);
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
 * Subscriptions are coalesced by `pollRegistry`, so N widgets bound to the same
 * address produce one device read rather than N. Previously each hook instance
 * owned its own `setInterval` and issued its own `invoke`.
 */
export function useAutoRefresh({ source, address, refreshInterval, isEditMode }: UseAutoRefreshOptions): AutoRefreshStatus {
  const { state } = useDSHub();
  const connected = !!state.connection?.connected;
  const actualName = lookupName(source, address);

  useEffect(() => {
    if (isEditMode || !connected) return;
    if (!mapManager.isInitialized() || !actualName) return;

    return pollRegistry.subscribe({ source, address, name: actualName }, refreshInterval);
  }, [source, address, refreshInterval, isEditMode, connected, actualName]);

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
