import { useEffect, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useDSHub } from '../contexts/DSHubContext';
import { InterfaceType } from '../types/shared';

/**
 * AutoConnectManager - connects to the last device on startup when Settings'
 * "Auto-connect to the last device on startup" is enabled, retrying per
 * `autoConnectRetries`/`autoConnectRetryDelay` if the first attempt fails.
 * This component doesn't render anything, it just manages the auto-connect
 * behavior.
 */
export default function AutoConnectManager() {
  const { settings } = useSettings();
  const { state, actions } = useDSHub();
  const triggered = useRef(false);

  // Read from inside the retry chain below without restarting it every time
  // the connection state changes — a connection made some other way while a
  // retry is pending (the user opening Connect Dialog themselves, or the
  // Device answering just as a retry was about to fire) should stop the
  // chain rather than race it.
  const connectedRef = useRef(false);
  connectedRef.current = state.connection?.connected ?? false;

  useEffect(() => {
    if (triggered.current || !settings.autoConnect || !settings.lastDeviceIP) return;
    triggered.current = true;

    const { lastDeviceIP, lastDeviceName, autoConnectRetries, autoConnectRetryDelay } = settings;
    const interfaceType = settings.lastInterfaceType === InterfaceType.UDP ? InterfaceType.UDP : InterfaceType.TCP;
    const maxAttempts = autoConnectRetries + 1;

    const attempt = (n: number): void => {
      if (connectedRef.current) return;
      void actions.connectDevice(lastDeviceIP, interfaceType, lastDeviceName).then(connected => {
        if (connected || connectedRef.current || n >= maxAttempts) return;
        setTimeout(() => attempt(n + 1), autoConnectRetryDelay);
      });
    };

    // Small delay to ensure the backend's own event handlers are fully set
    // up first — matches AutoScanManager's own startup delay.
    setTimeout(() => attempt(1), 500);
    // Deliberately narrower than the full read set above: this chain is meant
    // to run once per session, from whatever Settings held at that moment —
    // reacting to a later edit mid-retry would restart it against a moving
    // target rather than retrying the one attempt it already committed to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoConnect, settings.lastDeviceIP, actions]);

  return null;
}
