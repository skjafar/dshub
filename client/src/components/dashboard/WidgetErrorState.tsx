import React from 'react';
import { Box, Typography } from '@mui/material';
import { mapManager } from '../../maps/mapManager';

/**
 * Returns an error JSX element if the widget's data source can't be resolved,
 * or null if everything is fine. Used for early-return error rendering in widgets.
 */
export function getWidgetError(source: string, address: number): React.ReactElement | null {
  if (!mapManager.isInitialized()) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', p: 2 }}>
        <Typography variant="caption" color="warning.main" sx={{ textAlign: 'center' }}>
          Map not loaded
        </Typography>
      </Box>
    );
  }

  const entry = source === 'register'
    ? mapManager.getRegisterByAddress(address)
    : mapManager.getParameterByAddress(address);

  if (!entry) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', p: 2 }}>
        <Typography variant="caption" color="error" sx={{ textAlign: 'center' }}>
          {source} address {address} not in map
        </Typography>
      </Box>
    );
  }

  return null;
}
