import { useMemo, useEffect } from 'react';
import { BackendPortProvider } from './contexts/BackendPortContext';
import { createBackendPort } from './services/createBackendPort';
import { DSHubProvider } from './contexts/DSHubContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { ErrorBoundary } from './shell/ErrorBoundary';
import { ToastProvider, useToast } from './shell/ToastNotification';
import { AppShell } from './shell/AppShell';
import { DaughterWindowShell } from './shell/DaughterWindowShell';
import AutoScanManager from './shell/AutoScanManager';
import AutoConnectManager from './shell/AutoConnectManager';
import { isMainWindow } from './shell/windowRole';
import { getThemeById } from './appThemes';
import { applyThemeVariables } from './design/themeVariables';

function ThemedApp() {
  const { settings, storageError } = useSettings();
  const { showWarning } = useToast();

  // Notify user once if localStorage is full and settings can no longer be persisted
  useEffect(() => {
    if (storageError) {
      showWarning('Browser storage is full. Settings cannot be saved. Clear browser data to restore persistence.');
    }
  }, [storageError, showWarning]);

  const appTheme = useMemo(
    () => getThemeById(settings.colorThemeId),
    [settings.colorThemeId]
  );

  // The design tokens reach every stylesheet through custom properties on the
  // root element. This is the only mechanism; nothing imports a palette.
  useEffect(() => {
    applyThemeVariables(appTheme);
  }, [appTheme]);

  // A Daughter Window (`.scratch/daughter-windows-native` issue 02) is a
  // fresh load of this same bundle in a genuinely separate `WebviewWindow`,
  // so it needs its own `DSHubProvider` — every Pane reads `useDSHub()` —
  // but never `AutoScanManager`/`AutoConnectManager`: Connect and Scan are
  // Main-Window-exclusive actions, and running them a second time from a
  // Daughter Window would be wrong, not merely redundant.
  // `ownsDeviceLifecycle={false}` is why closing a Daughter Window cannot
  // disconnect the whole app from the device (ADR 0003's amendment).
  return isMainWindow() ? (
    <DSHubProvider>
      <AutoScanManager />
      <AutoConnectManager />
      <AppShell />
    </DSHubProvider>
  ) : (
    <DSHubProvider ownsDeviceLifecycle={false}>
      <DaughterWindowShell />
    </DSHubProvider>
  );
}

function App() {
  // The one place the backend is chosen: the real transport inside the desktop
  // application, the fake in a plain browser. Everything below receives it by
  // injection and cannot tell which it holds. Built once — consumers hold it in
  // effect and memo dependencies, so a new identity per render would re-run them
  // all.
  const port = useMemo(() => createBackendPort(), []);

  return (
    <ErrorBoundary>
      <BackendPortProvider port={port}>
        <SettingsProvider>
          <ToastProvider>
            <ThemedApp />
          </ToastProvider>
        </SettingsProvider>
      </BackendPortProvider>
    </ErrorBoundary>
  );
}

export default App;
