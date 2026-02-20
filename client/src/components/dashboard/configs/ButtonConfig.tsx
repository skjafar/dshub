import React from 'react';
import {
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Switch,
  FormControlLabel
} from '@mui/material';
import { AVAILABLE_ICONS } from '../../../constants/widgetIcons';
import { ButtonWidgetConfig, DataSource } from '../../../types/dashboard';
import type { SysCommand } from '../../../types/settings';
import AddressSelector, { AddressItem } from './AddressSelector';
import SysCommandSelector from './SysCommandSelector';
import ColorPickerField from './ColorPickerField';

interface ButtonConfigProps {
  config: Partial<ButtonWidgetConfig>;
  onConfigChange: (updates: Partial<ButtonWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
  sysCommands: SysCommand[];
}

export default function ButtonConfig({ config, onConfigChange, registers, parameters, sysCommands }: ButtonConfigProps): React.ReactElement {
  return (
    <>
      <TextField
        fullWidth
        label="Button Label"
        value={config.label ?? ''}
        onChange={(e) => onConfigChange({ ...config, label: e.target.value })}
        margin="normal"
      />
      <FormControl fullWidth margin="normal">
        <InputLabel>Icon (optional)</InputLabel>
        <Select
          value={config.icon ?? ''}
          onChange={(e) => onConfigChange({ ...config, icon: e.target.value })}
          label="Icon (optional)"
          renderValue={(value) => {
            const icon = AVAILABLE_ICONS.find(i => i.value === value);
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {icon?.Icon && <icon.Icon fontSize="small" />}
                <span>{icon?.name ?? 'None'}</span>
              </Box>
            );
          }}
        >
          {AVAILABLE_ICONS.map((icon) => (
            <MenuItem key={icon.value} value={icon.value}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {icon.Icon && <icon.Icon fontSize="small" />}
                <span>{icon.name}</span>
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl fullWidth margin="normal">
        <InputLabel>Target</InputLabel>
        <Select
          value={config.target ?? 'register'}
          onChange={(e) => onConfigChange({ ...config, target: e.target.value as DataSource })}
          label="Target"
        >
          <MenuItem value="register">Register</MenuItem>
          <MenuItem value="parameter">Parameter</MenuItem>
          <MenuItem value="sysCommand">SYS_COMMAND</MenuItem>
        </Select>
      </FormControl>
      {config.target === 'sysCommand' ? (
        <SysCommandSelector
          value={config.address}
          onChange={(code) => onConfigChange({ ...config, address: code })}
          sysCommands={sysCommands}
        />
      ) : (
        <AddressSelector
          dataSource={config.target ?? 'register'}
          currentAddress={config.address}
          onChange={(address) => onConfigChange({ ...config, address })}
          label={`${config.target === 'parameter' ? 'Parameter' : 'Register'} Address`}
          registers={registers}
          parameters={parameters}
        />
      )}
      <TextField
        fullWidth
        type="number"
        label={config.target === 'sysCommand' ? 'Command Value (Optional)' : 'Value to Write'}
        value={config.valueToWrite ?? 0}
        onChange={(e) => onConfigChange({ ...config, valueToWrite: parseInt(e.target.value) })}
        margin="normal"
        helperText={config.target === 'sysCommand' ? 'Optional value parameter for the command' : undefined}
      />
      <ColorPickerField
        label="Button Color"
        value={config.color ?? ''}
        onChange={(color) => onConfigChange({ ...config, color })}
        fullWidth
        margin="normal"
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
      <TextField
        fullWidth
        type="number"
        label="Font Size (rem, optional)"
        value={config.fontSize ?? ''}
        onChange={(e) => onConfigChange({ ...config, fontSize: e.target.value ? parseFloat(e.target.value) : undefined })}
        margin="normal"
        inputProps={{ min: 0.5, max: 3, step: 0.1 }}
        helperText="Button text size (default: 1.0)"
      />
    </>
  );
}
