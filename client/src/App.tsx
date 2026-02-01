import { ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material';
import { useMemo, useEffect } from 'react';
import { DeviceMonProvider } from './contexts/DeviceMonContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/ToastNotification';
import MainLayout from './components/MainLayout';
import AutoScanManager from './components/AutoScanManager';
import { deviceMonTheme, deviceMonDarkTheme } from './theme';

function ThemedApp() {
  const { settings, storageError } = useSettings();
  const { showWarning } = useToast();
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

  // Notify user once if localStorage is full and settings can no longer be persisted
  useEffect(() => {
    if (storageError) {
      showWarning('Browser storage is full. Settings cannot be saved. Clear browser data to restore persistence.');
    }
  }, [storageError, showWarning]);

  const theme = useMemo(() => {
    if (settings.theme === 'dark') {
      return deviceMonDarkTheme;
    } else if (settings.theme === 'light') {
      return deviceMonTheme;
    } else {
      // Auto mode - follow system preference
      return prefersDarkMode ? deviceMonDarkTheme : deviceMonTheme;
    }
  }, [settings.theme, prefersDarkMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ToastProvider>
        <DeviceMonProvider>
          <AutoScanManager />
          <MainLayout />
        </DeviceMonProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <ThemedApp />
      </SettingsProvider>
    </ErrorBoundary>
  );
}

export default App;
