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
import { MiniPlotWidgetConfig, DataSource } from '../../../types/dashboard';
import AddressSelector, { AddressItem } from './AddressSelector';
import ColorPickerField from './ColorPickerField';

interface MiniPlotConfigProps {
  config: Partial<MiniPlotWidgetConfig>;
  onConfigChange: (updates: Partial<MiniPlotWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
}

export default function MiniPlotConfig({ config, onConfigChange, registers, parameters }: MiniPlotConfigProps): React.ReactElement {
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
      <TextField
        fullWidth
        type="number"
        label="Time Window (seconds)"
        value={config.timeWindow ?? 60}
        onChange={(e) => onConfigChange({ ...config, timeWindow: parseInt(e.target.value) })}
        margin="normal"
      />
      <TextField
        fullWidth
        type="number"
        label="Poll Interval (ms)"
        value={config.pollInterval ?? 250}
        onChange={(e) => onConfigChange({ ...config, pollInterval: parseInt(e.target.value) })}
        margin="normal"
      />
      <ColorPickerField
        label="Line Color"
        value={config.color ?? ''}
        onChange={(color) => onConfigChange({ ...config, color })}
        fullWidth
        margin="normal"
      />
      <FormControlLabel
        control={
          <Switch
            checked={config.showLegend ?? false}
            onChange={(e) => onConfigChange({ ...config, showLegend: e.target.checked })}
          />
        }
        label="Show Legend"
      />
    </>
  );
}
