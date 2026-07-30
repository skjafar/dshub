import { ThemeProvider, CssBaseline } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { useMemo, useEffect } from 'react';
import { BackendPortProvider } from './contexts/BackendPortContext';
import { createTauriBackendPort } from './services/tauriBackendPort';
import { DSHubProvider } from './contexts/DSHubContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/ToastNotification';
import MainLayout from './components/MainLayout';
import AutoScanManager from './components/AutoScanManager';
import { buildMuiTheme, getThemeById } from './appThemes';
import { alphaOf } from './design/contrast';

/**
 * Publishes the active theme as CSS custom properties so plain-CSS rules in
 * `index.css` (scrollbars, status squares, chart grid, HUD overlays) follow the
 * theme. Without this they were pinned to one hardcoded dark palette.
 */
function applyThemeVariables(theme: Theme): void {
  const root = document.documentElement;
  const c = theme.palette.custom;

  const vars: Record<string, string> = {
    '--surface': c.surface,
    '--surface-lowest': c.surfaceLowest,
    '--surface-container': c.surfaceContainer,
    '--surface-container-high': c.surfaceHigh,
    '--surface-container-highest': c.surfaceHighest,
    '--on-surface': c.onSurface,
    '--on-surface-variant': c.onSurfaceVar,
    '--outline': c.outline,
    '--outline-variant': c.outlineVar,
    '--primary': c.primary,
    '--primary-dim': c.primaryFixed,
    '--ghost': c.ghost,
    '--ghost-20': c.ghost20,
    '--ghost-sep': c.ghostSep,
    '--status-ok': c.status.ok,
    '--status-warn': c.status.warn,
    '--status-error': c.status.error,
    '--status-info': c.status.info,
    '--status-idle': c.status.idle,
    '--scrollbar-thumb': c.ghostSep,
    '--scrollbar-thumb-hover': c.primaryFixed,
    '--selection-bg': alphaOf(c.primary, 0.22),
    '--hud-bg': alphaOf(c.surfaceContainer, 0.72),
  };

  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = c.mode;
}

function ThemedApp() {
  const { settings, storageError } = useSettings();
  const { showWarning } = useToast();

  // Notify user once if localStorage is full and settings can no longer be persisted
  useEffect(() => {
    if (storageError) {
      showWarning('Browser storage is full. Settings cannot be saved. Clear browser data to restore persistence.');
    }
  }, [storageError, showWarning]);

  const theme = useMemo(
    () => buildMuiTheme(getThemeById(settings.colorThemeId)),
    [settings.colorThemeId]
  );

  useEffect(() => {
    applyThemeVariables(theme);
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
  // The one place the real backend is chosen. Everything below receives it by
  // injection, so a test or a browser session can substitute a fake without any
  // consumer knowing the difference. Built once — consumers hold it in effect
  // and memo dependencies, so a new identity per render would re-run them all.
  const port = useMemo(() => createTauriBackendPort(), []);

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
