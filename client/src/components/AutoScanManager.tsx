import { useEffect, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useDSHub } from '../contexts/DSHubContext';

/**
 * AutoScanManager - Handles automatic device scanning on startup
 * This component doesn't render anything, it just manages the autoscan behavior
 */
export default function AutoScanManager() {
  const { settings } = useSettings();
  const { state, actions } = useDSHub();
  const autoScanTriggered = useRef(false);

  useEffect(() => {
    // Only trigger autoscan once when:
    // 1. Socket is connected (serverConnected is true)
    // 2. AutoScan is enabled in settings
    // 3. We haven't already triggered it
    if (state.serverConnected && settings.autoScan && !autoScanTriggered.current) {
      autoScanTriggered.current = true;

      // Small delay to ensure socket event handlers are fully set up
      setTimeout(() => {
        actions.startScan();
      }, 500);
    }
  }, [state.serverConnected, settings.autoScan, actions]);

  return null; // This component doesn't render anything
}
