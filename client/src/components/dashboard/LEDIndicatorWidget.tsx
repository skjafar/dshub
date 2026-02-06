import React from 'react';
import { Box, Typography } from '@mui/material';
import { LEDIndicatorWidgetConfig } from '../../types/dashboard';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { getWidgetError } from './WidgetErrorState';

interface LEDIndicatorWidgetProps {
  config: LEDIndicatorWidgetConfig;
  isEditMode: boolean;
}

/**
 * LED Indicator Widget
 *
 * Generic binary indicator widget that shows on/off states as a colored LED.
 * Configurable on/off values, colors, and labels.
 *
 * Example use cases:
 * - Motor enabled/disabled (1=green/ENABLED, 0=gray/DISABLED)
 * - Alarm active (1=red/ALARM, 0=green/OK)
 * - Connection status (1=green/CONNECTED, 0=red/DISCONNECTED)
 * - Limit switch (1=red/TRIGGERED, 0=gray/NORMAL)
 */
export default function LEDIndicatorWidget({ config, isEditMode }: LEDIndicatorWidgetProps) {
  const { state } = useDSHub();

  // Get current data from state
  const currentData = config.source === 'register'
    ? state.registers.get(config.address)
    : state.parameters.get(config.address);

  const currentValue = currentData?.value !== undefined ? (currentData.value as number) : null;

  // Determine on/off state
  const onValue = config.onValue ?? 1;
  const offValue = config.offValue ?? 0;
  const isOn = currentValue === onValue;
  const isOff = currentValue === offValue;

  // Get LED color
  const onColor = config.onColor || '#4ADE80'; // Default green
  const offColor = config.offColor || '#6B7280'; // Default gray
  const ledColor = isOn ? onColor : offColor;

  // Get label
  const onLabel = config.onLabel || 'ON';
  const offLabel = config.offLabel || 'OFF';
  const statusLabel = isOn ? onLabel : isOff ? offLabel : 'UNKNOWN';

  // Determine if LED should pulse
  const shouldPulse = config.pulseWhenOn && isOn;

  // Set up auto-refresh
  useAutoRefresh({
    source: config.source,
    address: config.address,
    refreshInterval: config.refreshInterval,
    isEditMode,
  });

  const errorState = getWidgetError(config.source, config.address);
  if (errorState) return errorState;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 1,
        p: 1.5,
      }}
    >
      {/* Widget Label */}
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
        {config.label}
      </Typography>

      {/* LED and Status Container */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {/* LED Indicator */}
        <Box
          sx={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            backgroundColor: ledColor,
            boxShadow: state.connection?.connected && isOn ? `0 0 12px ${ledColor}` : 'none',
            border: `2px solid ${ledColor}`,
            animation: shouldPulse ? 'pulse 1.5s ease-in-out infinite' : 'none',
            '@keyframes pulse': {
              '0%, 100%': {
                opacity: 1,
              },
              '50%': {
                opacity: 0.5,
              },
            },
          }}
        />

        {/* Status Label */}
        <Typography
          sx={{
            color: ledColor,
            fontSize: config.fontSize ? `${config.fontSize}rem` : '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
          }}
        >
          {statusLabel}
        </Typography>
      </Box>

      {/* Connection Status */}
      {!state.connection?.connected && (
        <Typography variant="caption" color="error" sx={{ fontSize: '0.65rem' }}>
          Not connected
        </Typography>
      )}
    </Box>
  );
}
