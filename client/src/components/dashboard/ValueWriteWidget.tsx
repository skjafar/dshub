import React, { useState } from 'react';
import { Box, TextField, Button, Dialog, DialogTitle, DialogContent, DialogActions, Typography } from '@mui/material';
import { ValueWriteWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, getOrientation, isCompactSize } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useToast } from '../ToastNotification';
import { FONT_MONO } from '../../theme';
import { parseWriteInput, formatInputHint, filterWriteInput } from '../../utils/writeInputParse';

interface ValueWriteWidgetProps {
  config: ValueWriteWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

export default function ValueWriteWidget({ config, isEditMode, widgetSize }: ValueWriteWidgetProps) {
  const { state, actions } = useDSHub();
  const { showSuccess, showError } = useToast();
  const [inputValue, setInputValue] = useState<string>('');
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [pendingValue, setPendingValue] = useState<number | null>(null);

  const format = config.format ?? 'decimal';

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

    const step = config.step ?? 1;
    if (step > 0 && numValue % step !== 0) {
      showError(`Value must be a multiple of ${step} (e.g. 0, ${step}, ${step * 2}...)`);
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
      if (config.target === 'register') {
        actions.writeRegister(config.address, value);
        showSuccess(`Wrote ${value} to register ${config.address}`);
      } else {
        actions.writeParameter(config.address, value);
        showSuccess(`Wrote ${value} to parameter ${config.address}`);
      }
      setInputValue(''); // Clear input after successful write
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
        <Typography variant="overline" sx={{ color: 'text.secondary', fontSize: widgetSize ? scaledRem(0.6, widgetSize.scale) : '0.6rem', letterSpacing: '0.08em', flexShrink: 0 }}>
          {config.label}
        </Typography>

        <TextField
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(filterWriteInput(e.target.value, format))}
          disabled={isEditMode || !state.connection?.connected}
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
