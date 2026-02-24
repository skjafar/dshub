import { useEffect, useRef } from 'react';
import { useDSHub } from '../contexts/DSHubContext';
import { mapManager } from '../maps/mapManager';
import type { DataSource } from '../types/dashboard';

interface UseAutoRefreshOptions {
  source: DataSource;
  address: number;
  refreshInterval: number;
  isEditMode: boolean;
}

export interface AutoRefreshStatus {
  error: string | null;
}

/**
 * Hook for auto-refreshing a single register/parameter value.
 * Handles map lookup, connection checks, and polling interval.
 * Returns an error string if the map is not loaded or address not found.
 */
export function useAutoRefresh({ source, address, refreshInterval, isEditMode }: UseAutoRefreshOptions): AutoRefreshStatus {
  const { state, actions } = useDSHub();

  const mapEntry = source === 'register'
    ? mapManager.getRegisterByAddress(address)
    : mapManager.getParameterByAddress(address);
  const actualName = mapEntry?.name;

  // Use a ref so the callback always has the latest actions without
  // including the (unstable) actions object in the dependency array.
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    if (isEditMode || !state.connection?.connected) return;
    if (!mapManager.isInitialized() || !actualName) return;

    const readData = () => {
      if (source === 'register') {
        actionsRef.current.readRegister(address, actualName);
      } else {
        actionsRef.current.readParameter(address, actualName);
      }
    };

    readData();
    const intervalId = setInterval(readData, refreshInterval);
    return () => clearInterval(intervalId);
  }, [source, address, refreshInterval, isEditMode, state.connection?.connected, actualName]);

  if (!isEditMode && state.connection?.connected) {
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
 * Hook for auto-refreshing multiple register/parameter values.
 * Used by SystemInfoWidget which reads multiple addresses at once.
 */
export function useAutoRefreshMulti({ items, refreshInterval, isEditMode }: UseAutoRefreshMultiOptions): AutoRefreshStatus {
  const { state, actions } = useDSHub();

  // Stable key so the effect only restarts when addresses actually change,
  // not on every render due to a new array reference.
  const itemsKey = items.map(i => `${i.source}:${i.address}`).join(',');
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Use a ref so the callback always has the latest actions without
  // including the (unstable) actions object in the dependency array.
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    if (isEditMode || !state.connection?.connected) return;
    if (!mapManager.isInitialized()) return;

    const readAllData = () => {
      itemsRef.current.forEach(item => {
        const mapEntry = item.source === 'register'
          ? mapManager.getRegisterByAddress(item.address)
          : mapManager.getParameterByAddress(item.address);

        if (mapEntry) {
          if (item.source === 'register') {
            actionsRef.current.readRegister(item.address, mapEntry.name);
          } else {
            actionsRef.current.readParameter(item.address, mapEntry.name);
          }
        }
      });
    };

    readAllData();
    const intervalId = setInterval(readAllData, refreshInterval);
    return () => clearInterval(intervalId);
  }, [itemsKey, refreshInterval, isEditMode, state.connection?.connected]);

  if (!isEditMode && state.connection?.connected && !mapManager.isInitialized()) {
    return { error: 'Map not loaded' };
  }
  return { error: null };
}
