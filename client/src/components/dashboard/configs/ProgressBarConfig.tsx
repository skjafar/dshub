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
import { ProgressBarWidgetConfig, DataSource } from '../../../types/dashboard';
import AddressSelector, { AddressItem } from './AddressSelector';
import ColorPickerField from './ColorPickerField';

interface ProgressBarConfigProps {
  config: Partial<ProgressBarWidgetConfig>;
  onConfigChange: (updates: Partial<ProgressBarWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
}

export default function ProgressBarConfig({ config, onConfigChange, registers, parameters }: ProgressBarConfigProps): React.ReactElement {
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
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField
          label="Min"
          type="number"
          value={config.min ?? 0}
          onChange={(e) => onConfigChange({ ...config, min: parseFloat(e.target.value) })}
          margin="normal"
          sx={{ flex: 1 }}
        />
        <TextField
          label="Max"
          type="number"
          value={config.max ?? 100}
          onChange={(e) => onConfigChange({ ...config, max: parseFloat(e.target.value) })}
          margin="normal"
          sx={{ flex: 1 }}
        />
      </Box>
      <TextField
        fullWidth
        label="Unit (optional)"
        value={config.unit ?? ''}
        onChange={(e) => onConfigChange({ ...config, unit: e.target.value })}
        margin="normal"
      />
      <TextField
        fullWidth
        label="Refresh Interval (ms)"
        type="number"
        value={config.refreshInterval ?? 100}
        onChange={(e) => onConfigChange({ ...config, refreshInterval: parseInt(e.target.value) })}
        margin="normal"
      />
      <FormControl fullWidth margin="normal">
        <InputLabel>Orientation</InputLabel>
        <Select
          value={config.orientation ?? 'horizontal'}
          onChange={(e) => onConfigChange({ ...config, orientation: e.target.value as 'horizontal' | 'vertical' })}
          label="Orientation"
        >
          <MenuItem value="horizontal">Horizontal</MenuItem>
          <MenuItem value="vertical">Vertical</MenuItem>
        </Select>
      </FormControl>
      <FormControlLabel
        control={
          <Switch
            checked={config.showPercentage !== false}
            onChange={(e) => onConfigChange({ ...config, showPercentage: e.target.checked })}
          />
        }
        label="Show Percentage"
        sx={{ mt: 1 }}
      />
      <FormControlLabel
        control={
          <Switch
            checked={config.showValue !== false}
            onChange={(e) => onConfigChange({ ...config, showValue: e.target.checked })}
          />
        }
        label="Show Value"
      />
      <TextField
        fullWidth
        type="number"
        label="Value Font Size (rem, optional)"
        value={config.valueFontSize ?? ''}
        onChange={(e) => onConfigChange({ ...config, valueFontSize: e.target.value ? parseFloat(e.target.value) : undefined })}
        margin="normal"
        inputProps={{ min: 0.5, max: 3, step: 0.1 }}
        helperText="Value/percentage text size (default: 0.875)"
      />

      <Divider sx={{ my: 2 }} />

      {/* Color Ranges */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">Color Ranges</Typography>
        <Button
          startIcon={<AddIcon />}
          onClick={() => {
            const colorRanges = config.colorRanges ?? [];
            onConfigChange({
              ...config,
              colorRanges: [...colorRanges, { from: 0, to: 100, color: '#4ADE80' }]
            });
          }}
          size="small"
        >
          Add Range
        </Button>
      </Box>

      {(config.colorRanges ?? []).map((range, index) => (
        <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          <TextField
            label="From"
            type="number"
            value={range.from}
            onChange={(e) => {
              const colorRanges = [...(config.colorRanges ?? [])];
              colorRanges[index] = { ...colorRanges[index], from: parseFloat(e.target.value) };
              onConfigChange({ ...config, colorRanges });
            }}
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            label="To"
            type="number"
            value={range.to}
            onChange={(e) => {
              const colorRanges = [...(config.colorRanges ?? [])];
              colorRanges[index] = { ...colorRanges[index], to: parseFloat(e.target.value) };
              onConfigChange({ ...config, colorRanges });
            }}
            size="small"
            sx={{ flex: 1 }}
          />
          <ColorPickerField
            label="Color"
            value={range.color}
            onChange={(color) => {
              const colorRanges = [...(config.colorRanges ?? [])];
              colorRanges[index] = { ...colorRanges[index], color };
              onConfigChange({ ...config, colorRanges });
            }}
            size="small"
            sx={{ width: 120 }}
          />
          <IconButton
            onClick={() => {
              const colorRanges = (config.colorRanges ?? []).filter((_, i) => i !== index);
              onConfigChange({ ...config, colorRanges });
            }}
            size="small"
            color="error"
          >
            <DeleteIcon />
          </IconButton>
        </Box>
      ))}
    </>
  );
}
