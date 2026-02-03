import { ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material';
import { useMemo, useEffect } from 'react';
import { DSHubProvider } from './contexts/DSHubContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/ToastNotification';
import MainLayout from './components/MainLayout';
import AutoScanManager from './components/AutoScanManager';
import { dsHubTheme, dsHubDarkTheme } from './theme';

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
      return dsHubDarkTheme;
    } else if (settings.theme === 'light') {
      return dsHubTheme;
    } else {
      // Auto mode - follow system preference
      return prefersDarkMode ? dsHubDarkTheme : dsHubTheme;
    }
  }, [settings.theme, prefersDarkMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DSHubProvider>
        <AutoScanManager />
        <MainLayout />
      </DSHubProvider>
    </ThemeProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <ToastProvider>
          <ThemedApp />
        </ToastProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}

export default App;
