import React, { useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  FileDownload as FileDownloadIcon
} from '@mui/icons-material';
import { SysCommand } from '../../types/settings';
import SysCommandExportDialog from './SysCommandExportDialog';

interface SysCommandsTabProps {
  commands: SysCommand[];
  onCommandsChange: (commands: SysCommand[]) => void;
  readOnly?: boolean;
  profileName?: string;
  showAddDialog?: boolean;
  onAddDialogClose?: () => void;
  showExportDialog?: boolean;
  onExportDialogClose?: () => void;
}

interface CommandRowProps {
  command: SysCommand;
  index: number;
  commands: SysCommand[];
  onUpdate: (index: number, newCommand: SysCommand) => void;
  onDelete: (index: number) => void;
  readOnly: boolean;
}

function CommandRow({ command, index, commands, onUpdate, onDelete, readOnly }: CommandRowProps) {
  // Local state for editing
  const [editCode, setEditCode] = useState(command.code.toString());
  const [editName, setEditName] = useState(command.name);
  const [editDescription, setEditDescription] = useState(command.description || '');

  // Update local state when command changes
  React.useEffect(() => {
    setEditCode(command.code.toString());
    setEditName(command.name);
    setEditDescription(command.description || '');
  }, [command.code, command.name, command.description]);

  const handleCodeBlur = () => {
    const code = parseInt(editCode);

    if (isNaN(code) || code < 0 || code > 255) {
      setEditCode(command.code.toString()); // Revert if invalid
      return;
    }

    // Check for duplicate code (except current command)
    const duplicateIndex = commands.findIndex((cmd, idx) => cmd.code === code && idx !== index);
    if (duplicateIndex !== -1) {
      setEditCode(command.code.toString()); // Revert if duplicate
      return;
    }

    if (code !== command.code) {
      onUpdate(index, {
        code,
        name: editName.trim(),
        description: editDescription.trim() || undefined
      });
    }
  };

  const handleNameBlur = () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditName(command.name); // Revert if empty
      return;
    }

    if (trimmedName !== command.name) {
      onUpdate(index, {
        code: command.code,
        name: trimmedName,
        description: editDescription.trim() || undefined
      });
    }
  };

  const handleDescriptionBlur = () => {
    const trimmedDescription = editDescription.trim();
    if (trimmedDescription !== (command.description || '')) {
      onUpdate(index, {
        code: command.code,
        name: editName.trim(),
        description: trimmedDescription || undefined
      });
    }
  };

  return (
    <TableRow hover>
      <TableCell sx={{ width: '120px' }}>
        <TextField
          type="number"
          value={editCode}
          onChange={(e) => setEditCode(e.target.value)}
          onBlur={handleCodeBlur}
          size="small"
          fullWidth
          disabled={readOnly}
          slotProps={{
            htmlInput: { min: 0, max: 255 }
          }}
          sx={{ fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace' }}
        />
      </TableCell>
      <TableCell>
        <TextField
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleNameBlur}
          size="small"
          fullWidth
          disabled={readOnly}
          placeholder="Command name"
        />
      </TableCell>
      <TableCell>
        <TextField
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          onBlur={handleDescriptionBlur}
          size="small"
          fullWidth
          disabled={readOnly}
          placeholder="Optional description"
        />
      </TableCell>
      <TableCell align="right" sx={{ width: '80px' }}>
        <Tooltip title="Delete">
          <span>
            <IconButton
              size="small"
              onClick={() => onDelete(index)}
              disabled={readOnly}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}

export default function SysCommandsTab({
  commands,
  onCommandsChange,
  readOnly = false,
  profileName = 'Custom',
  showAddDialog = false,
  onAddDialogClose,
  showExportDialog = false,
  onExportDialogClose
}: SysCommandsTabProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; index: number | null }>({
    open: false,
    index: null
  });
  const [newCommandData, setNewCommandData] = useState({ code: '', name: '', description: '' });

  // Reset form data when dialog opens
  React.useEffect(() => {
    if (showAddDialog) {
      setNewCommandData({ code: '', name: '', description: '' });
    }
  }, [showAddDialog]);

  const handleAddCommand = () => {
    const code = parseInt(newCommandData.code);

    if (isNaN(code) || code < 0 || code > 255) {
      return; // Invalid code
    }

    if (!newCommandData.name.trim()) {
      return; // Empty name
    }

    // Check for duplicate code
    if (commands.some(cmd => cmd.code === code)) {
      return; // Duplicate code
    }

    const newCommand: SysCommand = {
      code,
      name: newCommandData.name.trim(),
      description: newCommandData.description.trim() || undefined
    };

    onCommandsChange([...commands, newCommand]);
    onAddDialogClose?.();
  };

  const handleUpdate = (index: number, newCommand: SysCommand) => {
    const updatedCommands = [...commands];
    updatedCommands[index] = newCommand;
    onCommandsChange(updatedCommands);
  };

  const handleDelete = (index: number) => {
    setDeleteConfirm({ open: true, index });
  };

  const confirmDelete = () => {
    if (deleteConfirm.index !== null) {
      const updatedCommands = commands.filter((_, idx) => idx !== deleteConfirm.index);
      onCommandsChange(updatedCommands);
    }
    setDeleteConfirm({ open: false, index: null });
  };

  const sortedCommands = [...commands].sort((a, b) => a.code - b.code);

  return (
    <Box>
      {commands.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No SYS_COMMANDs defined. Click "Add Entry" to create one.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width="120px" sx={{ fontWeight: 'bold' }}>Code</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                <TableCell width="80px" align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedCommands.map((command, originalIdx) => {
                const actualIndex = commands.indexOf(command);
                return (
                  <CommandRow
                    key={actualIndex}
                    command={command}
                    index={actualIndex}
                    commands={commands}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    readOnly={readOnly}
                  />
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add Command Dialog */}
      <Dialog
        open={showAddDialog}
        onClose={onAddDialogClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add SYS_COMMAND</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Command Code"
              type="number"
              fullWidth
              value={newCommandData.code}
              onChange={(e) => setNewCommandData({ ...newCommandData, code: e.target.value })}
              helperText="Enter a value between 0-255"
              slotProps={{ htmlInput: { min: 0, max: 255 } }}
            />
            <TextField
              label="Command Name"
              fullWidth
              value={newCommandData.name}
              onChange={(e) => setNewCommandData({ ...newCommandData, name: e.target.value })}
              helperText="Required - e.g., ENABLE_MOTOR, HOME_ALL"
            />
            <TextField
              label="Description (Optional)"
              fullWidth
              multiline
              rows={2}
              value={newCommandData.description}
              onChange={(e) => setNewCommandData({ ...newCommandData, description: e.target.value })}
              helperText="Optional description shown in the SYS_COMMAND panel"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onAddDialogClose}>
            Cancel
          </Button>
          <Button
            onClick={handleAddCommand}
            variant="contained"
            disabled={
              !newCommandData.code ||
              !newCommandData.name.trim() ||
              isNaN(parseInt(newCommandData.code)) ||
              parseInt(newCommandData.code) < 0 ||
              parseInt(newCommandData.code) > 255 ||
              commands.some(cmd => cmd.code === parseInt(newCommandData.code))
            }
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, index: null })}
      >
        <DialogTitle>Delete SYS_COMMAND</DialogTitle>
        <DialogContent>
          Are you sure you want to delete this command?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm({ open: false, index: null })}>
            Cancel
          </Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Export Dialog */}
      <SysCommandExportDialog
        open={showExportDialog}
        commands={commands}
        profileName={profileName}
        onClose={onExportDialogClose}
      />
    </Box>
  );
}
