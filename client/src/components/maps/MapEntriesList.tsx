import React, { useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Chip,
  Typography,
  TextField,
  Select,
  MenuItem,
  Switch
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import MenuIcon from '@mui/icons-material/Menu';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { MapEntry, DataAccessPermit, DataForm } from '../../maps/mapParser';
import { consolidateArrayEntries } from '../../utils/mapFileGenerator';

interface MapEntriesListProps {
  entries: MapEntry[];
  isRegisterMap: boolean;
  onUpdate: (oldEntry: MapEntry, newData: Partial<MapEntry>) => void;
  onDelete: (entry: MapEntry) => void;
  onReorder: (oldIndex: number, newIndex: number) => void;
}

interface SortableRowProps {
  entry: MapEntry;
  isRegisterMap: boolean;
  onUpdate: (newData: Partial<MapEntry>) => void;
  onDelete: (entry: MapEntry) => void;
}

function SortableRow({ entry, isRegisterMap, onUpdate, onDelete }: SortableRowProps) {
  const stableId = entry.name.replace(/\[\d+\]$/, '');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: stableId,
    transition: {
      duration: 200,
      easing: 'ease'
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'default',
    zIndex: isDragging ? 1 : 0
  };

  // Local state for editing
  const baseName = entry.name.replace(/\[\d+\]$/, '');
  const [editName, setEditName] = useState(baseName);
  const [editType, setEditType] = useState<DataForm>(entry.type);
  const [editIsArray, setEditIsArray] = useState(entry.isArray);
  const [editArraySize, setEditArraySize] = useState(entry.arraySize?.toString() || '1');
  const [editAccessPermit, setEditAccessPermit] = useState<DataAccessPermit>(entry.accessPermit);

  // Update local state when entry changes (e.g., from external updates)
  React.useEffect(() => {
    setEditName(baseName);
    setEditType(entry.type);
    setEditIsArray(entry.isArray);
    setEditArraySize(entry.arraySize?.toString() || '1');
    setEditAccessPermit(entry.accessPermit);
  }, [baseName, entry.type, entry.isArray, entry.arraySize, entry.accessPermit]);

  const handleNameBlur = () => {
    const trimmedName = editName.trim().toUpperCase();
    if (trimmedName && trimmedName !== baseName) {
      onUpdate({
        name: trimmedName,
        type: editType,
        isArray: editIsArray,
        arraySize: editIsArray ? parseInt(editArraySize, 10) : undefined,
        accessPermit: editAccessPermit,
        showAsHex: editType === DataForm.HEX
      });
    } else {
      setEditName(baseName); // Revert if invalid
    }
  };

  const handleTypeChange = (newType: DataForm) => {
    setEditType(newType);
    onUpdate({
      name: baseName,
      type: newType,
      isArray: editIsArray,
      arraySize: editIsArray ? parseInt(editArraySize, 10) : undefined,
      accessPermit: editAccessPermit,
      showAsHex: newType === DataForm.HEX
    });
  };

  const handleArrayToggle = (checked: boolean) => {
    setEditIsArray(checked);
    const parsedSize = checked ? parseInt(editArraySize, 10) : undefined;
    console.log(`[MapEditor] Array toggle - editArraySize: "${editArraySize}", parsed: ${parsedSize}`);
    onUpdate({
      name: baseName,
      type: editType,
      isArray: checked,
      arraySize: parsedSize,
      accessPermit: editAccessPermit,
      showAsHex: editType === DataForm.HEX
    });
  };

  const handleArraySizeBlur = () => {
    // Parse as decimal only - never allow hex input for array size
    // Remove any leading zeros, hex prefixes, or non-numeric characters
    const cleanedInput = editArraySize.replace(/^0x/i, '').replace(/^0+/, '') || '0';
    const size = parseInt(cleanedInput, 10);

    console.log(`[MapEditor] Array size input: "${editArraySize}" -> cleaned: "${cleanedInput}" -> parsed as: ${size}`);

    if (!isNaN(size) && size >= 1 && size <= 1000) {
      console.log(`[MapEditor] Creating array with ${size} elements for ${baseName}`);
      // Store as number and update the field to show the clean decimal value
      setEditArraySize(size.toString());
      onUpdate({
        name: baseName,
        type: editType,
        isArray: editIsArray,
        arraySize: size, // ALWAYS a number in base 10
        accessPermit: editAccessPermit,
        showAsHex: editType === DataForm.HEX
      });
    } else {
      console.warn(`[MapEditor] Invalid array size: "${editArraySize}"`);
      setEditArraySize(entry.arraySize?.toString() || '1'); // Revert if invalid
    }
  };

  const handleAccessChange = (newAccess: DataAccessPermit) => {
    setEditAccessPermit(newAccess);
    onUpdate({
      name: baseName,
      type: editType,
      isArray: editIsArray,
      arraySize: editIsArray ? parseInt(editArraySize, 10) : undefined,
      accessPermit: newAccess,
      showAsHex: editType === DataForm.HEX
    });
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      hover={!isDragging}
      sx={{
        '&:last-child td, &:last-child th': { border: 0 },
        backgroundColor: isDragging ? 'action.hover' : 'inherit'
      }}
    >
      {/* Drag Handle */}
      <TableCell sx={{ width: 48, p: 0 }}>
        <Box
          {...attributes}
          {...listeners}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
            '&:active': {
              cursor: 'grabbing'
            },
            color: 'text.secondary',
            '&:hover': {
              color: 'primary.main'
            },
            py: 1
          }}
        >
          <MenuIcon fontSize="small" />
        </Box>
      </TableCell>

      {/* Address */}
      <TableCell sx={{ py: 0.5 }}>
        <Chip
          label={entry.address}
          size="small"
          color="default"
          sx={{ minWidth: 50 }}
        />
      </TableCell>

      {/* Name */}
      <TableCell sx={{ py: 0.5 }}>
        <TextField
          value={editName}
          onChange={(e) => setEditName(e.target.value.toUpperCase())}
          onBlur={handleNameBlur}
          size="small"
          fullWidth
          sx={{ fontFamily: 'monospace' }}
        />
      </TableCell>

      {/* Type */}
      <TableCell sx={{ py: 0.5 }}>
        <Select
          value={editType}
          onChange={(e) => handleTypeChange(e.target.value as DataForm)}
          size="small"
          fullWidth
        >
          <MenuItem value={DataForm.UINT}>uint32_t</MenuItem>
          <MenuItem value={DataForm.INT}>int32_t</MenuItem>
          <MenuItem value={DataForm.FLOAT}>float</MenuItem>
          <MenuItem value={DataForm.HEX}>hex</MenuItem>
        </Select>
      </TableCell>

      {/* Array */}
      <TableCell sx={{ minWidth: 180, py: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Switch
            checked={editIsArray}
            onChange={(e) => handleArrayToggle(e.target.checked)}
            size="small"
          />
          <TextField
            type="number"
            label="Size"
            placeholder="e.g. 16"
            value={editArraySize}
            onChange={(e) => setEditArraySize(e.target.value)}
            onBlur={handleArraySizeBlur}
            size="small"
            disabled={!editIsArray}
            sx={{ width: 90 }}
            slotProps={{
              htmlInput: { min: 1, max: 1000, step: 1 }
            }}
          />
        </Box>
      </TableCell>

      {/* Access Permission */}
      <TableCell sx={{ width: 150, py: 0.5 }}>
        {isRegisterMap ? (
          <Select
            value={editAccessPermit}
            onChange={(e) => handleAccessChange(e.target.value as DataAccessPermit)}
            size="small"
            sx={{ width: '100%' }}
          >
            <MenuItem value={DataAccessPermit.READ_ONLY}>Read-Only</MenuItem>
            <MenuItem value={DataAccessPermit.READ_WRITE}>Read/Write</MenuItem>
          </Select>
        ) : (
          <Box sx={{ width: '100%' }} />
        )}
      </TableCell>

      {/* Actions */}
      <TableCell align="right" sx={{ py: 0.5 }}>
        <Tooltip title="Delete">
          <IconButton
            size="small"
            onClick={() => onDelete(entry)}
            color="error"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}

export default function MapEntriesList({
  entries,
  isRegisterMap,
  onUpdate,
  onDelete,
  onReorder
}: MapEntriesListProps) {
  const consolidatedEntries = consolidateArrayEntries(entries);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = consolidatedEntries.findIndex((e) => {
        const baseName = e.name.replace(/\[\d+\]$/, '');
        return baseName === active.id;
      });
      const newIndex = consolidatedEntries.findIndex((e) => {
        const baseName = e.name.replace(/\[\d+\]$/, '');
        return baseName === over.id;
      });

      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(oldIndex, newIndex);
      }
    }
  };

  if (consolidatedEntries.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: 200,
          border: '2px dashed',
          borderColor: 'divider',
          borderRadius: 1,
          backgroundColor: 'background.default'
        }}
      >
        <Typography variant="body1" color="text.secondary">
          No entries yet. Click "Add Entry" to create your first entry.
        </Typography>
      </Box>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext
        items={consolidatedEntries.map(e => e.name.replace(/\[\d+\]$/, ''))}
        strategy={verticalListSortingStrategy}
      >
        <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: 48, py: 0.5 }}></TableCell>
                <TableCell sx={{ fontWeight: 'bold', py: 0.5 }}>Address</TableCell>
                <TableCell sx={{ fontWeight: 'bold', py: 0.5 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold', py: 0.5 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 'bold', py: 0.5 }}>Array</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 150, py: 0.5 }}>
                  {isRegisterMap ? 'Access' : ''}
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold', py: 0.5 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {consolidatedEntries.map((entry, index) => {
                const baseName = entry.name.replace(/\[\d+\]$/, '');
                const isLastReadOnly = isRegisterMap &&
                  entry.accessPermit === DataAccessPermit.READ_ONLY &&
                  index < consolidatedEntries.length - 1 &&
                  consolidatedEntries[index + 1].accessPermit === DataAccessPermit.READ_WRITE;

                return (
                  <React.Fragment key={baseName}>
                    <SortableRow
                      entry={entry}
                      isRegisterMap={isRegisterMap}
                      onUpdate={(data) => onUpdate(entry, data)}
                      onDelete={onDelete}
                    />
                    {isLastReadOnly && (
                      <TableRow>
                        <TableCell colSpan={7} sx={{ p: 0 }}>
                          <Box
                            sx={{
                              borderTop: 2,
                              borderColor: 'primary.main',
                              bgcolor: 'primary.light',
                              opacity: 0.3,
                              height: 4
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </SortableContext>
    </DndContext>
  );
}
