import React, { useState } from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';
import { DropdownWidgetConfig } from '../../types/dashboard';
import { useDSHub } from '../../contexts/DSHubContext';
import { useToast } from '../ToastNotification';

interface DropdownWidgetProps {
  config: DropdownWidgetConfig;
  isEditMode: boolean;
}

export default function DropdownWidget({ config, isEditMode }: DropdownWidgetProps) {
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

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'center',
          gap: 2
        }}
      >
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
          {config.label}
        </Typography>

        <FormControl fullWidth disabled={isEditMode || !state.connection?.connected}>
          <InputLabel id={`dropdown-${config.address}-label`}>Select Value</InputLabel>
          <Select
            labelId={`dropdown-${config.address}-label`}
            value={selectedValue}
            onChange={(e) => handleChange(e.target.value as number)}
            label="Select Value"
          >
            {config.options.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label} ({option.value})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {!state.connection?.connected && (
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
