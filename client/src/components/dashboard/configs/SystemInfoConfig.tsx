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
import { SystemInfoWidgetConfig, DataSource } from '../../../types/dashboard';
import AddressSelector, { AddressItem } from './AddressSelector';
import ColorPickerField from './ColorPickerField';

interface SystemInfoConfigProps {
  config: Partial<SystemInfoWidgetConfig>;
  onConfigChange: (updates: Partial<SystemInfoWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
  systemRegisters: AddressItem[];
}

export default function SystemInfoConfig({ config, onConfigChange, registers, parameters, systemRegisters }: SystemInfoConfigProps): React.ReactElement {
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
        <InputLabel>Layout</InputLabel>
        <Select
          value={config.layout ?? 'vertical'}
          onChange={(e) => onConfigChange({ ...config, layout: e.target.value as 'vertical' | 'horizontal' | 'grid' })}
          label="Layout"
        >
          <MenuItem value="vertical">Vertical</MenuItem>
          <MenuItem value="horizontal">Horizontal</MenuItem>
          <MenuItem value="grid">Grid</MenuItem>
        </Select>
      </FormControl>
      <TextField
        fullWidth
        label="Refresh Interval (ms)"
        type="number"
        value={config.refreshInterval ?? 1000}
        onChange={(e) => onConfigChange({ ...config, refreshInterval: parseInt(e.target.value) })}
        margin="normal"
      />
      <FormControlLabel
        control={
          <Switch
            checked={config.compact ?? false}
            onChange={(e) => onConfigChange({ ...config, compact: e.target.checked })}
          />
        }
        label="Compact Mode"
        sx={{ mt: 1 }}
      />
      <TextField
        fullWidth
        type="number"
        label="Value Font Size (rem, optional)"
        value={config.valueFontSize ?? ''}
        onChange={(e) => onConfigChange({ ...config, valueFontSize: e.target.value ? parseFloat(e.target.value) : undefined })}
        margin="normal"
        inputProps={{ min: 0.5, max: 3, step: 0.1 }}
        helperText="Item value text size (default: 0.9)"
      />

      <Divider sx={{ my: 2 }} />

      {/* Items Configuration */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">Info Items</Typography>
        <Button
          startIcon={<AddIcon />}
          onClick={() => {
            const items = config.items ?? [];
            onConfigChange({
              ...config,
              items: [...items, { label: 'Item', source: 'register' as DataSource, address: 0, format: 'decimal' as const }]
            });
          }}
          size="small"
        >
          Add Item
        </Button>
      </Box>

      {(config.items ?? []).map((item, index) => (
        <Box key={index} sx={{ mb: 2, p: 2, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              label="Label"
              value={item.label}
              onChange={(e) => {
                const items = [...(config.items ?? [])];
                items[index] = { ...items[index], label: e.target.value };
                onConfigChange({ ...config, items });
              }}
              size="small"
              sx={{ flex: 1 }}
            />
            <IconButton
              onClick={() => {
                const items = (config.items ?? []).filter((_, i) => i !== index);
                onConfigChange({ ...config, items });
              }}
              size="small"
              color="error"
            >
              <DeleteIcon />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start' }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Source</InputLabel>
              <Select
                value={item.source}
                onChange={(e) => {
                  const items = [...(config.items ?? [])];
                  items[index] = { ...items[index], source: e.target.value as DataSource };
                  onConfigChange({ ...config, items });
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
                dataSource={item.source}
                currentAddress={item.address}
                onChange={(address) => {
                  const items = [...(config.items ?? [])];
                  items[index] = { ...items[index], address };
                  onConfigChange({ ...config, items });
                }}
                registers={registers}
                parameters={parameters}
                systemRegisters={systemRegisters}
                label="Address"
                size="small"
              />
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Format</InputLabel>
              <Select
                value={item.format ?? 'decimal'}
                onChange={(e) => {
                  const items = [...(config.items ?? [])];
                  items[index] = { ...items[index], format: e.target.value as 'decimal' | 'hex' | 'binary' | 'time' };
                  onConfigChange({ ...config, items });
                }}
                label="Format"
              >
                <MenuItem value="decimal">Decimal</MenuItem>
                <MenuItem value="hex">Hexadecimal</MenuItem>
                <MenuItem value="binary">Binary</MenuItem>
                <MenuItem value="time">Time (HH:MM:SS)</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Unit (optional)"
              value={item.unit ?? ''}
              onChange={(e) => {
                const items = [...(config.items ?? [])];
                items[index] = { ...items[index], unit: e.target.value };
                onConfigChange({ ...config, items });
              }}
              size="small"
              sx={{ flex: 1 }}
            />
            <ColorPickerField
              label="Color"
              value={item.color ?? '#00F2FF'}
              onChange={(color) => {
                const items = [...(config.items ?? [])];
                items[index] = { ...items[index], color };
                onConfigChange({ ...config, items });
              }}
              size="small"
              sx={{ width: 120 }}
            />
          </Box>
        </Box>
      ))}
    </>
  );
}
