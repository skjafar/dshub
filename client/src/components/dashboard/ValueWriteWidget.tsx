import React, { useState } from 'react';
import { Box, TextField, Button, Dialog, DialogTitle, DialogContent, DialogActions, Typography } from '@mui/material';
import { ValueWriteWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useToast } from '../ToastNotification';
import { FONT_MONO } from '../../theme';

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isEditMode || !state.connection?.connected) return;

    const numValue = parseFloat(inputValue);

    // Validation
    if (isNaN(numValue)) {
      showError('Invalid number');
      return;
    }

    if (config.min !== undefined && numValue < config.min) {
      showError(`Value must be at least ${config.min}`);
      return;
    }

    if (config.max !== undefined && numValue > config.max) {
      showError(`Value must be at most ${config.max}`);
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

  return (
    <>
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'center',
          gap: 1.5
        }}
      >
        <Typography variant="overline" sx={{ color: 'text.secondary', fontSize: widgetSize ? scaledRem(0.6, widgetSize.scale) : '0.6rem', letterSpacing: '0.08em' }}>
          {config.label}
        </Typography>

        <TextField
          type={config.inputType}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isEditMode || !state.connection?.connected}
          fullWidth
          size="small"
          label="Value"
          inputProps={{
            min: config.min,
            max: config.max,
            step: config.step || 1
          }}
          sx={{ '& .MuiInputBase-input': { fontFamily: FONT_MONO, fontSize: widgetSize ? scaledRem(config.valueFontSize ?? 0.8125, widgetSize.scale) : `${config.valueFontSize ?? 0.8125}rem` } }}
          helperText={
            config.min !== undefined && config.max !== undefined
              ? `Range: ${config.min} - ${config.max}`
              : ''
          }
        />

        {!state.connection?.connected && (
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
