import React from 'react';
import { Box, Typography } from '@mui/material';
import { DataTableWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, scaledPx } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefreshMulti } from '../../hooks/useAutoRefresh';
import { getWidgetError } from './WidgetErrorState';
import { FONT_MONO } from '../../theme';

interface DataTableWidgetProps {
  config: DataTableWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

/**
 * Data Table Widget
 *
 * Displays a configurable list of register/parameter values in a tabular format
 * with columns for name, value, unit, and optional timestamp.
 */
export default function DataTableWidget({ config, isEditMode, widgetSize }: DataTableWidgetProps): React.ReactElement {
  const { state } = useDSHub();
  const scale = widgetSize?.scale ?? 1;

  useAutoRefreshMulti({
    items: config.items,
    refreshInterval: config.refreshInterval,
    isEditMode,
  });

  const formatValue = (value: number | undefined, format?: string, decimals?: number): string => {
    if (value === undefined) return '---';
    switch (format) {
      case 'hex':
        return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
      case 'binary':
        return `0b${value.toString(2).padStart(8, '0')}`;
      case 'decimal':
      default:
        return decimals !== undefined ? value.toFixed(decimals) : value.toLocaleString();
    }
  };

  const formatTimestamp = (ts: number | undefined): string => {
    if (!ts) return '---';
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  // Check first item for map availability
  if (config.items.length > 0) {
    const firstItem = config.items[0];
    const errorState = getWidgetError(firstItem.source, firstItem.address);
    if (errorState) return errorState;
  }

  const cellPadding = config.compact ? '2px 6px' : '4px 8px';
  const fontSize = scaledRem(config.valueFontSize ?? 0.75, scale);
  const headerFontSize = scaledRem(0.6, scale);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0.5 }}>
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

      {/* Table */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: cellPadding, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: headerFontSize, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Name
                </Typography>
              </th>
              <th style={{ padding: cellPadding, textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: headerFontSize, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Value
                </Typography>
              </th>
              <th style={{ padding: cellPadding, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: headerFontSize, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Unit
                </Typography>
              </th>
              {config.showTimestamp && (
                <th style={{ padding: cellPadding, textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: headerFontSize, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Time
                  </Typography>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {config.items.map((item, index) => {
              const data = item.source === 'register'
                ? state.registers.get(item.address)
                : state.parameters.get(item.address);
              const value = data?.value !== undefined ? (data.value as number) : undefined;
              const isInvalid = data?.valid === false;
              const striped = config.striped && index % 2 === 1;

              return (
                <tr key={`${item.source}-${item.address}-${index}`} style={{ backgroundColor: striped ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                  <td style={{ padding: cellPadding }}>
                    <Typography sx={{ fontSize, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: scaledPx(120, scale) }}>
                      {item.label}
                    </Typography>
                  </td>
                  <td style={{ padding: cellPadding, textAlign: 'right' }}>
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize, fontWeight: 600, color: isInvalid ? 'error.main' : 'text.primary' }}>
                      {formatValue(value, item.format, item.decimals)}
                    </Typography>
                  </td>
                  <td style={{ padding: cellPadding }}>
                    <Typography sx={{ fontSize, color: 'text.secondary' }}>
                      {item.unit ?? ''}
                    </Typography>
                  </td>
                  {config.showTimestamp && (
                    <td style={{ padding: cellPadding, textAlign: 'right' }}>
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: scaledRem(0.65, scale), color: 'text.secondary' }}>
                        {formatTimestamp(data?.timestamp)}
                      </Typography>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
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
