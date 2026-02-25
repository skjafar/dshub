import React, { useState } from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';
import { DropdownWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, getOrientation, isCompactSize } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useToast } from '../ToastNotification';
import { FONT_MONO } from '../../theme';

interface DropdownWidgetProps {
  config: DropdownWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

export default function DropdownWidget({ config, isEditMode, widgetSize }: DropdownWidgetProps) {
  const { state, actions } = useDSHub();
  const { showSuccess, showError } = useToast();
  const [selectedValue, setSelectedValue] = useState<number | ''>('');
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [pendingValue, setPendingValue] = useState<{ label: string; value: number } | null>(null);

  const handleChange = (value: number) => {
    if (isEditMode || !state.connection?.connected) return;

    const option = config.options.find(opt => opt.value === value);
    if (!option) return;

    if (config.confirmationRequired) {
      setPendingValue(option);
      setConfirmDialog(true);
    } else {
      executeWrite(option.value);
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
      setSelectedValue(value);
    } catch (error) {
      showError(`Failed to write value: ${error}`);
    }
  };

  const orientation = widgetSize ? getOrientation(widgetSize) : 'square';
  const compact = widgetSize ? isCompactSize(widgetSize) : false;
  const isLandscape = orientation === 'landscape';

  return (
    <>
      <Box
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

        <FormControl fullWidth={!isLandscape} disabled={isEditMode || !state.connection?.connected} sx={isLandscape ? { flex: 1, maxWidth: '65%' } : undefined}>
          <InputLabel id={`dropdown-${config.address}-label`}>Select Value</InputLabel>
          <Select
            labelId={`dropdown-${config.address}-label`}
            value={selectedValue}
            onChange={(e) => handleChange(e.target.value as number)}
            label="Select Value"
            sx={{ fontFamily: FONT_MONO, fontSize: widgetSize ? scaledRem(config.valueFontSize ?? 0.8125, widgetSize.scale) : `${config.valueFontSize ?? 0.8125}rem` }}
          >
            {config.options.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label} ({option.value})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {!compact && !state.connection?.connected && (
          <Typography variant="caption" color="error" sx={{ textAlign: 'center' }}>
            Not connected
          </Typography>
        )}
      </Box>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
        <DialogTitle>Confirm Selection</DialogTitle>
        <DialogContent>
          {pendingValue && (
            <Typography>
              Are you sure you want to write <strong>{pendingValue.label}</strong> ({pendingValue.value}) to{' '}
              {config.target} <strong>{config.address}</strong>?
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(false)}>Cancel</Button>
          <Button
            onClick={() => pendingValue && executeWrite(pendingValue.value)}
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
