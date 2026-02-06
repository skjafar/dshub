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
import { StateLEDWidgetConfig, DataSource } from '../../../types/dashboard';
import AddressSelector, { AddressItem } from './AddressSelector';

interface StateLEDConfigProps {
  config: Partial<StateLEDWidgetConfig>;
  onConfigChange: (updates: Partial<StateLEDWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
}

export default function StateLEDConfig({ config, onConfigChange, registers, parameters }: StateLEDConfigProps): React.ReactElement {
  return (
    <>
      <TextField
        fullWidth
        label="Label"
        value={config.label ?? ''}
        onChange={(e) => onConfigChange({ ...config, label: e.target.value })}
        margin="normal"
      />
      <FormControl fullWidth margin="normal">
        <InputLabel>Source</InputLabel>
        <Select
          value={config.source ?? 'register'}
          onChange={(e) => onConfigChange({ ...config, source: e.target.value as DataSource })}
          label="Source"
        >
          <MenuItem value="register">Register</MenuItem>
          <MenuItem value="parameter">Parameter</MenuItem>
        </Select>
      </FormControl>
      <AddressSelector
        dataSource={config.source ?? 'register'}
        currentAddress={config.address}
        onChange={(address) => onConfigChange({ ...config, address })}
        registers={registers}
        parameters={parameters}
      />
      <TextField
        fullWidth
        label="Refresh Interval (ms)"
        type="number"
        value={config.refreshInterval ?? 100}
        onChange={(e) => onConfigChange({ ...config, refreshInterval: parseInt(e.target.value) })}
        margin="normal"
      />
      <FormControlLabel
        control={
          <Switch
            checked={config.showLabel !== false}
            onChange={(e) => onConfigChange({ ...config, showLabel: e.target.checked })}
          />
        }
        label="Show State Label"
        sx={{ mt: 1 }}
      />

      <Divider sx={{ my: 2 }} />

      {/* States Configuration */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">States</Typography>
        <Button
          startIcon={<AddIcon />}
          onClick={() => {
            const states = config.states ?? [];
            onConfigChange({
              ...config,
              states: [...states, { value: states.length, label: `State ${states.length}`, color: '#6B7280' }]
            });
          }}
          size="small"
        >
          Add State
        </Button>
      </Box>

      {(config.states ?? []).map((state, index) => (
        <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          <TextField
            label="Value"
            type="number"
            value={state.value}
            onChange={(e) => {
              const states = [...(config.states ?? [])];
              states[index] = { ...states[index], value: parseInt(e.target.value) };
              onConfigChange({ ...config, states });
            }}
            size="small"
            sx={{ width: 80 }}
          />
          <TextField
            label="Label"
            value={state.label}
            onChange={(e) => {
              const states = [...(config.states ?? [])];
              states[index] = { ...states[index], label: e.target.value };
              onConfigChange({ ...config, states });
            }}
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            label="Color"
            value={state.color}
            onChange={(e) => {
              const states = [...(config.states ?? [])];
              states[index] = { ...states[index], color: e.target.value };
              onConfigChange({ ...config, states });
            }}
            size="small"
            type="color"
            sx={{ width: 80 }}
          />
          <IconButton
            onClick={() => {
              const states = (config.states ?? []).filter((_, i) => i !== index);
              onConfigChange({ ...config, states });
            }}
            size="small"
            color="error"
          >
            <DeleteIcon />
          </IconButton>
        </Box>
      ))}

      <FormControlLabel
        control={
          <Switch
            checked={config.pulseAnimation ?? false}
            onChange={(e) => onConfigChange({ ...config, pulseAnimation: e.target.checked })}
          />
        }
        label="Enable Pulse Animation"
        sx={{ mt: 2 }}
      />

      {config.pulseAnimation && (
        <TextField
          fullWidth
          label="Pulse States (comma-separated values)"
          value={(config.pulseStates ?? []).join(', ')}
          onChange={(e) => {
            const pulseStates = e.target.value.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
            onConfigChange({ ...config, pulseStates });
          }}
          margin="normal"
          helperText="Which state values should pulse (e.g., 3, 5)"
        />
      )}
      <TextField
        fullWidth
        type="number"
        label="Label Font Size (rem, optional)"
        value={config.fontSize ?? ''}
        onChange={(e) => onConfigChange({ ...config, fontSize: e.target.value ? parseFloat(e.target.value) : undefined })}
        margin="normal"
        inputProps={{ min: 0.5, max: 3, step: 0.1 }}
        helperText="State label text size (default: 1.0)"
      />
    </>
  );
}
