import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  FormControlLabel,
  FormLabel,
  RadioGroup,
  Radio,
  TextField,
  Switch,
  Button,
  Alert,
  Stack,
  InputAdornment,
  Checkbox,
  FormGroup,
  Chip,
  Tooltip
} from '@mui/material';
import {
  Brightness4 as ThemeIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  RestartAlt as ResetIcon,
  Warning as WarningIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ToastNotification';
import { useDeviceMon } from '../contexts/DeviceMonContext';
import MapProfilesPanel from './MapProfilesPanel';

export default function SettingsPanel() {
  const { settings, updateSettings, resetSettings, exportSettings, importSettings } = useSettings();
  const { showSuccess, showError, showWarning } = useToast();
  const { actions } = useDeviceMon();
  const [importError, setImportError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local state for input fields (allows typing any value)
  const [pollIntervalInput, setPollIntervalInput] = useState(settings.plotDefaults.pollInterval.toString());
  const [timeSpanInput, setTimeSpanInput] = useState(settings.plotDefaults.timeSpan.toString());
  const [maxTimeSpanInput, setMaxTimeSpanInput] = useState(settings.plotDefaults.maxTimeSpan.toString());
  const [maxDataPointsInput, setMaxDataPointsInput] = useState(settings.plotDefaults.maxDataPoints.toString());
  const [autoConnectRetriesInput, setAutoConnectRetriesInput] = useState(settings.autoConnectRetries.toString());
  const [autoConnectRetryDelayInput, setAutoConnectRetryDelayInput] = useState(settings.autoConnectRetryDelay.toString());
  const [maxLogCountInput, setMaxLogCountInput] = useState(settings.logSettings.maxLogCount.toString());

  // Sync local state when settings change externally
  useEffect(() => {
    setPollIntervalInput(settings.plotDefaults.pollInterval.toString());
    setTimeSpanInput(settings.plotDefaults.timeSpan.toString());
    setMaxTimeSpanInput(settings.plotDefaults.maxTimeSpan.toString());
    setMaxDataPointsInput(settings.plotDefaults.maxDataPoints.toString());
    setAutoConnectRetriesInput(settings.autoConnectRetries.toString());
    setAutoConnectRetryDelayInput(settings.autoConnectRetryDelay.toString());
    setMaxLogCountInput(settings.logSettings.maxLogCount.toString());
  }, [settings]);

  // Sync maxDataPoints setting with DeviceMonContext on mount and when setting changes
  useEffect(() => {
    actions.setMaxDataPoints(settings.plotDefaults.maxDataPoints);
  }, [settings.plotDefaults.maxDataPoints, actions]);

  // Validation helpers
  const validateNumber = (value: string, min: number, max: number): { valid: boolean; error?: string } => {
    const num = parseInt(value);
    if (isNaN(num)) return { valid: false, error: 'Must be a number' };
    if (num < min) return { valid: false, error: `Must be at least ${min}` };
    if (num > max) return { valid: false, error: `Must be at most ${max}` };
    return { valid: true };
  };

  const handleThemeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ theme: event.target.value as 'light' | 'dark' | 'auto' });
    showSuccess('Theme preference updated');
  };

  const handleLastIPChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ lastDeviceIP: event.target.value });
  };

  const handleInterfaceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ lastInterfaceType: event.target.value as 'TCP' | 'UDP' });
  };

  const handleAutoScanChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ autoScan: event.target.checked });
    showSuccess(`Auto-scan ${event.target.checked ? 'enabled' : 'disabled'}`);
  };

  const handleAutoConnectChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ autoConnect: event.target.checked });
    showSuccess(`Auto-connect ${event.target.checked ? 'enabled' : 'disabled'}`);
  };

  const handlePollIntervalChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setPollIntervalInput(value);

    const validation = validateNumber(value, 50, 10000);
    if (validation.valid) {
      updateSettings({ plotDefaults: { ...settings.plotDefaults, pollInterval: parseInt(value) } });
    }
  };

  const handleTimeSpanChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setTimeSpanInput(value);

    const validation = validateNumber(value, 5, settings.plotDefaults.maxTimeSpan);
    if (validation.valid) {
      updateSettings({ plotDefaults: { ...settings.plotDefaults, timeSpan: parseInt(value) } });
    }
  };

  const handleMaxTimeSpanChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setMaxTimeSpanInput(value);

    const validation = validateNumber(value, 60, 86400);
    if (validation.valid) {
      updateSettings({ plotDefaults: { ...settings.plotDefaults, maxTimeSpan: parseInt(value) } });
    }
  };

  const handleMaxDataPointsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setMaxDataPointsInput(value);

    const validation = validateNumber(value, 1000, 100000);
    if (validation.valid) {
      const numValue = parseInt(value);

      // Show warning if setting a high value
      if (numValue > 50000) {
        showWarning(`High data point limit set (${numValue.toLocaleString()}). This may use significant memory (~${Math.round(numValue * 16 / 1024)} KB per series).`);
      }

      updateSettings({ plotDefaults: { ...settings.plotDefaults, maxDataPoints: numValue } });
      actions.setMaxDataPoints(numValue);
      showSuccess(`Max data points updated to ${numValue.toLocaleString()}`);
    }
  };

  const handleAutoConnectRetriesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setAutoConnectRetriesInput(value);

    const validation = validateNumber(value, 0, 10);
    if (validation.valid) {
      updateSettings({ autoConnectRetries: parseInt(value) });
    }
  };

  const handleAutoConnectRetryDelayChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setAutoConnectRetryDelayInput(value);

    const validation = validateNumber(value, 500, 10000);
    if (validation.valid) {
      updateSettings({ autoConnectRetryDelay: parseInt(value) });
    }
  };

  // Log settings handlers
  const handleLogSettingChange = (setting: keyof typeof settings.logSettings, value: boolean | number) => {
    updateSettings({
      logSettings: {
        ...settings.logSettings,
        [setting]: value
      }
    });
  };

  const handleMaxLogCountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setMaxLogCountInput(value);

    const validation = validateNumber(value, 100, 10000);
    if (validation.valid) {
      const numValue = parseInt(value);
      handleLogSettingChange('maxLogCount', numValue);

      // Show warnings based on value
      if (numValue > 1000) {
        showWarning('High log count may impact performance and memory usage');
      } else if (numValue > 500) {
        showWarning('Moderate log count - monitor performance');
      }
    }
  };

  const handleExportSettings = () => {
    try {
      const json = exportSettings();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `devicemon-settings-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess('Settings exported successfully');
    } catch (error) {
      showError('Failed to export settings');
    }
  };

  const handleImportSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const success = importSettings(content);
        if (success) {
          showSuccess('Settings imported successfully');
          setImportError('');
        } else {
          setImportError('Invalid settings file format');
          showError('Invalid settings file format');
        }
      } catch (error) {
        setImportError('Failed to read settings file');
        showError('Failed to read settings file');
      }
    };
    reader.readAsText(file);

    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleResetSettings = () => {
    if (window.confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      resetSettings();
      showSuccess('Settings reset to defaults');
    }
  };

  return (
    <Box>
      <Typography variant="h5" component="h1" gutterBottom>
        Settings
      </Typography>

      <Stack spacing={3}>
        {/* Theme Settings */}
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <ThemeIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Theme</Typography>
            </Box>

            <FormControl component="fieldset">
              <FormLabel component="legend">Color Mode</FormLabel>
              <RadioGroup value={settings.theme} onChange={handleThemeChange} row>
                <FormControlLabel value="light" control={<Radio />} label="Light" />
                <FormControlLabel value="dark" control={<Radio />} label="Dark" />
                <FormControlLabel value="auto" control={<Radio />} label="Auto (System)" />
              </RadioGroup>
            </FormControl>
          </CardContent>
        </Card>

        {/* Connection Settings */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Connection</Typography>

            <Stack spacing={2}>
              <TextField
                label="Last Device IP"
                value={settings.lastDeviceIP}
                onChange={handleLastIPChange}
                fullWidth
                placeholder="192.168.1.100"
                helperText="IP address of the last connected device"
              />

              <FormControl component="fieldset">
                <FormLabel component="legend">Preferred Interface</FormLabel>
                <RadioGroup value={settings.lastInterfaceType} onChange={handleInterfaceChange} row>
                  <FormControlLabel value="TCP" control={<Radio />} label="TCP" />
                  <FormControlLabel value="UDP" control={<Radio />} label="UDP" />
                </RadioGroup>
              </FormControl>

              <FormControlLabel
                control={
                  <Switch
                    checked={settings.autoScan}
                    onChange={handleAutoScanChange}
                  />
                }
                label="Auto-scan for devices on startup"
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={settings.autoConnect}
                    onChange={handleAutoConnectChange}
                  />
                }
                label="Auto-connect to last device on startup"
              />

              {settings.autoConnect && (
                <>
                  <TextField
                    label="Retry Attempts"
                    type="number"
                    value={autoConnectRetriesInput}
                    onChange={handleAutoConnectRetriesChange}
                    error={!validateNumber(autoConnectRetriesInput, 0, 10).valid}
                    helperText={
                      validateNumber(autoConnectRetriesInput, 0, 10).error ||
                      "Number of times to retry connection (0-10)"
                    }
                    fullWidth
                  />

                  <TextField
                    label="Retry Delay"
                    type="number"
                    value={autoConnectRetryDelayInput}
                    onChange={handleAutoConnectRetryDelayChange}
                    error={!validateNumber(autoConnectRetryDelayInput, 500, 10000).valid}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">ms</InputAdornment>,
                    }}
                    helperText={
                      validateNumber(autoConnectRetryDelayInput, 500, 10000).error ||
                      "Delay between retry attempts (500-10000 ms)"
                    }
                    fullWidth
                  />
                </>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Map Profiles */}
        <MapProfilesPanel />

        {/* Plot Defaults */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Plot Defaults</Typography>

            <Stack spacing={2}>
              <TextField
                label="Default Poll Interval"
                type="number"
                value={pollIntervalInput}
                onChange={handlePollIntervalChange}
                error={!validateNumber(pollIntervalInput, 50, 10000).valid}
                InputProps={{
                  endAdornment: <InputAdornment position="end">ms</InputAdornment>,
                }}
                helperText={
                  validateNumber(pollIntervalInput, 50, 10000).error ||
                  "How often to poll for new data (50-10000 ms)"
                }
                fullWidth
              />

              <TextField
                label="Default Time Span"
                type="number"
                value={timeSpanInput}
                onChange={handleTimeSpanChange}
                error={!validateNumber(timeSpanInput, 5, settings.plotDefaults.maxTimeSpan).valid}
                InputProps={{
                  endAdornment: <InputAdornment position="end">seconds</InputAdornment>,
                }}
                helperText={
                  validateNumber(timeSpanInput, 5, settings.plotDefaults.maxTimeSpan).error ||
                  `How much historical data to show (5-${settings.plotDefaults.maxTimeSpan} seconds)`
                }
                fullWidth
              />

              <TextField
                label="Maximum Time Span"
                type="number"
                value={maxTimeSpanInput}
                onChange={handleMaxTimeSpanChange}
                error={!validateNumber(maxTimeSpanInput, 60, 86400).valid}
                InputProps={{
                  endAdornment: <InputAdornment position="end">seconds</InputAdornment>,
                }}
                helperText={
                  validateNumber(maxTimeSpanInput, 60, 86400).error ||
                  "Maximum allowed time span (60-86400 seconds / 1min-24hr)"
                }
                fullWidth
              />

              <TextField
                label="Maximum Data Points"
                type="number"
                value={maxDataPointsInput}
                onChange={handleMaxDataPointsChange}
                error={!validateNumber(maxDataPointsInput, 1000, 100000).valid}
                InputProps={{
                  endAdornment: <InputAdornment position="end">points</InputAdornment>,
                }}
                helperText={
                  validateNumber(maxDataPointsInput, 1000, 100000).error ||
                  `Data retention limit per series (1k-100k points, ~${Math.round(settings.plotDefaults.maxDataPoints * 16 / 1024)} KB memory)`
                }
                fullWidth
              />

              <Alert severity="info" sx={{ mt: 1 }}>
                <Typography variant="caption">
                  Higher values allow viewing longer historical data but use more memory.
                  Each series uses approximately {Math.round(settings.plotDefaults.maxDataPoints * 16 / 1024)} KB with current setting.
                  Values above 50,000 may impact performance on slower devices.
                </Typography>
              </Alert>
            </Stack>
          </CardContent>
        </Card>

        {/* Activity Log Configuration */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Activity Log Configuration</Typography>

            <Stack spacing={2}>
              <Alert severity="info">
                <Typography variant="body2">
                  Control which types of log entries are recorded. Disabling verbose log categories reduces processing and memory usage.
                </Typography>
              </Alert>

              <FormGroup>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={settings.logSettings.enableConnectionLogs}
                      onChange={(e) => handleLogSettingChange('enableConnectionLogs', e.target.checked)}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Tooltip title="System events, device connection status, and scanning activity">
                        <span>Connection & State Logs</span>
                      </Tooltip>
                      <Chip label="Recommended" color="success" size="small" />
                    </Box>
                  }
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={settings.logSettings.enableRegisterLogs}
                      onChange={(e) => handleLogSettingChange('enableRegisterLogs', e.target.checked)}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Tooltip title="Read and write responses for register operations">
                        <span>Register Data Logs</span>
                      </Tooltip>
                      <Chip label="Medium Impact" color="warning" size="small" />
                    </Box>
                  }
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={settings.logSettings.enableParameterLogs}
                      onChange={(e) => handleLogSettingChange('enableParameterLogs', e.target.checked)}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Tooltip title="Read and write responses for parameter operations">
                        <span>Parameter Data Logs</span>
                      </Tooltip>
                      <Chip label="Medium Impact" color="warning" size="small" />
                    </Box>
                  }
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={settings.logSettings.enablePacketLogs}
                      onChange={(e) => handleLogSettingChange('enablePacketLogs', e.target.checked)}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Tooltip title="Detailed packet analysis with hex dumps (very verbose)">
                        <span>Packet Analysis Logs</span>
                      </Tooltip>
                      <Chip label="High Impact" color="error" size="small" />
                    </Box>
                  }
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={settings.logSettings.enableAutoRefreshLogs}
                      onChange={(e) => handleLogSettingChange('enableAutoRefreshLogs', e.target.checked)}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Tooltip title="Periodic auto-refresh operation messages">
                        <span>Auto-Refresh Logs</span>
                      </Tooltip>
                      <Chip label="Low Impact" color="default" size="small" />
                    </Box>
                  }
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={settings.logSettings.enablePlottingLogs}
                      onChange={(e) => handleLogSettingChange('enablePlottingLogs', e.target.checked)}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Tooltip title="Plot start and stop events">
                        <span>Plotting Logs</span>
                      </Tooltip>
                      <Chip label="Low Impact" color="default" size="small" />
                    </Box>
                  }
                />
              </FormGroup>

              <TextField
                label="Maximum Log Entries"
                type="number"
                value={maxLogCountInput}
                onChange={handleMaxLogCountChange}
                error={!validateNumber(maxLogCountInput, 100, 10000).valid}
                InputProps={{
                  endAdornment: <InputAdornment position="end">
                    {parseInt(maxLogCountInput) > 1000 && <ErrorIcon color="error" sx={{ mr: 1 }} />}
                    {parseInt(maxLogCountInput) > 500 && parseInt(maxLogCountInput) <= 1000 && <WarningIcon color="warning" sx={{ mr: 1 }} />}
                    entries
                  </InputAdornment>,
                }}
                helperText={
                  validateNumber(maxLogCountInput, 100, 10000).error ||
                  "Maximum number of log entries to retain (100-10000)"
                }
                fullWidth
              />

              {parseInt(maxLogCountInput) > 1000 && validateNumber(maxLogCountInput, 100, 10000).valid && (
                <Alert severity="error" icon={<ErrorIcon />}>
                  <Typography variant="body2">
                    <strong>Warning:</strong> Log counts above 1000 may significantly impact performance and memory usage, especially with verbose logging enabled.
                  </Typography>
                </Alert>
              )}

              {parseInt(maxLogCountInput) > 500 && parseInt(maxLogCountInput) <= 1000 && validateNumber(maxLogCountInput, 100, 10000).valid && (
                <Alert severity="warning" icon={<WarningIcon />}>
                  <Typography variant="body2">
                    Log counts between 500-1000 may impact performance. Monitor system responsiveness.
                  </Typography>
                </Alert>
              )}

              <Alert severity="info">
                <Typography variant="caption">
                  Estimated memory usage: ~{Math.round(parseInt(maxLogCountInput || '1000') * 0.5)} KB with current max log count.
                  Packet analysis logs can use significantly more memory when enabled.
                </Typography>
              </Alert>
            </Stack>
          </CardContent>
        </Card>

        {/* Import/Export Settings */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Backup & Restore</Typography>

            <Stack spacing={2}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={handleExportSettings}
                >
                  Export Settings
                </Button>

                <input
                  type="file"
                  accept=".json"
                  ref={fileInputRef}
                  onChange={handleImportSettings}
                  style={{ display: 'none' }}
                />
                <Button
                  variant="outlined"
                  startIcon={<UploadIcon />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Import Settings
                </Button>

                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<ResetIcon />}
                  onClick={handleResetSettings}
                >
                  Reset to Defaults
                </Button>
              </Box>

              {importError && (
                <Alert severity="error">{importError}</Alert>
              )}

              <Alert severity="info">
                <Typography variant="body2">
                  Export your settings to back them up, or import previously saved settings.
                  This includes theme, connection preferences, and custom maps.
                </Typography>
              </Alert>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
