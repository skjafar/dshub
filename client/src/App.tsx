import { ThemeProvider, CssBaseline } from '@mui/material';
import { useMemo, useEffect } from 'react';
import { BackendPortProvider } from './contexts/BackendPortContext';
import { createBackendPort } from './services/createBackendPort';
import { DSHubProvider } from './contexts/DSHubContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/ToastNotification';
import { AppShell } from './shell/AppShell';
import AutoScanManager from './components/AutoScanManager';
import { buildMuiTheme, getThemeById } from './appThemes';
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
  const theme = useMemo(() => buildMuiTheme(appTheme), [appTheme]);

  // The design tokens reach every stylesheet through custom properties on the
  // root element. This is the only mechanism; nothing imports a palette.
  useEffect(() => {
    applyThemeVariables(appTheme);
  }, [appTheme]);

  return (
    // MUI is still mounted for the toast and the top-level error boundary. Both
    // are ported when the old view layer is removed; until then the theme has to
    // reach them, which is what this provider is still doing here.
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DSHubProvider>
        <AutoScanManager />
        <AppShell />
      </DSHubProvider>
    </ThemeProvider>
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
