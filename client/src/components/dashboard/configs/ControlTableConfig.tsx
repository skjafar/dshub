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
import { ControlTableWidgetConfig, DataSource } from '../../../types/dashboard';
import AddressSelector, { AddressItem } from './AddressSelector';
import { mapManager } from '../../../maps/mapManager';

interface ControlTableConfigProps {
  config: Partial<ControlTableWidgetConfig>;
  onConfigChange: (updates: Partial<ControlTableWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
}

export default function ControlTableConfig({ config, onConfigChange, registers, parameters }: ControlTableConfigProps): React.ReactElement {
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
              checked={config.compact ?? false}
              onChange={(e) => onConfigChange({ ...config, compact: e.target.checked })}
            />
          }
          label="Compact"
        />
        <FormControlLabel
          control={
            <Switch
              checked={config.confirmWrites ?? false}
              onChange={(e) => onConfigChange({ ...config, confirmWrites: e.target.checked })}
            />
          }
          label="Confirm Writes"
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

      {/* Rows */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">Table Rows</Typography>
        <Button
          startIcon={<AddIcon />}
          onClick={() => {
            const rows = config.rows ?? [];
            onConfigChange({
              ...config,
              rows: [...rows, { label: 'Value', source: 'register' as DataSource, address: 0 }]
            });
          }}
          size="small"
        >
          Add Row
        </Button>
      </Box>

      {(config.rows ?? []).map((row, index) => {
        // Auto-detect writability from the data map
        const isWritable = row.source === 'parameter'
          || mapManager.getRegisterByAddress(row.address)?.accessPermit === 'READ_WRITE';

        return (
          <Box key={index} sx={{ mb: 2, p: 2, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1 }}>
            {/* Row 1: Label + Access badge + Delete */}
            <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
              <TextField
                label="Label"
                value={row.label}
                onChange={(e) => {
                  const rows = [...(config.rows ?? [])];
                  rows[index] = { ...rows[index], label: e.target.value };
                  onConfigChange({ ...config, rows });
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
                  const rows = (config.rows ?? []).filter((_, i) => i !== index);
                  onConfigChange({ ...config, rows });
                }}
                size="small"
                color="error"
              >
                <DeleteIcon />
              </IconButton>
            </Box>

            {/* Row 2: Source + Address (searchable) + Unit */}
            <Box sx={{ display: 'flex', gap: 1, mb: isWritable ? 1 : 0, alignItems: 'flex-start' }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Source</InputLabel>
                <Select
                  value={row.source}
                  onChange={(e) => {
                    const rows = [...(config.rows ?? [])];
                    rows[index] = { ...rows[index], source: e.target.value as DataSource };
                    onConfigChange({ ...config, rows });
                  }}
                  label="Source"
                >
                  <MenuItem value="register">Register</MenuItem>
                  <MenuItem value="parameter">Parameter</MenuItem>
                </Select>
              </FormControl>
              <Box sx={{ flex: 2 }}>
                <AddressSelector
                  dataSource={row.source}
                  currentAddress={row.address}
                  onChange={(address) => {
                    const rows = [...(config.rows ?? [])];
                    rows[index] = { ...rows[index], address };
                    onConfigChange({ ...config, rows });
                  }}
                  registers={registers}
                  parameters={parameters}
                  label="Address"
                  size="small"
                />
              </Box>
              <TextField
                label="Unit"
                value={row.unit ?? ''}
                onChange={(e) => {
                  const rows = [...(config.rows ?? [])];
                  rows[index] = { ...rows[index], unit: e.target.value };
                  onConfigChange({ ...config, rows });
                }}
                size="small"
                sx={{ flex: 1 }}
              />
            </Box>

            {/* Row 3: Format (only for writable addresses) */}
            {isWritable && (
              <FormControl size="small" fullWidth>
                <InputLabel>Input Format</InputLabel>
                <Select
                  value={row.format ?? 'decimal'}
                  onChange={(e) => {
                    const rows = [...(config.rows ?? [])];
                    rows[index] = { ...rows[index], format: e.target.value as 'decimal' | 'hex' | 'binary' };
                    onConfigChange({ ...config, rows });
                  }}
                  label="Input Format"
                >
                  <MenuItem value="decimal">Decimal</MenuItem>
                  <MenuItem value="hex">Hexadecimal</MenuItem>
                  <MenuItem value="binary">Binary</MenuItem>
                </Select>
              </FormControl>
            )}

            {/* Row 4: Min/Max/Step (only for writable addresses) */}
            {isWritable && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  label="Min"
                  type="number"
                  value={row.min ?? ''}
                  onChange={(e) => {
                    const rows = [...(config.rows ?? [])];
                    rows[index] = { ...rows[index], min: e.target.value ? parseFloat(e.target.value) : undefined };
                    onConfigChange({ ...config, rows });
                  }}
                  size="small"
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Max"
                  type="number"
                  value={row.max ?? ''}
                  onChange={(e) => {
                    const rows = [...(config.rows ?? [])];
                    rows[index] = { ...rows[index], max: e.target.value ? parseFloat(e.target.value) : undefined };
                    onConfigChange({ ...config, rows });
                  }}
                  size="small"
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Step"
                  type="number"
                  value={row.step ?? ''}
                  onChange={(e) => {
                    const rows = [...(config.rows ?? [])];
                    rows[index] = { ...rows[index], step: e.target.value ? parseFloat(e.target.value) : undefined };
                    onConfigChange({ ...config, rows });
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
