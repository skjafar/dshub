import React from 'react';
import {
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel
} from '@mui/material';
import { ValueReadWidgetConfig, DataSource, DisplayFormat } from '../../../types/dashboard';
import AddressSelector, { AddressItem } from './AddressSelector';

interface ValueReadConfigProps {
  config: Partial<ValueReadWidgetConfig>;
  onConfigChange: (updates: Partial<ValueReadWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
}

export default function ValueReadConfig({ config, onConfigChange, registers, parameters }: ValueReadConfigProps): React.ReactElement {
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
        label={`${config.source === 'parameter' ? 'Parameter' : 'Register'} Address`}
        registers={registers}
        parameters={parameters}
      />
      <FormControl fullWidth margin="normal">
        <InputLabel>Display Format</InputLabel>
        <Select
          value={config.displayFormat ?? 'decimal'}
          onChange={(e) => onConfigChange({ ...config, displayFormat: e.target.value as DisplayFormat })}
          label="Display Format"
        >
          <MenuItem value="decimal">Decimal</MenuItem>
          <MenuItem value="hex">Hexadecimal</MenuItem>
          <MenuItem value="binary">Binary</MenuItem>
        </Select>
      </FormControl>
      <TextField
        fullWidth
        type="number"
        label="Refresh Interval (ms)"
        value={config.refreshInterval ?? 1000}
        onChange={(e) => onConfigChange({ ...config, refreshInterval: parseInt(e.target.value) })}
        margin="normal"
      />
      <TextField
        fullWidth
        label="Unit (optional)"
        value={config.unit ?? ''}
        onChange={(e) => onConfigChange({ ...config, unit: e.target.value })}
        margin="normal"
        placeholder="°C, V, A, etc."
      />
      <FormControlLabel
        control={
          <Switch
            checked={config.showTimestamp ?? false}
            onChange={(e) => onConfigChange({ ...config, showTimestamp: e.target.checked })}
          />
        }
        label="Show Timestamp"
      />
      <TextField
        fullWidth
        type="number"
        label="Value Font Size (rem, optional)"
        value={config.valueFontSize ?? ''}
        onChange={(e) => onConfigChange({ ...config, valueFontSize: e.target.value ? parseFloat(e.target.value) : undefined })}
        margin="normal"
        inputProps={{ min: 0.5, max: 5, step: 0.1 }}
        helperText="Main value display size (default: ~2.1)"
      />
    </>
  );
}
