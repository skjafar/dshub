import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { EncoderDisplayWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, isCompactSize } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { mapManager } from '../../maps/mapManager';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { getWidgetError } from './WidgetErrorState';
import { FONT_MONO } from '../../theme';

interface EncoderDisplayWidgetProps {
  config: EncoderDisplayWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

/**
 * Encoder Display Widget
 *
 * Generic widget for displaying numeric values with optional unit conversion.
 * Can read conversion factor from a parameter or use a constant value.
 *
 * Example use cases:
 * - Motor encoder position (steps → mm using steps_per_mm parameter)
 * - Angle encoder (counts → degrees using counts_per_degree parameter)
 * - Distance sensor (raw ADC → cm using calibration factor)
 * - Temperature sensor (ADC → °C using conversion formula)
 */
export default function EncoderDisplayWidget({ config, isEditMode, widgetSize }: EncoderDisplayWidgetProps) {
  const { state, actions } = useDSHub();
  const [conversionFactor, setConversionFactor] = useState<number | null>(null);

  // Set up auto-refresh for data source
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

  const rawValue = currentData?.value !== undefined ? (currentData.value as number) : 0;

  // Load conversion factor if using parameter source
  useEffect(() => {
    if (config.conversionSource === 'parameter' && config.conversionAddress !== undefined) {
      const convMapEntry = mapManager.getParameterByAddress(config.conversionAddress);
      if (convMapEntry && state.connection?.connected) {
        actions.readParameter(config.conversionAddress, convMapEntry.name);
      }
    } else if (config.conversionSource === 'constant' && config.conversionFactor) {
      setConversionFactor(config.conversionFactor);
    }
  }, [config.conversionSource, config.conversionAddress, config.conversionFactor, state.connection?.connected, actions]);

  // Update conversion factor when parameter is received
  useEffect(() => {
    if (config.conversionSource === 'parameter' && config.conversionAddress !== undefined) {
      const convData = state.parameters.get(config.conversionAddress);
      if (convData?.value !== undefined) {
        setConversionFactor(convData.value as number);
      }
    }
  }, [state.parameters, config.conversionSource, config.conversionAddress]);

  // Calculate converted value
  const convertedValue = conversionFactor && conversionFactor > 0
    ? rawValue / conversionFactor
    : null;

  // Format value with decimals
  const formatValue = (value: number): string => {
    const decimals = config.decimals ?? 3;
    return value.toFixed(decimals).padStart(9, ' ');
  };

  const formatRawValue = (value: number): string => {
    return value.toString().padStart(8, ' ');
  };

  const displayColor = config.color || '#00F2FF';

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
        alignItems: 'center',
        gap: 1,
        p: 2,
        backgroundColor: 'action.hover',
        borderRadius: 1,
      }}
    >
      {/* Widget Label */}
      <Typography variant="overline" sx={{ color: 'text.secondary', fontSize: widgetSize ? scaledRem(0.6, widgetSize.scale) : '0.6rem', letterSpacing: '0.08em' }}>
        {config.label}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Converted Value Display (Primary) */}
        {convertedValue !== null && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 1,
            }}
          >
            <Typography
              sx={{
                fontFamily: FONT_MONO,
                fontSize: widgetSize ? scaledRem(config.valueFontSize ?? 1.5, widgetSize.scale) : (config.valueFontSize ? `${config.valueFontSize}rem` : '1.5rem'),
                fontWeight: 600,
                color: displayColor,
                lineHeight: 1,
                letterSpacing: '0.05em',
                textShadow: state.connection?.connected ? `0 0 10px ${displayColor}` : 'none',
              }}
            >
              {formatValue(convertedValue)}
            </Typography>
            {config.primaryUnit && (
              <Typography
                sx={{
                  color: 'text.secondary',
                  fontSize: widgetSize ? scaledRem(0.875, widgetSize.scale) : '0.875rem',
                  fontWeight: 500,
                }}
              >
                {config.primaryUnit}
              </Typography>
            )}
          </Box>
        )}

        {/* Raw Value Display (Secondary) */}
        {!compact && (config.showRawValue !== false || convertedValue === null) && (
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              fontSize: widgetSize ? scaledRem(0.75, widgetSize.scale) : '0.75rem',
              color: 'text.secondary',
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            [{formatRawValue(rawValue)} {config.secondaryUnit || 'raw'}]
          </Typography>
        )}
      </Box>

      {/* Connection Status */}
      {!compact && !state.connection?.connected && (
        <Typography variant="caption" color="error">
          Not connected
        </Typography>
      )}
    </Box>
  );
}
