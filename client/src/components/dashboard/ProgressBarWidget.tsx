import React from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ProgressBarWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, scaledPx } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { getWidgetError } from './WidgetErrorState';
import { FONT_MONO } from '../../theme';

interface ProgressBarWidgetProps {
  config: ProgressBarWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

/**
 * Progress Bar Widget
 *
 * Generic progress bar widget for displaying numeric values as a visual bar.
 * Supports horizontal/vertical orientation, color ranges, and percentage display.
 *
 * Example use cases:
 * - Spindle load (0-100%)
 * - Battery level (0-100%)
 * - Tank fill level (0-100 liters)
 * - Completion progress (0-100%)
 */
export default function ProgressBarWidget({ config, isEditMode, widgetSize }: ProgressBarWidgetProps) {
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

  const currentValue = currentData?.value !== undefined ? (currentData.value as number) : config.min;

  // Calculate percentage
  const percentage = ((currentValue - config.min) / (config.max - config.min)) * 100;
  const clampedPercentage = Math.max(0, Math.min(100, percentage));

  // Get color based on value and color ranges
  const getValueColor = (value: number): string => {
    if (!config.colorRanges || config.colorRanges.length === 0) {
      return '#4ADE80'; // Default green
    }

    for (const range of config.colorRanges) {
      if (value >= range.from && value <= range.to) {
        return range.color;
      }
    }

    return '#6B7280'; // Default gray if no range matches
  };

  const barColor = getValueColor(currentValue);

  const isHorizontal = config.orientation !== 'vertical';

  const errorState = getWidgetError(config.source, config.address);
  if (errorState) return errorState;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'center',
        gap: 1,
        p: 2,
      }}
    >
      {/* Header: Label and Value/Percentage */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography variant="overline" sx={{ color: 'text.secondary', fontSize: widgetSize ? scaledRem(0.6, widgetSize.scale) : '0.6rem', letterSpacing: '0.08em' }}>
          {config.label}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
          {config.showValue !== false && (
            <Typography
              sx={{
                fontFamily: FONT_MONO,
                color: barColor,
                fontSize: widgetSize ? scaledRem(config.valueFontSize ?? 0.875, widgetSize.scale) : (config.valueFontSize ? `${config.valueFontSize}rem` : '0.875rem'),
                fontWeight: 600,
              }}
            >
              {currentValue.toFixed(0)}{config.unit || ''}
            </Typography>
          )}
          {config.showPercentage && (
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
              }}
            >
              ({clampedPercentage.toFixed(0)}%)
            </Typography>
          )}
        </Box>
      </Box>

      {/* Progress Bar */}
      <LinearProgress
        variant="determinate"
        value={clampedPercentage}
        sx={{
          height: widgetSize ? scaledPx(12, widgetSize.scale) : 12,
          borderRadius: 2,
          backgroundColor: (theme) => alpha(theme.palette.text.primary, 0.1),
          '& .MuiLinearProgress-bar': {
            backgroundColor: barColor,
            borderRadius: 2,
            boxShadow: state.connection?.connected ? `0 0 10px ${barColor}` : 'none',
          },
        }}
      />

      {/* Min/Max Labels */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {config.min}{config.unit || ''}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {config.max}{config.unit || ''}
        </Typography>
      </Box>

      {/* Connection Status */}
      {!state.connection?.connected && (
        <Typography variant="caption" color="error" sx={{ textAlign: 'center' }}>
          Not connected
        </Typography>
      )}
    </Box>
  );
}
