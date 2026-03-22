import { ThemeProvider, CssBaseline } from '@mui/material';
import { useMemo, useEffect } from 'react';
import { DSHubProvider } from './contexts/DSHubContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/ToastNotification';
import MainLayout from './components/MainLayout';
import AutoScanManager from './components/AutoScanManager';
import { buildMuiTheme, getThemeById, hexCh, DEFAULT_THEME_ID } from './appThemes';

function ThemedApp() {
  const { settings, storageError } = useSettings();
  const { showWarning } = useToast();

  // Notify user once if localStorage is full and settings can no longer be persisted
  useEffect(() => {
    if (storageError) {
      showWarning('Browser storage is full. Settings cannot be saved. Clear browser data to restore persistence.');
    }
  }, [storageError, showWarning]);

  const theme = useMemo(() => {
    return buildMuiTheme(getThemeById(settings.colorThemeId ?? DEFAULT_THEME_ID));
  }, [settings.colorThemeId]);

  // Sync CSS custom properties for scrollbar & selection styling
  useEffect(() => {
    const root = document.documentElement;
    const c = theme.palette.custom;
    root.style.setProperty('--scrollbar-thumb', c.surfaceHigh);
    root.style.setProperty('--scrollbar-thumb-hover', c.primaryFixed);
    root.style.setProperty('--selection-bg', `rgba(${hexCh(c.primary)},0.22)`);
  }, [theme]);

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
