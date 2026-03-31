import React from 'react';
import { Box, Button, Slider, TextField, Typography } from '@mui/material';
import { ContainerWidgetConfig } from '../../../types/dashboard';
import ColorPickerField from './ColorPickerField';

interface ContainerConfigProps {
  config: Partial<ContainerWidgetConfig>;
  onConfigChange: (updates: Partial<ContainerWidgetConfig>) => void;
}

export default function ContainerConfig({ config, onConfigChange }: ContainerConfigProps): React.ReactElement {
  return (
    <>
      <TextField
        label="Label"
        value={config.label ?? ''}
        onChange={(e) => onConfigChange({ ...config, label: e.target.value || undefined })}
        fullWidth
        margin="normal"
        size="small"
        placeholder="e.g. Motor Control"
        helperText="Optional — displayed in the corner of the container"
      />
      <Box sx={{ mt: 1, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <ColorPickerField
            label="Background Color"
            value={config.backgroundColor ?? ''}
            onChange={(color) => onConfigChange({ ...config, backgroundColor: color || undefined })}
            fullWidth
            margin="normal"
          />
        </Box>
        {config.backgroundColor && (
          <Button
            size="small"
            sx={{ mb: 1, whiteSpace: 'nowrap' }}
            onClick={() => onConfigChange({ ...config, backgroundColor: undefined })}
          >
            Clear
          </Button>
        )}
      </Box>
      <Box sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Inner Padding: {config.padding ?? 8}px
        </Typography>
        <Slider
          value={config.padding ?? 8}
          onChange={(_, v) => onConfigChange({ ...config, padding: v as number })}
          min={0}
          max={32}
          step={2}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}px`}
          size="small"
        />
      </Box>
      <Box sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Widget Spacing: {config.spacing ?? 0}px
        </Typography>
        <Slider
          value={config.spacing ?? 0}
          onChange={(_, v) => onConfigChange({ ...config, spacing: v as number })}
          min={0}
          max={20}
          step={2}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}px`}
          size="small"
        />
      </Box>
    </>
  );
}
