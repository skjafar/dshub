import React from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ProgressBarWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, scaledPx, isCompactSize } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { getWidgetError } from './WidgetErrorState';
import { FONT_MONO, FONT_HEADLINE } from '../../theme';

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
    : config.source === 'sysRegister'
    ? state.systemRegisters.get(config.address)
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

  const compact = widgetSize ? isCompactSize(widgetSize) : false;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'center',
        gap: compact ? 0.5 : 1,
        p: compact ? 1 : 2,
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
        <Typography variant="overline" sx={{ color: 'text.secondary', fontSize: widgetSize ? scaledRem(0.6, widgetSize.scale) : '0.6rem', letterSpacing: '0.1em' }}>
          {config.label}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
          {config.showValue !== false && (
            <Typography
              sx={{
                fontFamily: FONT_HEADLINE,
                color: barColor,
                fontSize: widgetSize ? scaledRem(config.valueFontSize ?? 0.9375, widgetSize.scale) : (config.valueFontSize ? `${config.valueFontSize}rem` : '0.9375rem'),
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
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
          },
        }}
      />

      {/* Min/Max Labels */}
      {!compact && (
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
      )}

    </Box>
  );
}
