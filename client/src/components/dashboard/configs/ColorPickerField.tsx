import React, { useState, useRef } from 'react';
import { Box, Popover, TextField, IconButton, InputAdornment } from '@mui/material';
import { Palette as PaletteIcon } from '@mui/icons-material';
import { HexColorPicker } from 'react-colorful';

interface ColorPickerFieldProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  sx?: Record<string, unknown>;
  margin?: 'none' | 'dense' | 'normal';
}

export default function ColorPickerField({
  label,
  value,
  onChange,
  size = 'small',
  fullWidth = false,
  sx,
  margin = 'none',
}: ColorPickerFieldProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <TextField
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        size={size}
        fullWidth={fullWidth}
        margin={margin}
        sx={sx}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Box
                  sx={{
                    width: 16,
                    height: 16,
                    borderRadius: '3px',
                    backgroundColor: value || '#000',
                    border: '1px solid rgba(255,255,255,0.2)',
                    flexShrink: 0,
                  }}
                />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  ref={anchorRef}
                  onClick={() => setOpen(true)}
                  size="small"
                  edge="end"
                  sx={{ p: 0.5 }}
                >
                  <PaletteIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{
          paper: {
            sx: {
              p: 1.5,
              borderRadius: '6px',
              backgroundColor: 'background.paper',
              '& .react-colorful': {
                width: 200,
                height: 160,
              },
              '& .react-colorful__saturation': {
                borderRadius: '4px 4px 0 0',
              },
              '& .react-colorful__hue': {
                height: 12,
                borderRadius: '0 0 4px 4px',
              },
              '& .react-colorful__pointer': {
                width: 18,
                height: 18,
              },
            },
          },
        }}
      >
        <HexColorPicker color={value || '#000000'} onChange={onChange} />
      </Popover>
    </>
  );
}
