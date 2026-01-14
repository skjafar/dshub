import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { ValueReadWidgetConfig } from '../../types/dashboard';
import { useDeviceMon } from '../../contexts/DeviceMonContext';

interface ValueReadWidgetProps {
  config: ValueReadWidgetConfig;
  isEditMode: boolean;
}

export default function ValueReadWidget({ config, isEditMode }: ValueReadWidgetProps) {
  const { state, actions } = useDeviceMon();
  const [isLoading, setIsLoading] = useState(false);

  // Get the current value from state
  const data = config.source === 'register'
    ? state.registers.get(config.address)
    : state.parameters.get(config.address);

  // Auto-refresh effect
  useEffect(() => {
    if (isEditMode || !state.connection?.connected) return;

    // Initial read
    readValue();

    // Setup interval for auto-refresh
    const interval = setInterval(() => {
      readValue();
    }, config.refreshInterval);

    return () => clearInterval(interval);
  }, [config.address, config.source, config.refreshInterval, isEditMode, state.connection?.connected]);

  const readValue = () => {
    if (!state.connection?.connected) return;

    setIsLoading(true);
    if (config.source === 'register') {
      actions.readRegister(config.address);
    } else {
      actions.readParameter(config.address);
    }
    // Loading state will be cleared when data arrives
    setTimeout(() => setIsLoading(false), 500);
  };

  const formatValue = (value: number | null): string => {
    if (value === null) return 'N/A';

    switch (config.displayFormat) {
      case 'hex':
        return `0x${value.toString(16).toUpperCase()}`;
      case 'binary':
        return `0b${value.toString(2)}`;
      case 'decimal':
      default:
        return value.toString();
    }
  };

  const getTimestamp = (): string => {
    if (!data?.timestamp) return '';
    return new Date(data.timestamp).toLocaleTimeString();
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'center',
        gap: 1,
        border: '2px solid',
        borderColor: 'transparent',
        borderRadius: 1,
        transition: 'border-color 0.3s ease',
        ...(isLoading && {
          animation: 'breathingBorder 0.4s ease-in-out infinite',
          '@keyframes breathingBorder': {
            '0%': {
              borderColor: 'transparent',
            },
            '50%': {
              borderColor: 'rgba(25, 118, 210, 0.2)',
              boxShadow: '0 0 4px rgba(25, 118, 210, 0.1)',
            },
            '100%': {
              borderColor: 'transparent',
            },
          },
        }),
      }}
    >
      <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
        {config.label}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 'bold',
            fontFamily: 'monospace',
            color: data?.valid === false ? 'error.main' : 'text.primary'
          }}
        >
          {formatValue(data?.value ?? null)}
        </Typography>

        {config.unit && (
          <Typography variant="h6" color="text.secondary">
            {config.unit}
          </Typography>
        )}
      </Box>

      {config.showTimestamp && data?.timestamp && (
        <Typography variant="caption" color="text.secondary">
          Last update: {getTimestamp()}
        </Typography>
      )}

      {!state.connection?.connected && (
        <Typography variant="caption" color="error">
          Not connected
        </Typography>
      )}

      {data?.valid === false && (
        <Typography variant="caption" color="error">
          Invalid data
        </Typography>
      )}
    </Box>
  );
}
