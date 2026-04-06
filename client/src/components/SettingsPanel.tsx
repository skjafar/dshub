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
  Stack,
  InputAdornment,
  Checkbox,
  FormGroup,
  Tooltip,
  useTheme
} from '@mui/material';
import {
  Upload as UploadIcon,
  Download as DownloadIcon,
  RestartAlt as ResetIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ToastNotification';
import { useDSHub } from '../contexts/DSHubContext';
import { FONT_MONO, FONT_BODY } from '../theme';
import { APP_THEMES } from '../appThemes';

export default function SettingsPanel() {
  const { palette: { custom: c } } = useTheme();
  const { settings, updateSettings, resetSettings, exportSettings, importSettings } = useSettings();
  const { showSuccess, showError, showWarning } = useToast();
  const { actions } = useDSHub();
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

  // Sync maxDataPoints setting with DSHubContext on mount and when setting changes
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

  const handleColorThemeChange = (id: string) => {
    updateSettings({ colorThemeId: id });
    showSuccess('Theme updated');
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
      a.download = `dshub-settings-${Date.now()}.json`;
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
      <Stack spacing={2}>
        {/* Theme full-width, then Connection below */}
        <Card>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1.5, display: 'block', letterSpacing: '0.08em' }}>
              Theme
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1 }}>
              {APP_THEMES.map((t) => {
                const isSelected = (settings.colorThemeId ?? 'kinetic-monolith') === t.id;
                return (
                  <Box
                    key={t.id}
                    onClick={() => handleColorThemeChange(t.id)}
                    sx={{
                      position: 'relative',
                      borderRadius: '6px',
                      border: isSelected ? `2px solid ${t.preview[0]}` : '2px solid transparent',
                      outline: isSelected ? `1px solid ${t.preview[0]}` : `1px solid ${c.ghost20}`,
                      cursor: 'pointer',
                      overflow: 'hidden',
                      transition: 'border-color 0.15s, outline-color 0.15s',
                      '&:hover': { outline: `1px solid ${t.preview[0]}` },
                    }}
                  >
                    {/* Color swatch row */}
                    <Box sx={{ display: 'flex', height: 36 }}>
                      {t.preview.map((color, i) => (
                        <Box key={i} sx={{ flex: 1, backgroundColor: color }} />
                      ))}
                    </Box>

                    {/* Name + description + mode badge */}
                    <Box sx={{
                      px: 1,
                      pt: 0.75,
                      pb: 0.75,
                      backgroundColor: t.mode === 'dark' ? '#111' : '#f8f8f8',
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                        <Typography sx={{
                          fontFamily: FONT_BODY,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: t.mode === 'dark' ? '#e8e8e8' : '#1a1a1a',
                          lineHeight: 1.3,
                        }}>
                          {t.name}
                        </Typography>
                        {isSelected && (
                          <CheckIcon sx={{ fontSize: 14, color: t.preview[0], flexShrink: 0 }} />
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                        <Typography sx={{
                          fontFamily: FONT_BODY,
                          fontSize: '0.625rem',
                          color: t.mode === 'dark' ? 'rgba(200,200,200,0.6)' : 'rgba(60,60,60,0.6)',
                          lineHeight: 1.4,
                          flexGrow: 1,
                        }}>
                          {t.description}
                        </Typography>
                        <Typography sx={{
                          fontFamily: FONT_MONO,
                          fontSize: '0.5625rem',
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          color: t.mode === 'dark' ? 'rgba(160,160,160,0.7)' : 'rgba(80,80,80,0.7)',
                          flexShrink: 0,
                          textTransform: 'uppercase',
                        }}>
                          {t.mode}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1.5, display: 'block', letterSpacing: '0.08em' }}>
              Connection
            </Typography>

            <Stack spacing={2}>
              <TextField
                label="Last Device IP"
                value={settings.lastDeviceIP}
                onChange={handleLastIPChange}
                fullWidth
                size="small"
                placeholder="192.168.1.100"
                helperText="IP address of the last connected device"
                sx={{ '& .MuiInputBase-input': { fontFamily: FONT_MONO, fontSize: '0.8125rem' } }}
              />

              <FormControl component="fieldset">
                <FormLabel component="legend" sx={{ fontSize: '0.75rem' }}>Preferred Interface</FormLabel>
                <RadioGroup value={settings.lastInterfaceType} onChange={handleInterfaceChange} row>
                  <FormControlLabel value="TCP" control={<Radio size="small" />} label={<Typography variant="body2" sx={{ fontFamily: FONT_MONO }}>TCP</Typography>} />
                  <FormControlLabel value="UDP" control={<Radio size="small" />} label={<Typography variant="body2" sx={{ fontFamily: FONT_MONO }}>UDP</Typography>} />
                </RadioGroup>
              </FormControl>

              <FormControlLabel
                control={
                  <Switch
                    checked={settings.autoScan}
                    onChange={handleAutoScanChange}
                    size="small"
                  />
                }
                label={<Typography variant="body2">Auto-scan for devices on startup</Typography>}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={settings.autoConnect}
                    onChange={handleAutoConnectChange}
                    size="small"
                  />
                }
                label={<Typography variant="body2">Auto-connect to last device on startup</Typography>}
              />

              {settings.autoConnect && (
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Retry Attempts"
                    type="number"
                    value={autoConnectRetriesInput}
                    onChange={handleAutoConnectRetriesChange}
                    error={!validateNumber(autoConnectRetriesInput, 0, 10).valid}
                    helperText={
                      validateNumber(autoConnectRetriesInput, 0, 10).error ||
                      "0-10 attempts"
                    }
                    size="small"
                    sx={{ flex: 1, '& .MuiInputBase-input': { fontFamily: FONT_MONO, fontSize: '0.8125rem' } }}
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
                      "500-10000 ms"
                    }
                    size="small"
                    sx={{ flex: 1, '& .MuiInputBase-input': { fontFamily: FONT_MONO, fontSize: '0.8125rem' } }}
                  />
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Plot Defaults */}
        <Card>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1.5, display: 'block', letterSpacing: '0.08em' }}>
              Plot Defaults
            </Typography>

            <Stack spacing={2}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Poll Interval"
                  type="number"
                  value={pollIntervalInput}
                  onChange={handlePollIntervalChange}
                  error={!validateNumber(pollIntervalInput, 50, 10000).valid}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">ms</InputAdornment>,
                  }}
                  helperText={validateNumber(pollIntervalInput, 50, 10000).error || "50-10000 ms"}
                  size="small"
                  sx={{ flex: 1, '& .MuiInputBase-input': { fontFamily: FONT_MONO, fontSize: '0.8125rem' } }}
                />

                <TextField
                  label="Time Span"
                  type="number"
                  value={timeSpanInput}
                  onChange={handleTimeSpanChange}
                  error={!validateNumber(timeSpanInput, 5, settings.plotDefaults.maxTimeSpan).valid}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">s</InputAdornment>,
                  }}
                  helperText={validateNumber(timeSpanInput, 5, settings.plotDefaults.maxTimeSpan).error || `5-${settings.plotDefaults.maxTimeSpan}s`}
                  size="small"
                  sx={{ flex: 1, '& .MuiInputBase-input': { fontFamily: FONT_MONO, fontSize: '0.8125rem' } }}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Max Time Span"
                  type="number"
                  value={maxTimeSpanInput}
                  onChange={handleMaxTimeSpanChange}
                  error={!validateNumber(maxTimeSpanInput, 60, 86400).valid}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">s</InputAdornment>,
                  }}
                  helperText={validateNumber(maxTimeSpanInput, 60, 86400).error || "60-86400s"}
                  size="small"
                  sx={{ flex: 1, '& .MuiInputBase-input': { fontFamily: FONT_MONO, fontSize: '0.8125rem' } }}
                />

                <TextField
                  label="Max Data Points"
                  type="number"
                  value={maxDataPointsInput}
                  onChange={handleMaxDataPointsChange}
                  error={!validateNumber(maxDataPointsInput, 1000, 100000).valid}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">pts</InputAdornment>,
                  }}
                  helperText={validateNumber(maxDataPointsInput, 1000, 100000).error || `~${Math.round(settings.plotDefaults.maxDataPoints * 16 / 1024)} KB/series`}
                  size="small"
                  sx={{ flex: 1, '& .MuiInputBase-input': { fontFamily: FONT_MONO, fontSize: '0.8125rem' } }}
                />
              </Box>

              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Higher values allow viewing longer historical data but use more memory. Values above 50k may impact performance.
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        {/* Activity Log Configuration */}
        <Card>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1.5, display: 'block', letterSpacing: '0.08em' }}>
              Activity Log Configuration
            </Typography>

            <Stack spacing={2}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Control which log categories are recorded. Disabling verbose categories reduces processing and memory usage.
              </Typography>

              <FormGroup>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={settings.logSettings.enableConnectionLogs}
                      onChange={(e) => handleLogSettingChange('enableConnectionLogs', e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">Connection & State</Typography>
                      <Tooltip title="System events, device connection status, and scanning activity">
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#00E676', flexShrink: 0 }} />
                      </Tooltip>
                    </Box>
                  }
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={settings.logSettings.enableRegisterLogs}
                      onChange={(e) => handleLogSettingChange('enableRegisterLogs', e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">Register Data</Typography>
                      <Tooltip title="Read and write responses for register operations">
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#FFAB00', flexShrink: 0 }} />
                      </Tooltip>
                    </Box>
                  }
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={settings.logSettings.enableParameterLogs}
                      onChange={(e) => handleLogSettingChange('enableParameterLogs', e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">Parameter Data</Typography>
                      <Tooltip title="Read and write responses for parameter operations">
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#FFAB00', flexShrink: 0 }} />
                      </Tooltip>
                    </Box>
                  }
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={settings.logSettings.enablePacketLogs}
                      onChange={(e) => handleLogSettingChange('enablePacketLogs', e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">Packet Analysis</Typography>
                      <Tooltip title="Detailed packet analysis with hex dumps (very verbose)">
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#FF3D71', flexShrink: 0 }} />
                      </Tooltip>
                    </Box>
                  }
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={settings.logSettings.enableAutoRefreshLogs}
                      onChange={(e) => handleLogSettingChange('enableAutoRefreshLogs', e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">Auto-Refresh</Typography>
                      <Tooltip title="Periodic auto-refresh operation messages">
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#7A7A8A', flexShrink: 0 }} />
                      </Tooltip>
                    </Box>
                  }
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={settings.logSettings.enablePlottingLogs}
                      onChange={(e) => handleLogSettingChange('enablePlottingLogs', e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">Plotting</Typography>
                      <Tooltip title="Plot start and stop events">
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#7A7A8A', flexShrink: 0 }} />
                      </Tooltip>
                    </Box>
                  }
                />
              </FormGroup>

              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5 }}>Impact:</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#7A7A8A' }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary', mr: 1.5 }}>Low</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#FFAB00' }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary', mr: 1.5 }}>Medium</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#FF3D71' }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary', mr: 1.5 }}>High</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#00E676' }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>Recommended</Typography>
                </Box>
              </Box>

              <TextField
                label="Max Log Entries"
                type="number"
                value={maxLogCountInput}
                onChange={handleMaxLogCountChange}
                error={!validateNumber(maxLogCountInput, 100, 10000).valid}
                InputProps={{
                  endAdornment: <InputAdornment position="end">
                    {parseInt(maxLogCountInput) > 1000 && <ErrorIcon color="error" sx={{ fontSize: '1rem', mr: 0.5 }} />}
                    {parseInt(maxLogCountInput) > 500 && parseInt(maxLogCountInput) <= 1000 && <WarningIcon color="warning" sx={{ fontSize: '1rem', mr: 0.5 }} />}
                    entries
                  </InputAdornment>,
                }}
                helperText={
                  validateNumber(maxLogCountInput, 100, 10000).error ||
                  `100-10000 entries (~${Math.round(parseInt(maxLogCountInput || '1000') * 0.5)} KB)`
                }
                size="small"
                sx={{ '& .MuiInputBase-input': { fontFamily: FONT_MONO, fontSize: '0.8125rem' } }}
                fullWidth
              />

              {parseInt(maxLogCountInput) > 1000 && validateNumber(maxLogCountInput, 100, 10000).valid && (
                <Typography variant="caption" sx={{ color: 'error.main' }}>
                  Log counts above 1000 may significantly impact performance with verbose logging enabled.
                </Typography>
              )}

              {parseInt(maxLogCountInput) > 500 && parseInt(maxLogCountInput) <= 1000 && validateNumber(maxLogCountInput, 100, 10000).valid && (
                <Typography variant="caption" sx={{ color: 'warning.main' }}>
                  Moderate log count — monitor performance.
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Import/Export Settings */}
        <Card>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1.5, display: 'block', letterSpacing: '0.08em' }}>
              Backup & Restore
            </Typography>

            <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={handleExportSettings}
                  size="small"
                >
                  Export
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
                  size="small"
                >
                  Import
                </Button>

                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<ResetIcon />}
                  onClick={handleResetSettings}
                  size="small"
                >
                  Reset
                </Button>
              </Box>

              {importError && (
                <Typography variant="caption" sx={{ color: 'error.main' }}>{importError}</Typography>
              )}

              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Export settings to back them up, or import previously saved settings. Includes theme, connection preferences, and custom maps.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
