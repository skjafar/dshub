import React, { useState } from 'react';
import { Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';
import { ControlTableWidgetConfig, ControlTableRow } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, scaledPx } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefreshMulti } from '../../hooks/useAutoRefresh';
import { useToast } from '../ToastNotification';
import { getWidgetError } from './WidgetErrorState';
import { FONT_MONO } from '../../theme';
import { mapManager } from '../../maps/mapManager';

interface ControlTableWidgetProps {
  config: ControlTableWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

/** Check if a row's address is writable based on the data map.
 *  Parameters are always writable. Registers depend on accessPermit. */
function isRowWritable(source: string, address: number): boolean {
  if (source === 'parameter') return true;
  if (source === 'register') {
    const entry = mapManager.getRegisterByAddress(address);
    return entry?.accessPermit === 'READ_WRITE';
  }
  return false;
}

/**
 * Control Table Widget
 *
 * Hybrid read/write table. Writability is auto-detected from the data map:
 * - Registers marked READ_WRITE and all parameters show an inline write input
 * - Registers marked READ_ONLY display only the current value
 */
export default function ControlTableWidget({ config, isEditMode, widgetSize }: ControlTableWidgetProps): React.ReactElement {
  const { state, actions } = useDSHub();
  const { showSuccess, showError } = useToast();
  const scale = widgetSize?.scale ?? 1;

  // Input state per writable row, keyed by index
  const [inputValues, setInputValues] = useState<Record<number, string>>({});
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; rowIndex: number; value: number } | null>(null);

  // Build items for useAutoRefreshMulti from rows
  const refreshItems = config.rows.map(row => ({
    label: row.label,
    source: row.source,
    address: row.address,
  }));

  useAutoRefreshMulti({
    items: refreshItems,
    refreshInterval: config.refreshInterval,
    isEditMode,
  });

  // Check first row for map availability
  if (config.rows.length > 0) {
    const first = config.rows[0];
    const errorState = getWidgetError(first.source, first.address);
    if (errorState) return errorState;
  }

  const handleWrite = (row: ControlTableRow, rowIndex: number) => {
    if (isEditMode || !state.connection?.connected) return;

    const raw = inputValues[rowIndex];
    if (raw === undefined || raw === '') return;

    const numValue = parseFloat(raw);
    if (isNaN(numValue)) {
      showError('Invalid number');
      return;
    }
    if (row.min !== undefined && numValue < row.min) {
      showError(`Value must be at least ${row.min}`);
      return;
    }
    if (row.max !== undefined && numValue > row.max) {
      showError(`Value must be at most ${row.max}`);
      return;
    }

    if (config.confirmWrites) {
      setConfirmDialog({ open: true, rowIndex, value: numValue });
    } else {
      executeWrite(row, numValue, rowIndex);
    }
  };

  const executeWrite = (row: ControlTableRow, value: number, rowIndex: number) => {
    setConfirmDialog(null);
    try {
      if (row.source === 'register') {
        actions.writeRegister(row.address, value);
        showSuccess(`Wrote ${value} to register ${row.address}`);
      } else {
        actions.writeParameter(row.address, value);
        showSuccess(`Wrote ${value} to parameter ${row.address}`);
      }
      setInputValues(prev => ({ ...prev, [rowIndex]: '' }));
    } catch (error) {
      showError(`Failed to write: ${error}`);
    }
  };

  const cellPadding = config.compact ? '2px 4px' : '4px 8px';
  const fontSize = scaledRem(config.valueFontSize ?? 0.75, scale);
  const headerFontSize = scaledRem(0.6, scale);
  const connected = state.connection?.connected ?? false;

  return (
    <>
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
                    Current
                  </Typography>
                </th>
                <th style={{ padding: cellPadding, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: headerFontSize, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Unit
                  </Typography>
                </th>
                <th style={{ padding: cellPadding, textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: headerFontSize, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Write
                  </Typography>
                </th>
              </tr>
            </thead>
            <tbody>
              {config.rows.map((row, index) => {
                const data = row.source === 'register'
                  ? state.registers.get(row.address)
                  : state.parameters.get(row.address);
                const value = data?.value !== undefined ? (data.value as number) : undefined;
                const isInvalid = data?.valid === false;
                const writable = isRowWritable(row.source, row.address);
                const striped = index % 2 === 1;

                return (
                  <tr key={`${row.source}-${row.address}-${index}`} style={{ backgroundColor: striped ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                    {/* Name */}
                    <td style={{ padding: cellPadding }}>
                      <Typography sx={{ fontSize, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: scaledPx(120, scale) }}>
                        {row.label}
                      </Typography>
                    </td>

                    {/* Current Value */}
                    <td style={{ padding: cellPadding, textAlign: 'right' }}>
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize, fontWeight: 600, color: isInvalid ? 'error.main' : 'text.primary' }}>
                        {value !== undefined ? value.toLocaleString() : '---'}
                      </Typography>
                    </td>

                    {/* Unit */}
                    <td style={{ padding: cellPadding }}>
                      <Typography sx={{ fontSize, color: 'text.secondary' }}>
                        {row.unit ?? ''}
                      </Typography>
                    </td>

                    {/* Write Input or empty */}
                    <td style={{ padding: cellPadding, textAlign: 'right' }}>
                      {writable ? (
                        <Box
                          component="form"
                          onSubmit={(e: React.FormEvent) => { e.preventDefault(); handleWrite(row, index); }}
                          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.3em', fontSize }}
                        >
                          <Box
                            component="input"
                            type="number"
                            value={inputValues[index] ?? ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValues(prev => ({ ...prev, [index]: e.target.value }))}
                            disabled={isEditMode || !connected}
                            placeholder={value !== undefined ? String(value) : ''}
                            min={row.min}
                            max={row.max}
                            step={row.step ?? 1}
                            sx={{
                              fontFamily: FONT_MONO,
                              fontSize: 'inherit',
                              lineHeight: 1.2,
                              height: '1.4em',
                              width: '6em',
                              padding: '0 0.3em',
                              textAlign: 'right',
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: '3px',
                              bgcolor: 'transparent',
                              color: 'text.primary',
                              outline: 'none',
                              '&:focus': { borderColor: 'primary.main' },
                              '&:disabled': { opacity: 0.4 },
                              /* Hide number spinners */
                              '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
                                WebkitAppearance: 'none',
                                margin: 0,
                              },
                              MozAppearance: 'textfield',
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
                        <Typography sx={{ fontSize: scaledRem(0.6, scale), color: 'text.disabled', fontStyle: 'italic' }}>
                          read-only
                        </Typography>
                      )}
                    </td>
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
              {config.rows[confirmDialog.rowIndex].source}{' '}
              <strong>{config.rows[confirmDialog.rowIndex].address}</strong>?
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button
              onClick={() => executeWrite(config.rows[confirmDialog.rowIndex], confirmDialog.value, confirmDialog.rowIndex)}
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
