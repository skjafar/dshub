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
import { EncoderDisplayWidgetConfig, DataSource } from '../../../types/dashboard';
import AddressSelector, { AddressItem } from './AddressSelector';

interface EncoderDisplayConfigProps {
  config: Partial<EncoderDisplayWidgetConfig>;
  onConfigChange: (updates: Partial<EncoderDisplayWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
}

export default function EncoderDisplayConfig({ config, onConfigChange, registers, parameters }: EncoderDisplayConfigProps): React.ReactElement {
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
      <FormControl fullWidth margin="normal">
        <InputLabel>Conversion Source</InputLabel>
        <Select
          value={config.conversionSource ?? 'constant'}
          onChange={(e) => onConfigChange({ ...config, conversionSource: e.target.value as 'constant' | 'parameter' })}
          label="Conversion Source"
        >
          <MenuItem value="constant">Constant Factor</MenuItem>
          <MenuItem value="parameter">Parameter</MenuItem>
        </Select>
      </FormControl>
      {config.conversionSource === 'constant' && (
        <TextField
          fullWidth
          label="Conversion Factor"
          type="number"
          value={config.conversionFactor ?? 1}
          onChange={(e) => onConfigChange({ ...config, conversionFactor: parseFloat(e.target.value) })}
          margin="normal"
          helperText="Raw value will be divided by this factor"
        />
      )}
      {config.conversionSource === 'parameter' && (
        <AddressSelector
          dataSource="parameter"
          currentAddress={config.conversionAddress}
          onChange={(address) => onConfigChange({ ...config, conversionAddress: address })}
          label="Conversion Parameter Address"
          registers={registers}
          parameters={parameters}
        />
      )}
      <TextField
        fullWidth
        label="Primary Unit (optional)"
        value={config.primaryUnit ?? ''}
        onChange={(e) => onConfigChange({ ...config, primaryUnit: e.target.value })}
        margin="normal"
        placeholder="mm"
      />
      <TextField
        fullWidth
        label="Secondary Unit (optional)"
        value={config.secondaryUnit ?? ''}
        onChange={(e) => onConfigChange({ ...config, secondaryUnit: e.target.value })}
        margin="normal"
        placeholder="steps"
      />
      <TextField
        fullWidth
        label="Decimal Places"
        type="number"
        value={config.decimals ?? 3}
        onChange={(e) => onConfigChange({ ...config, decimals: parseInt(e.target.value) })}
        margin="normal"
        inputProps={{ min: 0, max: 10 }}
      />
      <TextField
        fullWidth
        label="Refresh Interval (ms)"
        type="number"
        value={config.refreshInterval ?? 50}
        onChange={(e) => onConfigChange({ ...config, refreshInterval: parseInt(e.target.value) })}
        margin="normal"
      />
      <TextField
        fullWidth
        label="Display Color"
        value={config.color ?? '#00F2FF'}
        onChange={(e) => onConfigChange({ ...config, color: e.target.value })}
        margin="normal"
        type="color"
      />
      <FormControlLabel
        control={
          <Switch
            checked={config.showRawValue !== false}
            onChange={(e) => onConfigChange({ ...config, showRawValue: e.target.checked })}
          />
        }
        label="Show Raw Value"
        sx={{ mt: 1 }}
      />
      <TextField
        fullWidth
        type="number"
        label="Value Font Size (rem, optional)"
        value={config.valueFontSize ?? ''}
        onChange={(e) => onConfigChange({ ...config, valueFontSize: e.target.value ? parseFloat(e.target.value) : undefined })}
        margin="normal"
        inputProps={{ min: 0.5, max: 5, step: 0.1 }}
        helperText="Primary value display size (default: 1.5)"
      />
    </>
  );
}
