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
import { ValueWriteWidgetConfig, DataSource } from '../../../types/dashboard';
import AddressSelector, { AddressItem } from './AddressSelector';

interface ValueWriteConfigProps {
  config: Partial<ValueWriteWidgetConfig>;
  onConfigChange: (updates: Partial<ValueWriteWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
}

export default function ValueWriteConfig({ config, onConfigChange, registers, parameters }: ValueWriteConfigProps): React.ReactElement {
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
        <InputLabel>Target</InputLabel>
        <Select
          value={config.target ?? 'register'}
          onChange={(e) => onConfigChange({ ...config, target: e.target.value as DataSource })}
          label="Target"
        >
          <MenuItem value="register">Register</MenuItem>
          <MenuItem value="parameter">Parameter</MenuItem>
        </Select>
      </FormControl>
      <AddressSelector
        dataSource={config.target ?? 'register'}
        currentAddress={config.address}
        onChange={(address) => onConfigChange({ ...config, address })}
        label={`${config.target === 'parameter' ? 'Parameter' : 'Register'} Address`}
        registers={registers}
        parameters={parameters}
      />
      <FormControl fullWidth margin="normal">
        <InputLabel>Input Type</InputLabel>
        <Select
          value={config.inputType ?? 'number'}
          onChange={(e) => onConfigChange({ ...config, inputType: e.target.value as 'number' | 'text' })}
          label="Input Type"
        >
          <MenuItem value="number">Number</MenuItem>
          <MenuItem value="text">Text</MenuItem>
        </Select>
      </FormControl>
      <TextField
        fullWidth
        type="number"
        label="Minimum Value (optional)"
        value={config.min ?? ''}
        onChange={(e) => onConfigChange({ ...config, min: e.target.value ? parseInt(e.target.value) : undefined })}
        margin="normal"
      />
      <TextField
        fullWidth
        type="number"
        label="Maximum Value (optional)"
        value={config.max ?? ''}
        onChange={(e) => onConfigChange({ ...config, max: e.target.value ? parseInt(e.target.value) : undefined })}
        margin="normal"
      />
      <TextField
        fullWidth
        type="number"
        label="Step (optional)"
        value={config.step ?? ''}
        onChange={(e) => onConfigChange({ ...config, step: e.target.value ? parseFloat(e.target.value) : undefined })}
        margin="normal"
        helperText="Increment step for the input (e.g., 0.1, 1, 10)"
      />
      <TextField
        fullWidth
        type="number"
        label="Value Font Size (rem, optional)"
        value={config.valueFontSize ?? ''}
        onChange={(e) => onConfigChange({ ...config, valueFontSize: e.target.value ? parseFloat(e.target.value) : undefined })}
        margin="normal"
        inputProps={{ min: 0.5, max: 5, step: 0.1 }}
        helperText="Input text size (default: 0.81)"
      />
      <FormControlLabel
        control={
          <Switch
            checked={config.confirmationRequired ?? false}
            onChange={(e) => onConfigChange({ ...config, confirmationRequired: e.target.checked })}
          />
        }
        label="Require Confirmation"
      />
    </>
  );
}
