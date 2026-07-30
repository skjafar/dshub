import React, { useEffect, useState } from 'react';
import { Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button, useTheme } from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';
import { DataTableWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefreshMulti } from '../../hooks/useAutoRefresh';
import { useToast } from '../ToastNotification';
import { getWidgetError } from './WidgetErrorState';
import { FONT_MONO } from '../../design/tokens';
import { mapManager } from '../../maps/mapManager';
import { DataForm } from '../../maps/mapParser';
import { parseWriteInput, WriteFormat, isValidStep } from '../../utils/writeInputParse';
import { getPlotValue, getWireValue } from '../../utils/dataTableUtils';
import { resolveThumbwheelFormat, formatForThumbwheel, initialFractionDigits } from '../../utils/thumbwheel';
import { formatDeviceValue } from '../../utils/numberFormat';
import ThumbwheelInput from '../ThumbwheelInput';

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

interface DataTableWriteCellProps {
  format: WriteFormat;
  isFloat: boolean;
  min?: number;
  max?: number;
  liveValue: number | undefined;
  disabled: boolean;
  fontSize: string;
  placeholder: string;
  onSubmit: (raw: string) => void;
}

/**
 * A single writable table row's entry field: always mirrors the row's live
 * register/parameter value (until the user starts editing it), and supports
 * thumbwheel digit editing via ThumbwheelInput.
 */
export function DataTableWriteCell({ format, isFloat, min, max, liveValue, disabled, fontSize, placeholder, onSubmit }: DataTableWriteCellProps) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  // False while the field still shows the device's own value verbatim.
  const [isEdited, setIsEdited] = useState(false);
  const thumbwheelFormat = resolveThumbwheelFormat(format, isFloat);

  useEffect(() => {
    if (isFocused) return;
    if (liveValue === undefined) {
      setValue('');
      setIsEdited(false);
      return;
    }
    const fractionDigits = isFloat ? initialFractionDigits(liveValue) : undefined;
    setValue(formatForThumbwheel(liveValue, thumbwheelFormat, fractionDigits));
    setIsEdited(false);
  }, [liveValue, isFocused, thumbwheelFormat, isFloat]);

  /**
   * What to actually write. The field shows the value rounded to the display
   * precision, so submitting an untouched field must send the device's exact
   * value — otherwise merely clicking Send would quietly round a live parameter.
   */
  const submittedValue = (): string =>
    isEdited || liveValue === undefined ? value : String(liveValue);

  return (
    <Box
      component="form"
      autoComplete="off"
      onSubmit={(e: React.FormEvent) => { e.preventDefault(); onSubmit(submittedValue()); }}
      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.3em', fontSize }}
    >
      <ThumbwheelInput
        value={value}
        onChange={(next) => { setValue(next); setIsEdited(true); }}
        writeFormat={format}
        isFloat={isFloat}
        min={min}
        max={max}
        disabled={disabled}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        size="small"
        sx={{
          width: '6em',
          '& .MuiInputBase-input': { fontFamily: FONT_MONO, fontSize: 'inherit', textAlign: 'right', py: '2px' },
        }}
      />
      <Box
        component="button"
        type="submit"
        disabled={disabled || !value}
        aria-label="Send value"
        title="Send value"
        // Keep focus in the field while the button is pressed. Without this the
        // mousedown blurs the input, which flips `isFocused` and lets the live-value
        // sync effect overwrite what the user typed — so the click would submit the
        // device's old value instead of the new one. Enter never hit this because
        // the field is still focused when the form submits.
        onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
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
  );
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

  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; itemIndex: number; value: number } | null>(null);

  useAutoRefreshMulti({
    items: config.items,
    refreshInterval: config.refreshInterval,
    isEditMode,
  });

  const formatValue = (value: number | undefined, isFloat: boolean, format?: string, decimals?: number, scientific?: boolean): string => {
    if (value === undefined) return '---';
    switch (format) {
      case 'hex':
        return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
      case 'binary':
        return `0b${value.toString(2).padStart(8, '0')}`;
      case 'decimal':
      default:
        return formatDeviceValue(value, { isFloat, decimals, scientific });
    }
  };

  // Check first item for map availability
  if (config.items.length > 0) {
    const firstItem = config.items[0];
    const errorState = getWidgetError(firstItem.source, firstItem.address);
    if (errorState) return errorState;
  }

  const handleWrite = (item: DataTableItem, itemIndex: number, raw: string) => {
    if (isEditMode || !state.connection?.connected) return;

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

    if (!isValidStep(numValue, item.step)) {
      showError(`Value must be a multiple of ${item.step} (e.g. 0, ${item.step}, ${(item.step ?? 0) * 2}...)`);
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
      const mapEntry = mapManager.getEntryBySource(item.source, item.address);
      const wireValue = getWireValue(value, mapEntry);
      if (item.source === 'register') {
        actions.writeRegister(item.address, wireValue);
        showSuccess(`Wrote ${value} to register ${item.address}`);
      } else {
        actions.writeParameter(item.address, wireValue);
        showSuccess(`Wrote ${value} to parameter ${item.address}`);
      }
      // Cell keeps showing the pending value until the device-confirmed value
      // arrives via registerUpdate/parameterUpdate and its sync effect updates it.
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
                const itemMapEntry = mapManager.getEntryBySource(item.source, item.address);
                const value = data?.value !== undefined ? getPlotValue(data.value, itemMapEntry) : undefined;
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
                        {formatValue(value, itemMapEntry?.type === DataForm.FLOAT, item.format, item.decimals, item.scientificNotation)}
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
                          <DataTableWriteCell
                            format={item.format ?? 'decimal'}
                            isFloat={itemMapEntry?.type === DataForm.FLOAT}
                            min={item.min}
                            max={item.max}
                            liveValue={value}
                            disabled={isEditMode || !connected}
                            fontSize={fontSize}
                            placeholder={item.format === 'hex' ? '0x0000' : item.format === 'binary' ? '0b0000' : '0'}
                            onSubmit={(raw) => handleWrite(item, index, raw)}
                          />
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
