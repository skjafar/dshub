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
import { AddressItem } from './AddressSelector';

interface DirectionalControlConfigProps {
  config: Partial<DirectionalControlWidgetConfig>;
  onConfigChange: (updates: Partial<DirectionalControlWidgetConfig>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
}

export default function DirectionalControlConfig({ config, onConfigChange }: DirectionalControlConfigProps): React.ReactElement {
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
            <TextField
              label="Command"
              type="number"
              value={direction?.command ?? 0}
              onChange={(e) => updateDirection(dir, parseInt(e.target.value))}
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
            <TextField
              label="Command"
              type="number"
              value={direction?.command ?? 0}
              onChange={(e) => updateDirection(dir, parseInt(e.target.value))}
              size="small"
              sx={{ flex: 1 }}
            />
          </Box>
        );
      })}

      <TextField
        fullWidth
        label="Control Color (optional)"
        value={config.color ?? ''}
        onChange={(e) => onConfigChange({ ...config, color: e.target.value })}
        margin="normal"
        type="color"
      />
    </>
  );
}
