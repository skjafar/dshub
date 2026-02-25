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
import AddressSelector, { AddressItem } from './AddressSelector';
import { mapManager } from '../../../maps/mapManager';

interface DataTableConfigProps {
  config: Partial<DataTableWidgetConfig>;
  onConfigChange: (updates: Partial<DataTableWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
}

export default function DataTableConfig({ config, onConfigChange, registers, parameters }: DataTableConfigProps): React.ReactElement {
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
      <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
        <FormControlLabel
          control={
            <Switch
              checked={config.confirmWrites ?? false}
              onChange={(e) => onConfigChange({ ...config, confirmWrites: e.target.checked })}
            />
          }
          label="Confirm Writes"
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

      {(config.items ?? []).map((item, index) => {
        const isWritable = item.source === 'parameter'
          || mapManager.getRegisterByAddress(item.address)?.accessPermit === 'READ_WRITE';

        return (
          <Box key={index} sx={{ mb: 2, p: 2, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1 }}>
            {/* Row 1: Label + R/O|R/W badge + Delete */}
            <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
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
              <Typography
                variant="caption"
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: 0.5,
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                  color: isWritable ? 'success.main' : 'text.disabled',
                  border: '1px solid',
                  borderColor: isWritable ? 'success.main' : 'divider',
                }}
              >
                {isWritable ? 'R/W' : 'R/O'}
              </Typography>
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

            {/* Row 2: Source + Address (searchable) + Unit */}
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
            </Box>

            {/* Row 3: Format + Decimals (decimals only for decimal format) */}
            <Box sx={{ display: 'flex', gap: 1, mb: isWritable ? 1 : 0 }}>
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
              {(item.format ?? 'decimal') === 'decimal' && (
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
                  sx={{ width: 100 }}
                  inputProps={{ min: 0, max: 10 }}
                />
              )}
            </Box>

            {/* Row 4: Min/Max/Step — only for writable addresses */}
            {isWritable && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  label="Min"
                  type="number"
                  value={item.min ?? ''}
                  onChange={(e) => {
                    const items = [...(config.items ?? [])];
                    items[index] = { ...items[index], min: e.target.value ? parseFloat(e.target.value) : undefined };
                    onConfigChange({ ...config, items });
                  }}
                  size="small"
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Max"
                  type="number"
                  value={item.max ?? ''}
                  onChange={(e) => {
                    const items = [...(config.items ?? [])];
                    items[index] = { ...items[index], max: e.target.value ? parseFloat(e.target.value) : undefined };
                    onConfigChange({ ...config, items });
                  }}
                  size="small"
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Step"
                  type="number"
                  value={item.step ?? ''}
                  onChange={(e) => {
                    const items = [...(config.items ?? [])];
                    items[index] = { ...items[index], step: e.target.value ? parseFloat(e.target.value) : undefined };
                    onConfigChange({ ...config, items });
                  }}
                  size="small"
                  sx={{ flex: 1 }}
                />
              </Box>
            )}
          </Box>
        );
      })}
    </>
  );
}
