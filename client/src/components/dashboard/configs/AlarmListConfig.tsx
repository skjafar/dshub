import React from 'react';
import {
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Switch,
  FormControlLabel,
  IconButton,
  Divider,
  Button
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { AlarmListWidgetConfig, AlarmRule, DataSource } from '../../../types/dashboard';
import AddressSelector, { AddressItem } from './AddressSelector';

interface AlarmListConfigProps {
  config: Partial<AlarmListWidgetConfig>;
  onConfigChange: (updates: Partial<AlarmListWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
  systemRegisters: AddressItem[];
}

export default function AlarmListConfig({ config, onConfigChange, registers, parameters, systemRegisters }: AlarmListConfigProps): React.ReactElement {
  return (
    <>
      <TextField
        fullWidth
        label="Label"
        value={config.label ?? ''}
        onChange={(e) => onConfigChange({ ...config, label: e.target.value })}
        margin="normal"
      />
      <TextField
        fullWidth
        label="Refresh Interval (ms)"
        type="number"
        value={config.refreshInterval ?? 1000}
        onChange={(e) => onConfigChange({ ...config, refreshInterval: parseInt(e.target.value) })}
        margin="normal"
      />
      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
        <FormControlLabel
          control={
            <Switch
              checked={config.showInactive ?? false}
              onChange={(e) => onConfigChange({ ...config, showInactive: e.target.checked })}
            />
          }
          label="Show Inactive"
        />
        <FormControlLabel
          control={
            <Switch
              checked={config.compact ?? false}
              onChange={(e) => onConfigChange({ ...config, compact: e.target.checked })}
            />
          }
          label="Compact"
        />
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Alarm Rules */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">Alarm Rules</Typography>
        <Button
          startIcon={<AddIcon />}
          onClick={() => {
            const alarms = config.alarms ?? [];
            onConfigChange({
              ...config,
              alarms: [...alarms, {
                label: 'Alarm',
                source: 'register' as DataSource,
                address: 0,
                type: 'threshold',
                severity: 'warning',
              } as AlarmRule]
            });
          }}
          size="small"
        >
          Add Alarm
        </Button>
      </Box>

      {(config.alarms ?? []).map((alarm, index) => (
        <Box key={index} sx={{ mb: 2, p: 2, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1 }}>
          {/* Row 1: Label + Delete */}
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              label="Label"
              value={alarm.label}
              onChange={(e) => {
                const alarms = [...(config.alarms ?? [])];
                alarms[index] = { ...alarms[index], label: e.target.value };
                onConfigChange({ ...config, alarms });
              }}
              size="small"
              sx={{ flex: 1 }}
            />
            <IconButton
              onClick={() => {
                const alarms = (config.alarms ?? []).filter((_, i) => i !== index);
                onConfigChange({ ...config, alarms });
              }}
              size="small"
              color="error"
            >
              <DeleteIcon />
            </IconButton>
          </Box>

          {/* Row 2: Source + Address (searchable) */}
          <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start' }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Source</InputLabel>
              <Select
                value={alarm.source}
                onChange={(e) => {
                  const alarms = [...(config.alarms ?? [])];
                  alarms[index] = { ...alarms[index], source: e.target.value as DataSource };
                  onConfigChange({ ...config, alarms });
                }}
                label="Source"
              >
                <MenuItem value="register">Register</MenuItem>
                <MenuItem value="parameter">Parameter</MenuItem>
                <MenuItem value="sysRegister">System Register</MenuItem>
              </Select>
            </FormControl>
            <Box sx={{ flex: 2 }}>
              <AddressSelector
                dataSource={alarm.source}
                currentAddress={alarm.address}
                onChange={(address) => {
                  const alarms = [...(config.alarms ?? [])];
                  alarms[index] = { ...alarms[index], address };
                  onConfigChange({ ...config, alarms });
                }}
                registers={registers}
                parameters={parameters}
                systemRegisters={systemRegisters}
                label="Address"
                size="small"
              />
            </Box>
          </Box>

          {/* Row 3: Type + Severity */}
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Type</InputLabel>
              <Select
                value={alarm.type}
                onChange={(e) => {
                  const alarms = [...(config.alarms ?? [])];
                  alarms[index] = { ...alarms[index], type: e.target.value as 'threshold' | 'state' };
                  onConfigChange({ ...config, alarms });
                }}
                label="Type"
              >
                <MenuItem value="threshold">Threshold</MenuItem>
                <MenuItem value="state">State Match</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Severity</InputLabel>
              <Select
                value={alarm.severity}
                onChange={(e) => {
                  const alarms = [...(config.alarms ?? [])];
                  alarms[index] = { ...alarms[index], severity: e.target.value as 'warning' | 'critical' };
                  onConfigChange({ ...config, alarms });
                }}
                label="Severity"
              >
                <MenuItem value="warning">Warning</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Row 4: Threshold or State fields */}
          {alarm.type === 'threshold' ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                label="Min"
                type="number"
                value={alarm.min ?? ''}
                onChange={(e) => {
                  const alarms = [...(config.alarms ?? [])];
                  alarms[index] = { ...alarms[index], min: e.target.value ? parseFloat(e.target.value) : undefined };
                  onConfigChange({ ...config, alarms });
                }}
                size="small"
                sx={{ flex: 1 }}
                helperText="Below this = alarm"
              />
              <TextField
                label="Max"
                type="number"
                value={alarm.max ?? ''}
                onChange={(e) => {
                  const alarms = [...(config.alarms ?? [])];
                  alarms[index] = { ...alarms[index], max: e.target.value ? parseFloat(e.target.value) : undefined };
                  onConfigChange({ ...config, alarms });
                }}
                size="small"
                sx={{ flex: 1 }}
                helperText="Above this = alarm"
              />
            </Box>
          ) : (
            <TextField
              label="Trigger Values"
              value={(alarm.triggerValues ?? []).join(', ')}
              onChange={(e) => {
                const alarms = [...(config.alarms ?? [])];
                const values = e.target.value
                  .split(',')
                  .map(s => s.trim())
                  .filter(s => s !== '')
                  .map(Number)
                  .filter(n => !isNaN(n));
                alarms[index] = { ...alarms[index], triggerValues: values };
                onConfigChange({ ...config, alarms });
              }}
              size="small"
              fullWidth
              helperText="Comma-separated values that trigger alarm (e.g., 3, 5, 7)"
            />
          )}
        </Box>
      ))}
    </>
  );
}
