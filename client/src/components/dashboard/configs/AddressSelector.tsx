import React from 'react';
import {
  TextField,
  Autocomplete,
  Box,
  Typography
} from '@mui/material';
import { DataSource } from '../../../types/dashboard';

export interface AddressItem {
  address: number;
  name: string;
  type?: string;
  isReadOnly?: boolean;
}

interface AddressSelectorProps {
  dataSource: DataSource;
  currentAddress: number | undefined;
  onChange: (address: number) => void;
  label?: string;
  registers: AddressItem[];
  parameters: AddressItem[];
  systemRegisters?: AddressItem[];
  size?: 'small' | 'medium';
}

export default function AddressSelector({
  dataSource,
  currentAddress,
  onChange,
  label = 'Address',
  registers,
  parameters,
  systemRegisters = [],
  size = 'medium',
}: AddressSelectorProps): React.ReactElement {
  const items = dataSource === 'register'
    ? registers
    : dataSource === 'sysRegister'
    ? systemRegisters
    : parameters;
  const selectedItem = items.find(item => item.address === currentAddress);

  return (
    <Autocomplete
      fullWidth
      size={size}
      options={items}
      getOptionLabel={(option) => `${option.address} - ${option.name}`}
      value={selectedItem ?? null}
      onChange={(_, newValue) => {
        if (newValue) {
          onChange(newValue.address);
        }
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          margin={size === 'small' ? 'none' : 'normal'}
          helperText={items.length === 0 ? `No ${dataSource === 'sysRegister' ? 'system register' : dataSource}s mapped` : ''}
        />
      )}
      renderOption={(props, option) => (
        <li {...props} key={option.address}>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2">
              <strong>{option.address}</strong> - {option.name}
            </Typography>
            {option.type && (
              <Typography variant="caption" color="text.secondary">
                {option.type}
                {option.isReadOnly !== undefined && ` (${option.isReadOnly ? 'Read-Only' : 'Read/Write'})`}
              </Typography>
            )}
          </Box>
        </li>
      )}
      isOptionEqualToValue={(option, value) => option.address === value.address}
    />
  );
}
