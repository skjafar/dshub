import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ValueReadWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, isCompactSize } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { getWidgetError } from './WidgetErrorState';
import { FONT_MONO, FONT_HEADLINE } from '../../theme';

interface ValueReadWidgetProps {
  config: ValueReadWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

export default function ValueReadWidget({ config, isEditMode, widgetSize }: ValueReadWidgetProps) {
  const { state } = useDSHub();
  const [isLoading, setIsLoading] = useState(false);
  const prevTimestampRef = useRef<number | undefined>(undefined);

  // Get the current value from state
  const data = config.source === 'register'
    ? state.registers.get(config.address)
    : config.source === 'sysRegister'
    ? state.systemRegisters.get(config.address)
    : state.parameters.get(config.address);

  // Set up auto-refresh via shared hook
  useAutoRefresh({
    source: config.source,
    address: config.address,
    refreshInterval: config.refreshInterval,
    isEditMode,
  });

  // Track loading state based on data timestamp changes
  useEffect(() => {
    if (data?.timestamp && data.timestamp !== prevTimestampRef.current) {
      prevTimestampRef.current = data.timestamp;
      setIsLoading(true);
      const timer = setTimeout(() => setIsLoading(false), 500);
      return () => clearTimeout(timer);
    }
  }, [data?.timestamp]);

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
        gap: 1,
        border: '2px solid',
        borderColor: 'transparent',
        borderRadius: 1,
        transition: 'border-color 0.3s ease',
        ...(isLoading && {
          borderColor: (theme) => alpha(theme.palette.primary.main, 0.3),
        }),
      }}
    >
      <Typography
        variant="overline"
        sx={{ color: 'text.secondary', fontSize: widgetSize ? scaledRem(0.6, widgetSize.scale) : '0.6rem', letterSpacing: '0.1em' }}
      >
        {config.label}
      </Typography>

      <Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
          <Typography
            sx={{
              fontFamily: FONT_HEADLINE,
              fontWeight: 600,
              fontSize: widgetSize ? scaledRem(config.valueFontSize ?? 1.75, widgetSize.scale) : (config.valueFontSize ? `${config.valueFontSize}rem` : '1.75rem'),
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              color: data?.valid === false ? 'error.main' : 'text.primary',
            }}
          >
            {formatValue(data?.value ?? null)}
          </Typography>

          {config.unit && (
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: widgetSize ? scaledRem(0.75, widgetSize.scale) : '0.75rem', color: 'text.secondary', fontWeight: 500 }}>
              {config.unit}
            </Typography>
          )}
        </Box>

        {!compact && config.showTimestamp && data?.timestamp && (
          <Typography variant="caption" color="text.secondary">
            Last update: {getTimestamp()}
          </Typography>
        )}
      </Box>

      {!compact && data?.valid === false && (
        <Typography variant="caption" color="error">
          Invalid data
        </Typography>
      )}
    </Box>
  );
}
