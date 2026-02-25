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
import { StatusMatrixWidgetConfig, DataSource } from '../../../types/dashboard';
import AddressSelector, { AddressItem } from './AddressSelector';
import ColorPickerField from './ColorPickerField';

interface StatusMatrixConfigProps {
  config: Partial<StatusMatrixWidgetConfig>;
  onConfigChange: (updates: Partial<StatusMatrixWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
}

export default function StatusMatrixConfig({ config, onConfigChange, registers, parameters }: StatusMatrixConfigProps): React.ReactElement {
  return (
    <>
      <TextField
        fullWidth
        label="Label"
        value={config.label ?? ''}
        onChange={(e) => onConfigChange({ ...config, label: e.target.value })}
        margin="normal"
      />
      <TextField
        fullWidth
        label="Refresh Interval (ms)"
        type="number"
        value={config.refreshInterval ?? 500}
        onChange={(e) => onConfigChange({ ...config, refreshInterval: parseInt(e.target.value) })}
        margin="normal"
      />
      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
        <FormControlLabel
          control={
            <Switch
              checked={config.showLabels !== false}
              onChange={(e) => onConfigChange({ ...config, showLabels: e.target.checked })}
            />
          }
          label="Show Labels"
        />
        <FormControlLabel
          control={
            <Switch
              checked={config.compact ?? false}
              onChange={(e) => onConfigChange({ ...config, compact: e.target.checked })}
            />
          }
          label="Compact"
        />
      </Box>
      <TextField
        fullWidth
        type="number"
        label="Dot Size (px)"
        value={config.dotSize ?? 12}
        onChange={(e) => onConfigChange({ ...config, dotSize: parseInt(e.target.value) })}
        margin="normal"
        inputProps={{ min: 6, max: 24, step: 2 }}
      />

      <Divider sx={{ my: 2 }} />

      {/* Status Items */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">Status Items</Typography>
        <Button
          startIcon={<AddIcon />}
          onClick={() => {
            const items = config.items ?? [];
            onConfigChange({
              ...config,
              items: [...items, {
                label: 'Status',
                source: 'register' as DataSource,
                address: 0,
                onValue: 1,
                onColor: '#4ADE80',
                offColor: '#6B7280',
              }]
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
                label="Address"
                size="small"
              />
            </Box>
            <TextField
              label="On Value"
              type="number"
              value={item.onValue ?? 1}
              onChange={(e) => {
                const items = [...(config.items ?? [])];
                items[index] = { ...items[index], onValue: parseInt(e.target.value) };
                onConfigChange({ ...config, items });
              }}
              size="small"
              sx={{ width: 80 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <ColorPickerField
              label="On Color"
              value={item.onColor ?? '#4ADE80'}
              onChange={(color) => {
                const items = [...(config.items ?? [])];
                items[index] = { ...items[index], onColor: color };
                onConfigChange({ ...config, items });
              }}
              size="small"
              sx={{ flex: 1 }}
            />
            <ColorPickerField
              label="Off Color"
              value={item.offColor ?? '#6B7280'}
              onChange={(color) => {
                const items = [...(config.items ?? [])];
                items[index] = { ...items[index], offColor: color };
                onConfigChange({ ...config, items });
              }}
              size="small"
              sx={{ flex: 1 }}
            />
          </Box>
        </Box>
      ))}
    </>
  );
}
