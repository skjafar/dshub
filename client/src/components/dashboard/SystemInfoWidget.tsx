import React from 'react';
import { Box, Typography } from '@mui/material';
import { SystemInfoWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, getOrientation } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefreshMulti } from '../../hooks/useAutoRefresh';
import { getWidgetError } from './WidgetErrorState';
import { FONT_MONO } from '../../theme';

interface SystemInfoWidgetProps {
  config: SystemInfoWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

/**
 * System Info Widget
 *
 * Generic multi-value display widget that shows multiple registers/parameters
 * in a compact, organized format. Supports different layouts and formats.
 *
 * Example use cases:
 * - System status panel (uptime, packet count, errors, temperature)
 * - Device information (firmware version, serial number, board type)
 * - Performance metrics (CPU usage, memory, network stats)
 * - Sensor array (multiple sensor readings in one widget)
 */
export default function SystemInfoWidget({ config, isEditMode, widgetSize }: SystemInfoWidgetProps) {
  const { state } = useDSHub();

  // Set up auto-refresh for all items
  useAutoRefreshMulti({
    items: config.items,
    refreshInterval: config.refreshInterval,
    isEditMode,
  });

  /**
   * Format value based on format type
   */
  const formatValue = (value: number | undefined, format?: string): string => {
    if (value === undefined) return '---';

    switch (format) {
      case 'hex':
        return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
      case 'binary':
        return `0b${value.toString(2).padStart(8, '0')}`;
      case 'time':
        // Format as HH:MM:SS (assuming value is in seconds)
        const hours = Math.floor(value / 3600);
        const minutes = Math.floor((value % 3600) / 60);
        const seconds = value % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      case 'decimal':
      default:
        return value.toLocaleString();
    }
  };

  // Render a single info item
  const renderInfoItem = (item: typeof config.items[0]) => {
    const currentData = item.source === 'register'
      ? state.registers.get(item.address)
      : item.source === 'sysRegister'
      ? state.systemRegisters.get(item.address)
      : state.parameters.get(item.address);

    const value = currentData?.value !== undefined ? (currentData.value as number) : undefined;
    const formattedValue = formatValue(value, item.format);
    const itemColor = item.color || '#00F2FF';

    return (
      <Box
        key={`${item.source}-${item.address}`}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          minWidth: 0, // Allow flex items to shrink
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontSize: widgetSize ? scaledRem(0.7, widgetSize.scale) : '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {item.label}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              color: itemColor,
              fontSize: widgetSize ? scaledRem(config.valueFontSize ?? 0.9, widgetSize.scale) : (config.valueFontSize ? `${config.valueFontSize}rem` : '0.9rem'),
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {formattedValue}
          </Typography>
          {item.unit && (
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontSize: widgetSize ? scaledRem(0.7, widgetSize.scale) : '0.7rem',
              }}
            >
              {item.unit}
            </Typography>
          )}
        </Box>
      </Box>
    );
  };

  const configLayout = config.layout || 'vertical';
  const orientation = widgetSize ? getOrientation(widgetSize) : 'square';
  // Auto-adapt: if layout contradicts aspect ratio, override
  let layout = configLayout;
  if (orientation === 'landscape' && configLayout === 'vertical') layout = 'horizontal';
  if (orientation === 'portrait' && configLayout === 'horizontal') layout = 'vertical';

  // Check first item for map availability
  if (config.items.length > 0) {
    const firstItem = config.items[0];
    const errorState = getWidgetError(firstItem.source, firstItem.address);
    if (errorState) return errorState;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: config.compact ? 0.5 : 1,
        p: config.compact ? 1 : 2,
        backgroundColor: 'action.hover',
        borderRadius: 1,
      }}
    >
      {/* Widget Label */}
      <Typography
        variant="overline"
        sx={{
          color: 'text.secondary',
          fontSize: widgetSize ? scaledRem(0.6, widgetSize.scale) : '0.6rem',
          letterSpacing: '0.08em',
          borderBottom: '1px solid',
          borderColor: 'divider',
          pb: 0.5,
        }}
      >
        {config.label}
      </Typography>

      {/* Info Items */}
      <Box
        sx={{
          display: layout === 'grid' ? 'grid' : 'flex',
          flexDirection: layout === 'vertical' ? 'column' : 'row',
          gridTemplateColumns: layout === 'grid' ? `repeat(auto-fit, minmax(120px, 1fr))` : undefined,
          gap: layout === 'grid' ? 2 : 1.5,
          flexWrap: layout === 'horizontal' ? 'wrap' : undefined,
          overflow: 'auto',
        }}
      >
        {config.items.map(renderInfoItem)}
      </Box>

      {/* Connection Status */}
      {!state.connection?.connected && (
        <Typography
          variant="caption"
          color="error"
          sx={{
            textAlign: 'center',
            mt: 'auto',
            pt: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          Not connected
        </Typography>
      )}
    </Box>
  );
}
