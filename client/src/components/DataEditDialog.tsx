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
import { parseWriteValue, filterWriteValueFromMap } from '../utils/dataTableUtils';

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

  useEffect(() => {
    if (item) {
      setValueStr(String(item.value ?? 0));
    }
  }, [item]);

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
        <TextField
          autoFocus
          margin="dense"
          label="Value"
          type="text"
          fullWidth
          variant="outlined"
          value={valueStr}
          placeholder={placeholder}
          onChange={(e) => setValueStr(filterWriteValueFromMap(e.target.value, mapEntry))}
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
