import React from 'react';
import {
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Divider
} from '@mui/material';
import { DirectionalControlWidgetConfig } from '../../../types/dashboard';
import type { SysCommand } from '../../../types/settings';
import { AddressItem } from './AddressSelector';
import SysCommandSelector from './SysCommandSelector';
import ColorPickerField from './ColorPickerField';

interface DirectionalControlConfigProps {
  config: Partial<DirectionalControlWidgetConfig>;
  onConfigChange: (updates: Partial<DirectionalControlWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
  sysCommands: SysCommand[];
}

export default function DirectionalControlConfig({ config, onConfigChange, sysCommands }: DirectionalControlConfigProps): React.ReactElement {
  const updateDirection = (dir: string, command: number) => {
    const directions = config.directions ?? [];
    const existingIndex = directions.findIndex(d => d.direction === dir);
    const newDirections = [...directions];
    if (existingIndex >= 0) {
      newDirections[existingIndex] = { ...newDirections[existingIndex], command };
    } else {
      newDirections.push({ direction: dir as DirectionalControlWidgetConfig['directions'][number]['direction'], command });
    }
    onConfigChange({ ...config, directions: newDirections });
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
        <InputLabel>Layout</InputLabel>
        <Select
          value={config.layout ?? '4way'}
          onChange={(e) => onConfigChange({ ...config, layout: e.target.value as '4way' | '8way' })}
          label="Layout"
        >
          <MenuItem value="4way">4-Way (Up/Down/Left/Right)</MenuItem>
          <MenuItem value="8way">8-Way (Includes Diagonals)</MenuItem>
        </Select>
      </FormControl>
      <TextField
        fullWidth
        label="Button Size (px)"
        type="number"
        value={config.buttonSize ?? 48}
        onChange={(e) => onConfigChange({ ...config, buttonSize: parseInt(e.target.value) })}
        margin="normal"
      />

      <Divider sx={{ my: 2 }} />

      {/* Direction Mappings */}
      <Typography variant="subtitle2" sx={{ mb: 2 }}>Direction Commands</Typography>

      {['up', 'down', 'left', 'right'].map((dir) => {
        const direction = config.directions?.find(d => d.direction === dir);
        return (
          <Box key={dir} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <Typography sx={{ width: 80, textTransform: 'capitalize' }}>{dir}:</Typography>
            <SysCommandSelector
              value={direction?.command ?? 0}
              onChange={(code) => updateDirection(dir, code)}
              sysCommands={sysCommands}
              label="Command"
              size="small"
              sx={{ flex: 1 }}
            />
          </Box>
        );
      })}

      {config.layout === '8way' && ['upLeft', 'upRight', 'downLeft', 'downRight'].map((dir) => {
        const direction = config.directions?.find(d => d.direction === dir);
        return (
          <Box key={dir} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <Typography sx={{ width: 80, textTransform: 'capitalize' }}>
              {dir.replace(/([A-Z])/g, ' $1').trim()}:
            </Typography>
            <SysCommandSelector
              value={direction?.command ?? 0}
              onChange={(code) => updateDirection(dir, code)}
              sysCommands={sysCommands}
              label="Command"
              size="small"
              sx={{ flex: 1 }}
            />
          </Box>
        );
      })}

      <ColorPickerField
        label="Control Color"
        value={config.color ?? ''}
        onChange={(color) => onConfigChange({ ...config, color })}
        fullWidth
        margin="normal"
      />
    </>
  );
}
