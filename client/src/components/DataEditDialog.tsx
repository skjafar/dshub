import { useState, useEffect } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import { MapEntry } from '../maps/mapParser';
import { parseWriteValue, getPlotValue } from '../utils/dataTableUtils';
import { resolveThumbwheelFormat, formatForThumbwheel, initialFractionDigits } from '../utils/thumbwheel';
import ThumbwheelInput from './ThumbwheelInput';

interface DataEditDialogProps {
  open: boolean;
  /** "Register" or "Parameter" — used in dialog title */
  dataType: 'Register' | 'Parameter';
  item: { address: number; name: string; value: number | null } | null;
  mapEntry?: MapEntry;
  onClose: () => void;
  onWrite: (address: number, value: number) => void;
}

export function DataEditDialog({ open, dataType, item, mapEntry, onClose, onWrite }: DataEditDialogProps) {
  const [valueStr, setValueStr] = useState('');

  const isFloat = mapEntry?.type === 'float';
  const writeFormat: 'decimal' | 'hex' = mapEntry?.showAsHex ? 'hex' : 'decimal';

  useEffect(() => {
    if (item) {
      const decoded = item.value !== null ? getPlotValue(item.value, mapEntry) : 0;
      const fractionDigits = isFloat ? initialFractionDigits(decoded) : undefined;
      setValueStr(formatForThumbwheel(decoded, resolveThumbwheelFormat(writeFormat, isFloat), fractionDigits));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, mapEntry]);

  const handleWrite = () => {
    if (item) {
      const parsed = parseWriteValue(valueStr, mapEntry);
      if (parsed.value === null) return;
      onWrite(item.address, parsed.value);
      onClose();
    }
  };

  const placeholder = mapEntry?.showAsHex ? '0x0000' : '0';

  const helperText = mapEntry?.showAsHex
    ? 'Hex input (e.g. 1A2B or 0x1A2B)'
    : mapEntry?.type === 'float'
      ? 'Float value'
      : dataType === 'Parameter'
        ? 'Parameter values persist across device resets'
        : 'Integer value';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Edit {dataType} {item?.name || ''} (0x{item?.address.toString(16).toUpperCase()})
      </DialogTitle>
      <DialogContent>
        <ThumbwheelInput
          autoFocus
          margin="dense"
          label="Value"
          fullWidth
          variant="outlined"
          value={valueStr}
          onChange={setValueStr}
          writeFormat={writeFormat}
          isFloat={isFloat}
          placeholder={placeholder}
          sx={{ mt: 2 }}
          helperText={helperText}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleWrite} variant="contained">
          Write
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface DataReadDialogProps {
  open: boolean;
  /** "Register" or "Parameter" — used in dialog title and labels */
  dataType: 'Register' | 'Parameter';
  onClose: () => void;
  onRead: (address: number) => void;
  helperText?: string;
}

export function DataReadDialog({ open, dataType, onClose, onRead, helperText }: DataReadDialogProps) {
  const [address, setAddress] = useState(0);

  const handleRead = () => {
    onRead(address);
    onClose();
    setAddress(0);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Read {dataType}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label={`${dataType} Address (decimal)`}
          type="number"
          fullWidth
          variant="outlined"
          value={address}
          onChange={(e) => setAddress(Number(e.target.value))}
          sx={{ mt: 2 }}
          helperText={helperText ?? `Enter the ${dataType.toLowerCase()} address in decimal format`}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleRead} variant="contained" disabled={address <= 0}>
          Read
        </Button>
      </DialogActions>
    </Dialog>
  );
}
