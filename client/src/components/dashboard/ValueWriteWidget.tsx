import React, { useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, Typography } from '@mui/material';
import { ValueWriteWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, getOrientation, isCompactSize } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useToast } from '../ToastNotification';
import { FONT_MONO } from '../../theme';
import { parseWriteInput, formatInputHint, isValidStep } from '../../utils/writeInputParse';
import { mapManager } from '../../maps/mapManager';
import { DataForm } from '../../maps/mapParser';
import { getWireValue, getPlotValue } from '../../utils/dataTableUtils';
import { resolveThumbwheelFormat, formatForThumbwheel, initialFractionDigits } from '../../utils/thumbwheel';
import ThumbwheelInput from '../ThumbwheelInput';

interface ValueWriteWidgetProps {
  config: ValueWriteWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

export default function ValueWriteWidget({ config, isEditMode, widgetSize }: ValueWriteWidgetProps) {
  const { state, actions } = useDSHub();
  const { showSuccess, showError } = useToast();
  const [inputValue, setInputValue] = useState<string>('');
  const [isFocused, setIsFocused] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [pendingValue, setPendingValue] = useState<number | null>(null);

  const format = config.format ?? 'decimal';
  const mapEntry = mapManager.getEntryBySource(config.target, config.address);
  const isFloat = mapEntry?.type === DataForm.FLOAT;

  // Always show the live register/parameter value — including once a write is
  // confirmed, since confirmations land via the same registerUpdate/parameterUpdate
  // events as ordinary reads. Skipped while the user is actively editing.
  const liveData = config.target === 'register' ? state.registers.get(config.address) : state.parameters.get(config.address);
  const liveValue = liveData?.value !== undefined ? getPlotValue(liveData.value, mapEntry) : null;

  useEffect(() => {
    if (isFocused) return;
    if (liveValue === null) {
      setInputValue('');
      return;
    }
    const fractionDigits = isFloat ? initialFractionDigits(liveValue) : undefined;
    setInputValue(formatForThumbwheel(liveValue, resolveThumbwheelFormat(format, isFloat), fractionDigits));
  }, [liveValue, isFocused, format, isFloat]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isEditMode || !state.connection?.connected) return;

    const result = parseWriteInput(inputValue, format);
    if (result.ok === false) {
      showError(result.error);
      return;
    }
    const numValue = result.value;

    if (config.min !== undefined && numValue < config.min) {
      showError(`Value must be at least ${config.min}`);
      return;
    }

    if (config.max !== undefined && numValue > config.max) {
      showError(`Value must be at most ${config.max}`);
      return;
    }

    if (!isValidStep(numValue, config.step)) {
      showError(`Value must be a multiple of ${config.step} (e.g. 0, ${config.step}, ${(config.step ?? 0) * 2}...)`);
      return;
    }

    if (config.confirmationRequired) {
      setPendingValue(numValue);
      setConfirmDialog(true);
    } else {
      executeWrite(numValue);
    }
  };

  const executeWrite = (value: number) => {
    setConfirmDialog(false);

    try {
      const wireValue = getWireValue(value, mapEntry);
      if (config.target === 'register') {
        actions.writeRegister(config.address, wireValue);
        showSuccess(`Wrote ${value} to register ${config.address}`);
      } else {
        actions.writeParameter(config.address, wireValue);
        showSuccess(`Wrote ${value} to parameter ${config.address}`);
      }
      // Input keeps showing the pending value until the device-confirmed value
      // arrives via registerUpdate/parameterUpdate and the sync effect updates it.
    } catch (error) {
      showError(`Failed to write value: ${error}`);
    }
  };

  const orientation = widgetSize ? getOrientation(widgetSize) : 'square';
  const compact = widgetSize ? isCompactSize(widgetSize) : false;
  const isLandscape = orientation === 'landscape';

  const inputHint = formatInputHint(format, config.min, config.max);

  return (
    <>
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          display: 'flex',
          flexDirection: isLandscape ? 'row' : 'column',
          height: '100%',
          justifyContent: isLandscape ? 'space-between' : 'center',
          alignItems: isLandscape ? 'center' : undefined,
          gap: 1.5
        }}
      >
        <Typography variant="overline" sx={{ color: 'text.secondary', fontSize: widgetSize ? scaledRem(0.6, widgetSize.scale) : '0.6rem', letterSpacing: '0.1em', flexShrink: 0 }}>
          {config.label}
        </Typography>

        <ThumbwheelInput
          value={inputValue}
          onChange={setInputValue}
          writeFormat={format}
          isFloat={isFloat}
          min={config.min}
          max={config.max}
          disabled={isEditMode || !state.connection?.connected}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          fullWidth={!isLandscape}
          size="small"
          label="Value"
          placeholder={format === 'hex' ? '0x0000' : format === 'binary' ? '0b00000000' : '0'}
          slotProps={{ htmlInput: { inputMode: format === 'decimal' ? 'numeric' : 'text' } }}
          sx={{
            ...(isLandscape && { flex: 1, maxWidth: '65%' }),
            '& .MuiInputBase-input': { fontFamily: FONT_MONO, fontSize: widgetSize ? scaledRem(config.valueFontSize ?? 0.8125, widgetSize.scale) : `${config.valueFontSize ?? 0.8125}rem` },
          }}
          helperText={!compact ? inputHint : ''}
        />

        {!compact && !state.connection?.connected && (
          <Typography variant="caption" color="error" sx={{ textAlign: 'center' }}>
            Not connected
          </Typography>
        )}
      </Box>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
        <DialogTitle>Confirm Write</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to write <strong>{pendingValue}</strong> to{' '}
            {config.target} <strong>{config.address}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(false)}>Cancel</Button>
          <Button
            onClick={() => pendingValue !== null && executeWrite(pendingValue)}
            variant="contained"
            color="primary"
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
