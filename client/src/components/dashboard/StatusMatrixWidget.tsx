import React from 'react';
import { Box, Typography } from '@mui/material';
import { StatusMatrixWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, isCompactSize } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefreshMulti } from '../../hooks/useAutoRefresh';
import { getWidgetError } from './WidgetErrorState';

interface StatusMatrixWidgetProps {
  config: StatusMatrixWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

/**
 * Status Matrix Widget
 *
 * Grid of LED status dots, each monitoring a different register/parameter address.
 * Provides a compact overview of many binary/state signals at once.
 */
export default function StatusMatrixWidget({ config, isEditMode, widgetSize }: StatusMatrixWidgetProps): React.ReactElement {
  const { state } = useDSHub();
  const scale = widgetSize?.scale ?? 1;

  useAutoRefreshMulti({
    items: config.items,
    refreshInterval: config.refreshInterval,
    isEditMode,
  });

  // Check first item for map availability
  if (config.items.length > 0) {
    const firstItem = config.items[0];
    const errorState = getWidgetError(firstItem.source, firstItem.address);
    if (errorState) return errorState;
  }

  const autoCompact = widgetSize ? isCompactSize(widgetSize, 100) : false;
  const compact = config.compact || autoCompact;
  const dotSize = config.dotSize ?? 12;
  const showLabels = (config.showLabels !== false) && !autoCompact;
  // Cell width: dot + label space
  const cellMinWidth = showLabels ? (compact ? 48 : 56) : (compact ? 24 : 32);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: compact ? 0.5 : 1 }}>
      {/* Widget Label */}
      <Typography
        variant="overline"
        sx={{
          color: 'text.secondary',
          fontSize: scaledRem(0.6, scale),
          letterSpacing: '0.08em',
          flexShrink: 0,
        }}
      >
        {config.label}
      </Typography>

      {/* LED Grid */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(${cellMinWidth}px, 1fr))`,
          gap: compact ? 0.5 : 1,
          alignContent: 'start',
        }}
      >
        {config.items.map((item, index) => {
          const data = item.source === 'register'
            ? state.registers.get(item.address)
            : item.source === 'sysRegister'
            ? state.systemRegisters.get(item.address)
            : state.parameters.get(item.address);
          const value = data?.value !== undefined ? (data.value as number) : undefined;
          const onValue = item.onValue ?? 1;
          const isOn = value === onValue;
          const onColor = item.onColor ?? '#4ADE80';
          const offColor = item.offColor ?? '#6B7280';
          const color = isOn ? onColor : offColor;

          return (
            <Box
              key={`${item.source}-${item.address}-${index}`}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.25,
              }}
            >
              {/* LED Dot */}
              <Box
                sx={{
                  width: dotSize,
                  height: dotSize,
                  borderRadius: '50%',
                  backgroundColor: color,
                  boxShadow: isOn ? `0 0 8px ${color}80` : 'none',
                  transition: 'all 0.15s ease',
                }}
              />
              {/* Label */}
              {showLabels && (
                <Typography
                  sx={{
                    fontSize: compact ? '0.5rem' : '0.55rem',
                    color: isOn ? 'text.primary' : 'text.secondary',
                    textAlign: 'center',
                    lineHeight: 1.1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}
                >
                  {item.label}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Connection Status */}
      {!state.connection?.connected && (
        <Typography variant="caption" color="error" sx={{ textAlign: 'center', flexShrink: 0 }}>
          Not connected
        </Typography>
      )}
    </Box>
  );
}
