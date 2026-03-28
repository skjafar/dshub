import React from 'react';
import { Box, Typography } from '@mui/material';
import { LEDIndicatorWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, scaledPx, getOrientation } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { getWidgetError } from './WidgetErrorState';
import { FONT_MONO } from '../../theme';

interface LEDIndicatorWidgetProps {
  config: LEDIndicatorWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
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
export default function LEDIndicatorWidget({ config, isEditMode, widgetSize }: LEDIndicatorWidgetProps) {
  const { state } = useDSHub();

  // Get current data from state
  const currentData = config.source === 'register'
    ? state.registers.get(config.address)
    : config.source === 'sysRegister'
    ? state.systemRegisters.get(config.address)
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

  const orientation = widgetSize ? getOrientation(widgetSize) : 'square';
  const isLandscape = orientation === 'landscape';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: isLandscape ? 'row' : 'column',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        gap: isLandscape ? 1.5 : 1,
        p: isLandscape ? 1 : 1.5,
      }}
    >
      {/* Widget Label */}
      <Typography variant="overline" sx={{ color: 'text.secondary', fontSize: widgetSize ? scaledRem(0.6, widgetSize.scale) : '0.6rem', letterSpacing: '0.1em', flexShrink: 0 }}>
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
            width: widgetSize ? scaledPx(12, widgetSize.scale) : 12,
            height: widgetSize ? scaledPx(12, widgetSize.scale) : 12,
            borderRadius: '50%',
            backgroundColor: ledColor,
            boxShadow: state.connection?.connected && isOn ? `0 0 ${widgetSize ? scaledPx(8, widgetSize.scale) : 8}px ${ledColor}80` : 'none',
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
            fontFamily: FONT_MONO,
            fontSize: widgetSize ? scaledRem(config.fontSize ?? 0.75, widgetSize.scale) : (config.fontSize ? `${config.fontSize}rem` : '0.75rem'),
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {statusLabel}
        </Typography>
      </Box>

      {/* Connection Status */}
      {!state.connection?.connected && (
        <Typography variant="caption" color="error" sx={{ fontSize: widgetSize ? scaledRem(0.65, widgetSize.scale) : '0.65rem' }}>
          Not connected
        </Typography>
      )}
    </Box>
  );
}
