import React from 'react';
import { Box, Typography } from '@mui/material';
import { GaugeWidgetConfig } from '../../types/dashboard';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { getWidgetError } from './WidgetErrorState';

interface GaugeWidgetProps {
  config: GaugeWidgetConfig;
  isEditMode: boolean;
}

/**
 * Gauge Widget
 *
 * Generic circular gauge widget for displaying numeric values.
 * Configurable min/max, units, colors, and decimal places.
 *
 * Example use cases:
 * - RPM gauge (0-10000 RPM)
 * - Temperature gauge (-50 to 150°C)
 * - Pressure gauge (0-100 PSI)
 * - Speed gauge (0-100 mm/s)
 */
export default function GaugeWidget({ config, isEditMode }: GaugeWidgetProps) {
  const { state } = useDSHub();

  // Get current data from state
  const currentData = config.source === 'register'
    ? state.registers.get(config.address)
    : state.parameters.get(config.address);

  const currentValue = currentData?.value !== undefined ? (currentData.value as number) : 0;

  // Format value with decimals
  const formatValue = (value: number): string => {
    const decimals = config.decimals ?? 0;
    return value.toFixed(decimals);
  };

  // Get color based on value and color ranges
  const getValueColor = (value: number): string => {
    if (!config.colorRanges || config.colorRanges.length === 0) {
      return '#00F2FF'; // Default cyan
    }

    for (const range of config.colorRanges) {
      if (value >= range.from && value <= range.to) {
        return range.color;
      }
    }

    return '#6B7280'; // Default gray if no range matches
  };

  const valueColor = getValueColor(currentValue);

  // Set up auto-refresh
  useAutoRefresh({
    source: config.source,
    address: config.address,
    refreshInterval: config.refreshInterval,
    isEditMode,
  });

  // SVG arc gauge calculations
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75; // 270-degree sweep
  const percentage = Math.max(0, Math.min(1, (currentValue - config.min) / (config.max - config.min)));
  const valueOffset = arcLength * (1 - percentage);

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
        gap: 0.5,
        p: 2,
      }}
    >
      {/* Widget Label */}
      <Typography variant="overline" sx={{ color: 'text.secondary', fontSize: '0.6rem', letterSpacing: '0.08em' }}>
        {config.label}
      </Typography>

      {/* SVG Arc Gauge */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 130,
          aspectRatio: '1',
        }}
      >
        <svg
          viewBox="0 0 120 120"
          style={{ width: '100%', height: '100%', transform: 'rotate(-135deg)' }}
        >
          {/* Background track */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="5"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Value arc */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={valueColor}
            strokeWidth="5"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={valueOffset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease',
              filter: state.connection?.connected ? `drop-shadow(0 0 4px ${valueColor}80)` : 'none',
            }}
          />
        </svg>

        {/* Centered value overlay */}
        {(config.showValue !== false) && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography
              sx={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: config.valueFontSize ? `${config.valueFontSize}rem` : '1.75rem',
                fontWeight: 700,
                color: valueColor,
                lineHeight: 1,
              }}
            >
              {formatValue(currentValue)}
            </Typography>
            {config.unit && (
              <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: 'text.secondary', fontWeight: 500, mt: 0.5 }}>
                {config.unit}
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {/* Min/Max Labels */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 130 }}>
        <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: 'text.secondary' }}>
          {config.min}
        </Typography>
        <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: 'text.secondary' }}>
          {config.max}
        </Typography>
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
