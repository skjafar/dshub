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
import { DropdownWidgetConfig, DataSource } from '../../../types/dashboard';
import AddressSelector, { AddressItem } from './AddressSelector';

interface DropdownConfigProps {
  config: Partial<DropdownWidgetConfig>;
  onConfigChange: (updates: Partial<DropdownWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
}

export default function DropdownConfig({ config, onConfigChange, registers, parameters }: DropdownConfigProps): React.ReactElement {
  const options = config.options ?? [];

  const addOption = () => {
    onConfigChange({
      ...config,
      options: [...options, { label: `Option ${options.length + 1}`, value: 0 }]
    });
  };

  const updateOption = (index: number, field: 'label' | 'value', value: string | number) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    onConfigChange({ ...config, options: newOptions });
  };

  const removeOption = (index: number) => {
    onConfigChange({
      ...config,
      options: options.filter((_, i) => i !== index)
    });
  };

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

      <Divider sx={{ my: 2 }} />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">Options</Typography>
        <Button startIcon={<AddIcon />} onClick={addOption} size="small">
          Add Option
        </Button>
      </Box>

      {options.map((option, index) => (
        <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <TextField
            label="Label"
            value={option.label}
            onChange={(e) => updateOption(index, 'label', e.target.value)}
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            label="Value"
            type="number"
            value={option.value}
            onChange={(e) => updateOption(index, 'value', parseInt(e.target.value))}
            size="small"
            sx={{ width: 100 }}
          />
          <IconButton onClick={() => removeOption(index)} size="small" color="error">
            <DeleteIcon />
          </IconButton>
        </Box>
      ))}

      <TextField
        fullWidth
        type="number"
        label="Value Font Size (rem, optional)"
        value={config.valueFontSize ?? ''}
        onChange={(e) => onConfigChange({ ...config, valueFontSize: e.target.value ? parseFloat(e.target.value) : undefined })}
        margin="normal"
        inputProps={{ min: 0.5, max: 5, step: 0.1 }}
        helperText="Select text size (default: 0.81)"
      />
      <FormControlLabel
        control={
          <Switch
            checked={config.confirmationRequired ?? false}
            onChange={(e) => onConfigChange({ ...config, confirmationRequired: e.target.checked })}
          />
        }
        label="Require Confirmation"
        sx={{ mt: 2 }}
      />
    </>
  );
}
