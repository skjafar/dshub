import React, { useState } from 'react';
import { Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button, useTheme } from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';
import { DataTableWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefreshMulti } from '../../hooks/useAutoRefresh';
import { useToast } from '../ToastNotification';
import { getWidgetError } from './WidgetErrorState';
import { FONT_MONO } from '../../theme';
import { mapManager } from '../../maps/mapManager';
import { parseWriteInput, filterWriteInput } from '../../utils/writeInputParse';

interface DataTableWidgetProps {
  config: DataTableWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

type DataTableItem = DataTableWidgetConfig['items'][number];

/** Auto-detect writability from the data map.
 *  Parameters are always writable. Registers depend on accessPermit. */
function isItemWritable(source: string, address: number): boolean {
  if (source === 'parameter') return true;
  if (source === 'register') {
    const entry = mapManager.getRegisterByAddress(address);
    return entry?.accessPermit === 'READ_WRITE';
  }
  return false;
}

/**
 * Data Table Widget
 *
 * Displays a configurable list of register/parameter values in a tabular format.
 * Writability is auto-detected from the data map:
 * - Registers marked READ_WRITE and all parameters show an inline write input
 * - Registers marked READ_ONLY display only the current value
 */
export default function DataTableWidget({ config, isEditMode, widgetSize }: DataTableWidgetProps): React.ReactElement {
  const { palette: { custom: c } } = useTheme();
  const { state, actions } = useDSHub();
  const { showSuccess, showError } = useToast();
  const scale = widgetSize?.scale ?? 1;

  const [inputValues, setInputValues] = useState<Record<number, string>>({});
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; itemIndex: number; value: number } | null>(null);

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

  // Check first item for map availability
  if (config.items.length > 0) {
    const firstItem = config.items[0];
    const errorState = getWidgetError(firstItem.source, firstItem.address);
    if (errorState) return errorState;
  }

  const handleWrite = (item: DataTableItem, itemIndex: number) => {
    if (isEditMode || !state.connection?.connected) return;

    const raw = inputValues[itemIndex];
    if (raw === undefined || raw === '') return;

    const result = parseWriteInput(raw, item.format ?? 'decimal');
    if (result.ok === false) {
      showError(result.error);
      return;
    }
    const numValue = result.value;

    if (item.min !== undefined && numValue < item.min) {
      showError(`Value must be at least ${item.min}`);
      return;
    }
    if (item.max !== undefined && numValue > item.max) {
      showError(`Value must be at most ${item.max}`);
      return;
    }

    const step = item.step ?? 1;
    if (step > 0 && numValue % step !== 0) {
      showError(`Value must be a multiple of ${step} (e.g. 0, ${step}, ${step * 2}...)`);
      return;
    }

    if (config.confirmWrites) {
      setConfirmDialog({ open: true, itemIndex, value: numValue });
    } else {
      executeWrite(item, numValue, itemIndex);
    }
  };

  const executeWrite = (item: DataTableItem, value: number, itemIndex: number) => {
    setConfirmDialog(null);
    try {
      if (item.source === 'register') {
        actions.writeRegister(item.address, value);
        showSuccess(`Wrote ${value} to register ${item.address}`);
      } else {
        actions.writeParameter(item.address, value);
        showSuccess(`Wrote ${value} to parameter ${item.address}`);
      }
      setInputValues(prev => ({ ...prev, [itemIndex]: '' }));
    } catch (error) {
      showError(`Failed to write: ${error}`);
    }
  };

  const autoCompact = widgetSize ? widgetSize.width < 200 || widgetSize.height < 120 : false;
  const effectiveCompact = config.compact || autoCompact;
  const cellPadding = effectiveCompact ? '2px 4px' : '4px 8px';
  const fontSize = `${config.valueFontSize ?? 0.75}rem`;
  const headerFontSize = '0.6rem';
  const connected = state.connection?.connected ?? false;

  // Hide columns adaptively based on available width
  const showUnitColumn = !widgetSize || widgetSize.width >= 200;

