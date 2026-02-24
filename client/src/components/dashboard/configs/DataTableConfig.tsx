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
import { DataTableWidgetConfig, DataSource } from '../../../types/dashboard';
import { AddressItem } from './AddressSelector';

interface DataTableConfigProps {
  config: Partial<DataTableWidgetConfig>;
  onConfigChange: (updates: Partial<DataTableWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
}

export default function DataTableConfig({ config, onConfigChange }: DataTableConfigProps): React.ReactElement {
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
        value={config.refreshInterval ?? 1000}
        onChange={(e) => onConfigChange({ ...config, refreshInterval: parseInt(e.target.value) })}
        margin="normal"
      />
      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
        <FormControlLabel
          control={
            <Switch
              checked={config.showTimestamp ?? false}
              onChange={(e) => onConfigChange({ ...config, showTimestamp: e.target.checked })}
            />
          }
          label="Show Timestamp"
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
        <FormControlLabel
          control={
            <Switch
              checked={config.striped ?? false}
              onChange={(e) => onConfigChange({ ...config, striped: e.target.checked })}
            />
          }
          label="Striped Rows"
        />
      </Box>
      <TextField
        fullWidth
        type="number"
        label="Value Font Size (rem, optional)"
        value={config.valueFontSize ?? ''}
        onChange={(e) => onConfigChange({ ...config, valueFontSize: e.target.value ? parseFloat(e.target.value) : undefined })}
        margin="normal"
        inputProps={{ min: 0.5, max: 2, step: 0.05 }}
        helperText="Value text size (default: 0.75)"
      />

      <Divider sx={{ my: 2 }} />

      {/* Table Rows */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">Table Rows</Typography>
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
          Add Row
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
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
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
            <TextField
              label="Address"
              type="number"
              value={item.address}
              onChange={(e) => {
                const items = [...(config.items ?? [])];
                items[index] = { ...items[index], address: parseInt(e.target.value) };
                onConfigChange({ ...config, items });
              }}
              size="small"
              sx={{ flex: 1 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Format</InputLabel>
              <Select
                value={item.format ?? 'decimal'}
                onChange={(e) => {
                  const items = [...(config.items ?? [])];
                  items[index] = { ...items[index], format: e.target.value as 'decimal' | 'hex' | 'binary' };
                  onConfigChange({ ...config, items });
                }}
                label="Format"
              >
                <MenuItem value="decimal">Decimal</MenuItem>
                <MenuItem value="hex">Hexadecimal</MenuItem>
                <MenuItem value="binary">Binary</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Unit"
              value={item.unit ?? ''}
              onChange={(e) => {
                const items = [...(config.items ?? [])];
                items[index] = { ...items[index], unit: e.target.value };
                onConfigChange({ ...config, items });
              }}
              size="small"
              sx={{ flex: 1 }}
            />
            <TextField
              label="Decimals"
              type="number"
              value={item.decimals ?? ''}
              onChange={(e) => {
                const items = [...(config.items ?? [])];
                items[index] = { ...items[index], decimals: e.target.value ? parseInt(e.target.value) : undefined };
                onConfigChange({ ...config, items });
              }}
              size="small"
              sx={{ width: 80 }}
              inputProps={{ min: 0, max: 10 }}
            />
          </Box>
        </Box>
      ))}
    </>
  );
}
