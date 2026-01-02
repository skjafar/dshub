import { ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material';
import { useMemo } from 'react';
import { DeviceMonProvider } from './contexts/DeviceMonContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastNotification';
import MainLayout from './components/MainLayout';
import AutoScanManager from './components/AutoScanManager';
import { deviceMonTheme, deviceMonDarkTheme } from './theme';

function ThemedApp() {
  const { settings } = useSettings();
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

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
