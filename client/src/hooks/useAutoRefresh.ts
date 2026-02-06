import { useEffect } from 'react';
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

  useEffect(() => {
    if (isEditMode || !state.connection?.connected) return;
    if (!mapManager.isInitialized() || !actualName) return;

    const readData = () => {
      if (source === 'register') {
        actions.readRegister(address, actualName);
      } else {
        actions.readParameter(address, actualName);
      }
    };

    readData();
    const intervalId = setInterval(readData, refreshInterval);
    return () => clearInterval(intervalId);
  }, [source, address, refreshInterval, isEditMode, state.connection?.connected, actualName, actions]);

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

  useEffect(() => {
    if (isEditMode || !state.connection?.connected) return;
    if (!mapManager.isInitialized()) return;

    const readAllData = () => {
      items.forEach(item => {
        const mapEntry = item.source === 'register'
          ? mapManager.getRegisterByAddress(item.address)
          : mapManager.getParameterByAddress(item.address);

        if (mapEntry) {
          if (item.source === 'register') {
            actions.readRegister(item.address, mapEntry.name);
          } else {
            actions.readParameter(item.address, mapEntry.name);
          }
        }
      });
    };

    readAllData();
    const intervalId = setInterval(readAllData, refreshInterval);
    return () => clearInterval(intervalId);
  }, [items, refreshInterval, isEditMode, state.connection?.connected, actions]);

  if (!isEditMode && state.connection?.connected && !mapManager.isInitialized()) {
    return { error: 'Map not loaded' };
  }
  return { error: null };
}
