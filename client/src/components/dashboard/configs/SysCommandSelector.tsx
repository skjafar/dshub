import React from 'react';
import {
  TextField,
  Autocomplete,
  Box,
  Typography
} from '@mui/material';
import type { SysCommand } from '../../../types/settings';

interface SysCommandSelectorProps {
  value: number | undefined;
  onChange: (code: number) => void;
  sysCommands: SysCommand[];
  label?: string;
  size?: 'small' | 'medium';
  sx?: object;
}

export default function SysCommandSelector({
  value,
  onChange,
  sysCommands,
  label = 'Command Code',
  size = 'medium',
  sx
}: SysCommandSelectorProps): React.ReactElement {
  const selectedCommand = sysCommands.find(cmd => cmd.code === value) ?? null;

  return (
    <Autocomplete
      fullWidth
      freeSolo
      options={sysCommands}
      getOptionLabel={(option) =>
        typeof option === 'string' ? option : `${option.code} - ${option.name}`
      }
      value={selectedCommand}
      onChange={(_, newValue) => {
        if (newValue && typeof newValue !== 'string') {
          onChange(newValue.code);
        }
      }}
      onInputChange={(_, inputValue, reason) => {
        if (reason === 'input') {
          const num = parseInt(inputValue);
          onChange(!isNaN(num) ? num : undefined as any);
        }
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          margin={size === 'small' ? 'none' : 'normal'}
          size={size}
          helperText={sysCommands.length === 0 ? 'No system commands defined in profile' : undefined}
        />
      )}
      renderOption={(props, option) => (
        <li {...props} key={typeof option === 'string' ? option : option.code}>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2">
              <strong>{(option as SysCommand).code}</strong> - {(option as SysCommand).name}
            </Typography>
            {(option as SysCommand).description && (
              <Typography variant="caption" color="text.secondary">
                {(option as SysCommand).description}
              </Typography>
            )}
          </Box>
        </li>
      )}
      isOptionEqualToValue={(option, val) =>
        typeof option !== 'string' && typeof val !== 'string' && option.code === val.code
      }
      sx={sx}
    />
  );
}
