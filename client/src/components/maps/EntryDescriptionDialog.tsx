import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Divider
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { ValueDescriptor } from '../../maps/mapParser';
import { FONT_MONO } from '../../theme';

interface EntryDescriptionDialogProps {
  open: boolean;
  entryName: string;
  initialDescription: string;
  initialValueList: ValueDescriptor[];
  onSave: (description: string, valueList: ValueDescriptor[]) => void;
  onClose: () => void;
}

export default function EntryDescriptionDialog({
  open,
  entryName,
  initialDescription,
  initialValueList,
  onSave,
  onClose
}: EntryDescriptionDialogProps) {
  // The parent mounts this dialog only when an entry is selected and unmounts it
  // on close, so initial values are seeded correctly on each open. Don't sync from
  // props after mount: parent re-renders (driven by DSHubContext events) pass a
  // fresh [] for the valueList default and would clobber the user's typing.
  const [description, setDescription] = useState(initialDescription);
  const [valueList, setValueList] = useState<ValueDescriptor[]>(initialValueList);

  const handleAddRow = () => {
    setValueList(prev => [...prev, { value: '', label: '' }]);
  };

  const handleDeleteRow = (index: number) => {
    setValueList(prev => prev.filter((_, i) => i !== index));
  };

  const handleValueChange = (index: number, field: keyof ValueDescriptor, val: string) => {
    setValueList(prev => prev.map((row, i) => i === index ? { ...row, [field]: val } : row));
  };

  const handleSave = () => {
    // Filter out rows with empty value AND empty label
    const cleaned = valueList.filter(row => row.value.trim() !== '' || row.label.trim() !== '');
    onSave(description.trim(), cleaned);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onKeyDown={handleKeyDown}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { minHeight: 400 } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" component="span">Description</Typography>
        <Typography
          variant="body2"
          component="span"
          sx={{ ml: 1.5, fontFamily: FONT_MONO, color: 'text.secondary', fontSize: '0.8125rem' }}
        >
          {entryName}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <TextField
          label="Description"
          multiline
          rows={4}
          fullWidth
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this register/parameter does..."
          size="small"
          sx={{ mb: 2.5 }}
        />

        <Divider sx={{ mb: 2 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Value List
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAddRow}
            variant="outlined"
          >
            Add Value
          </Button>
        </Box>

        {valueList.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ py: 1, fontStyle: 'italic' }}>
            No values defined. Add named values for enum-like fields.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Value</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Label</TableCell>
                <TableCell sx={{ width: 40 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {valueList.map((row, index) => (
                <TableRow key={index}>
                  <TableCell sx={{ py: 0.5 }}>
                    <TextField
                      value={row.value}
                      onChange={(e) => handleValueChange(index, 'value', e.target.value)}
                      size="small"
                      fullWidth
                      placeholder="0"
                      sx={{ '& .MuiInputBase-input': { fontFamily: FONT_MONO, fontSize: '0.8125rem' } }}
                    />
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    <TextField
                      value={row.label}
                      onChange={(e) => handleValueChange(index, 'label', e.target.value)}
                      size="small"
                      fullWidth
                      placeholder="Description"
                    />
                  </TableCell>
                  <TableCell sx={{ py: 0.5, px: 0.5 }}>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteRow(index)}
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button onClick={handleSave} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
}
