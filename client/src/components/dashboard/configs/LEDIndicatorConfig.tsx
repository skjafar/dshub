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
  FormControlLabel
} from '@mui/material';
import { LEDIndicatorWidgetConfig, DataSource } from '../../../types/dashboard';
import AddressSelector, { AddressItem } from './AddressSelector';

interface LEDIndicatorConfigProps {
  config: Partial<LEDIndicatorWidgetConfig>;
  onConfigChange: (updates: Partial<LEDIndicatorWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
}

export default function LEDIndicatorConfig({ config, onConfigChange, registers, parameters }: LEDIndicatorConfigProps): React.ReactElement {
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
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField
          label="On Value"
          type="number"
          value={config.onValue ?? 1}
          onChange={(e) => onConfigChange({ ...config, onValue: parseInt(e.target.value) })}
          margin="normal"
          sx={{ flex: 1 }}
        />
        <TextField
          label="Off Value"
          type="number"
          value={config.offValue ?? 0}
          onChange={(e) => onConfigChange({ ...config, offValue: parseInt(e.target.value) })}
          margin="normal"
          sx={{ flex: 1 }}
        />
      </Box>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField
          label="On Label"
          value={config.onLabel ?? 'ON'}
          onChange={(e) => onConfigChange({ ...config, onLabel: e.target.value })}
          margin="normal"
          sx={{ flex: 1 }}
        />
        <TextField
          label="Off Label"
          value={config.offLabel ?? 'OFF'}
          onChange={(e) => onConfigChange({ ...config, offLabel: e.target.value })}
          margin="normal"
          sx={{ flex: 1 }}
        />
      </Box>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Box sx={{ flex: 1, mt: 2 }}>
          <Typography variant="caption" color="text.secondary">On Color</Typography>
          <TextField
            fullWidth
            value={config.onColor ?? '#4ADE80'}
            onChange={(e) => onConfigChange({ ...config, onColor: e.target.value })}
            type="color"
            size="small"
            sx={{ mt: 0.5 }}
          />
        </Box>
        <Box sx={{ flex: 1, mt: 2 }}>
          <Typography variant="caption" color="text.secondary">Off Color</Typography>
          <TextField
            fullWidth
            value={config.offColor ?? '#6B7280'}
            onChange={(e) => onConfigChange({ ...config, offColor: e.target.value })}
            type="color"
            size="small"
            sx={{ mt: 0.5 }}
          />
        </Box>
      </Box>
      <FormControlLabel
        control={
          <Switch
            checked={config.pulseWhenOn ?? false}
            onChange={(e) => onConfigChange({ ...config, pulseWhenOn: e.target.checked })}
          />
        }
        label="Pulse When On"
        sx={{ mt: 1 }}
      />
      <TextField
        fullWidth
        type="number"
        label="Label Font Size (rem, optional)"
        value={config.fontSize ?? ''}
        onChange={(e) => onConfigChange({ ...config, fontSize: e.target.value ? parseFloat(e.target.value) : undefined })}
        margin="normal"
        inputProps={{ min: 0.5, max: 3, step: 0.1 }}
        helperText="Status label text size (default: 0.75)"
      />
    </>
  );
}
