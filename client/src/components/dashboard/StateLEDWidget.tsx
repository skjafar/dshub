import React from 'react';
import { Box, Typography } from '@mui/material';
import { StateLEDWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, scaledPx } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { getWidgetError } from './WidgetErrorState';

interface StateLEDWidgetProps {
  config: StateLEDWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

/**
 * State LED Widget
 *
 * Generic widget that displays a register/parameter value as a colored LED
 * with configurable state mappings. Can be used for machine states, motor states,
 * alarm conditions, or any enumerated value.
 *
 * Example use cases:
 * - CNC machine state (IDLE, HOMING, READY, RUNNING, ERROR, E_STOP)
 * - Motor state (STOPPED, STARTING, RUNNING, BRAKING, ERROR)
 * - Alarm state (NONE, WARNING, CRITICAL)
 */
export default function StateLEDWidget({ config, isEditMode, widgetSize }: StateLEDWidgetProps) {
  const { state } = useDSHub();

  // Set up auto-refresh
  useAutoRefresh({
    source: config.source,
    address: config.address,
    refreshInterval: config.refreshInterval,
    isEditMode,
  });

  // Get current data from state
  const currentData = config.source === 'register'
    ? state.registers.get(config.address)
    : state.parameters.get(config.address);

  const currentValue = currentData?.value !== undefined ? (currentData.value as number) : null;

  // Find the matching state configuration
  const currentState = config.states.find(s => s.value === currentValue);
  const defaultState = { value: -1, label: 'Unknown', color: '#6B7280' };
  const activeState = currentState || defaultState;

  // Determine if this state should pulse
  const shouldPulse = config.pulseAnimation &&
    config.pulseStates &&
    currentValue !== null &&
    config.pulseStates.includes(currentValue);


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
        p: 2,
      }}
    >
      {/* Widget Label */}
      <Typography variant="overline" sx={{ color: 'text.secondary', fontSize: widgetSize ? scaledRem(0.6, widgetSize.scale) : '0.6rem', letterSpacing: '0.08em' }}>
        {config.label}
      </Typography>

      {/* LED and State Label Container */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          sx={{
            width: widgetSize ? scaledPx(12, widgetSize.scale) : 12,
            height: widgetSize ? scaledPx(12, widgetSize.scale) : 12,
            borderRadius: '50%',
            backgroundColor: activeState.color,
            boxShadow: `0 0 ${widgetSize ? scaledPx(8, widgetSize.scale) : 8}px ${activeState.color}80`,
            animation: shouldPulse ? 'pulse 1.5s ease-in-out infinite' : 'none',
            '@keyframes pulse': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.4 },
            },
          }}
        />
        {config.showLabel !== false && (
          <Typography
            sx={{
              fontFamily: '"JetBrains Mono", monospace',
              color: activeState.color,
              fontSize: widgetSize ? scaledRem(config.fontSize ?? 0.875, widgetSize.scale) : (config.fontSize ? `${config.fontSize}rem` : '0.875rem'),
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {activeState.label}
          </Typography>
        )}
      </Box>

      {/* Connection Status */}
      {!state.connection?.connected && (
        <Typography variant="caption" color="error">
          Not connected
        </Typography>
      )}
    </Box>
  );
}