  // Show write column only if at least one item is writable
  const hasWritableItems = config.items.some(item => isItemWritable(item.source, item.address));
  const showWriteColumn = hasWritableItems && (!widgetSize || widgetSize.width >= 280);

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0.5 }}>
        {/* Widget Label */}
        <Typography
          variant="overline"
          sx={{
            color: 'text.secondary',
            fontSize: scaledRem(0.6, scale),
            letterSpacing: '0.1em',
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
                <th style={{ padding: cellPadding, textAlign: 'left', borderBottom: `1px solid ${c.ghost20}` }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: headerFontSize, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Name
                  </Typography>
                </th>
                <th style={{ padding: cellPadding, textAlign: 'right', borderBottom: `1px solid ${c.ghost20}` }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: headerFontSize, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Value
                  </Typography>
                </th>
                {showUnitColumn && (
                  <th style={{ padding: cellPadding, textAlign: 'left', borderBottom: `1px solid ${c.ghost20}` }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: headerFontSize, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Unit
                    </Typography>
                  </th>
                )}
                {showWriteColumn && (
                  <th style={{ padding: cellPadding, textAlign: 'right', borderBottom: `1px solid ${c.ghost20}` }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: headerFontSize, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Write
                    </Typography>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {config.items.map((item, index) => {
                const data = item.source === 'register'
                  ? state.registers.get(item.address)
                  : item.source === 'sysRegister'
                  ? state.systemRegisters.get(item.address)
                  : state.parameters.get(item.address);
                const value = data?.value !== undefined ? (data.value as number) : undefined;
                const isInvalid = data?.valid === false;
                const writable = isItemWritable(item.source, item.address);
                const striped = config.striped && index % 2 === 1;

                return (
                  <tr key={`${item.source}-${item.address}-${index}`} style={{ backgroundColor: striped ? c.ghost : 'transparent' }}>
                    {/* Name */}
                    <td style={{ padding: cellPadding }}>
                      <Typography sx={{ fontSize, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                        {item.label}
                      </Typography>
                    </td>

                    {/* Value */}
                    <td style={{ padding: cellPadding, textAlign: 'right' }}>
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize, fontWeight: 600, color: isInvalid ? 'error.main' : 'text.primary' }}>
                        {formatValue(value, item.format, item.decimals)}
                      </Typography>
                    </td>

                    {/* Unit */}
                    {showUnitColumn && (
                      <td style={{ padding: cellPadding }}>
                        <Typography sx={{ fontSize, color: 'text.secondary' }}>
                          {item.unit ?? ''}
                        </Typography>
                      </td>
                    )}

                    {/* Write input or read-only indicator */}
                    {showWriteColumn && (
                      <td style={{ padding: cellPadding, textAlign: 'right' }}>
                        {writable ? (
                          <Box
                            component="form"
                            onSubmit={(e: React.FormEvent) => { e.preventDefault(); handleWrite(item, index); }}
                            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.3em', fontSize }}
                          >
                            <input
                              type="text"
                              value={inputValues[index] ?? ''}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValues(prev => ({ ...prev, [index]: filterWriteInput(e.target.value, item.format ?? 'decimal') }))}
                              disabled={isEditMode || !connected}
                              placeholder={
                                item.format === 'hex' ? '0x0000' :
                                item.format === 'binary' ? '0b0000' :
                                value !== undefined ? String(value) : '0'
                              }
                              onFocus={e => { e.currentTarget.style.borderColor = 'var(--mui-palette-primary-main, #00D4FF)'; }}
                              onBlur={e => { e.currentTarget.style.borderColor = c.ghost20; }}
                              style={{
                                fontFamily: FONT_MONO,
                                fontSize: 'inherit',
                                lineHeight: 1.2,
                                height: '1.4em',
                                width: '6em',
                                padding: '0 0.3em',
                                textAlign: 'right',
                                border: `1px solid ${c.ghost20}`,
                                borderRadius: '3px',
                                background: 'transparent',
                                color: 'inherit',
                                outline: 'none',
                                opacity: (isEditMode || !connected) ? 0.4 : 1,
                                boxSizing: 'border-box',
                              }}
                            />
                            <Box
                              component="button"
                              type="submit"
                              disabled={isEditMode || !connected || !inputValues[index]}
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                color: 'primary.main',
                                fontSize: 'inherit',
                                lineHeight: 1,
                                '&:disabled': { opacity: 0.3, cursor: 'default' },
                              }}
                            >
                              <SendIcon sx={{ fontSize: '1em' }} />
                            </Box>
                          </Box>
                        ) : (
                          <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', fontStyle: 'italic' }}>
                            read-only
                          </Typography>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>

        {/* Connection Status */}
        {!connected && (
          <Typography variant="caption" color="error" sx={{ textAlign: 'center', flexShrink: 0 }}>
            Not connected
          </Typography>
        )}
      </Box>

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog(null)}>
          <DialogTitle>Confirm Write</DialogTitle>
          <DialogContent>
            <Typography>
              Write <strong>{confirmDialog.value}</strong> to{' '}
              {config.items[confirmDialog.itemIndex].source}{' '}
              <strong>{config.items[confirmDialog.itemIndex].address}</strong>?
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button
              onClick={() => executeWrite(config.items[confirmDialog.itemIndex], confirmDialog.value, confirmDialog.itemIndex)}
              variant="contained"
              color="primary"
            >
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
