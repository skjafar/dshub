import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Alert,
  Tooltip,
  Switch,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Timer as TimerIcon,
  Save as SaveIcon,
  Upload as UploadIcon,
  Send as SendIcon
} from '@mui/icons-material';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { mapManager } from '../maps/mapManager';
import { MapEntry, DataAccessPermit, DataForm } from '../maps/mapParser';
import { useToast } from './ToastNotification';
import { int32ToFloat, floatToInt32, formatFloat } from '../utils/floatConversion';

// Constants
const WRITE_VERIFICATION_DELAY_MS = 100;
const FLOAT_COMPARISON_TOLERANCE = 0.0001;
const WRITE_ALL_BATCH_DELAY_MS = 50;

// Interfaces
interface Parameter {
  address: number;
  name: string;
  value: number | null;
  valid: boolean;
  timestamp: number;
}

interface ParameterEditDialogProps {
  open: boolean;
  parameter: Parameter | null;
  onClose: () => void;
  onWrite: (address: number, value: number) => void;
}

function ParameterEditDialog({ open, parameter, onClose, onWrite }: ParameterEditDialogProps) {
  const [value, setValue] = useState(0);

  // Update value when parameter changes
  useEffect(() => {
    if (parameter) {
      setValue(parameter.value ?? 0);
    }
  }, [parameter]);

  const handleWrite = () => {
    if (parameter) {
      onWrite(parameter.address, value);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Edit Parameter {parameter?.name || ''} (0x{parameter?.address.toString(16).toUpperCase()})
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Value"
          type="number"
          fullWidth
          variant="outlined"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          sx={{ mt: 2 }}
          helperText="Parameter values are typically configuration settings that persist across device resets"
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

interface ReadParameterDialogProps {
  open: boolean;
  onClose: () => void;
  onRead: (address: number) => void;
}

function ReadParameterDialog({ open, onClose, onRead }: ReadParameterDialogProps) {
  const [address, setAddress] = useState(0);

  const handleRead = () => {
    onRead(address);
    onClose();
    setAddress(0);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Read Parameter</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Parameter Address (decimal)"
          type="number"
          fullWidth
          variant="outlined"
          value={address}
          onChange={(e) => setAddress(Number(e.target.value))}
          sx={{ mt: 2 }}
          helperText="Enter the parameter address in decimal format. Parameters typically start at address 1000+"
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

export interface ParametersPanelRef {
  openReadDialog: () => void;
  readAllMapped: () => void;
  refreshAll: () => void;
  canReadAll: () => boolean;
  canRefreshAll: () => boolean;
  isMapLoaded: boolean;
}

interface ParametersPanelProps {}

const ParametersPanel = forwardRef<ParametersPanelRef, ParametersPanelProps>((props, ref) => {
  const { state, actions } = useDSHub();
  const { settings, getActiveProfile } = useSettings();
  const toast = useToast();
  const [editDialog, setEditDialog] = useState<{ open: boolean; parameter: Parameter | null }>({
    open: false,
    parameter: null
  });
  const [readDialog, setReadDialog] = useState(false);

  // Initialize state immediately if mapManager is already loaded (only on first render)
  const [mapEntries, setMapEntries] = useState<MapEntry[]>(() =>
    mapManager.isInitialized() ? mapManager.getAllParameters() : []
  );
  const [mapLookup, setMapLookup] = useState<Map<number, MapEntry>>(() => {
    const lookup = new Map<number, MapEntry>();
    if (mapManager.isInitialized()) {
      mapManager.getAllParameters().forEach(entry => lookup.set(entry.address, entry));
    }
    return lookup;
  });
  const [isMapLoaded, setIsMapLoaded] = useState(() => mapManager.isInitialized());
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(2000);
  const [editingValues, setEditingValues] = useState<{ [address: number]: string }>({});

  useEffect(() => {
    const initializeMaps = async () => {
      try {
        const activeProfile = getActiveProfile();

        // Check if the loaded profile matches the active profile
        const loadedProfileId = mapManager.getCurrentProfileId();
        const needsReload = loadedProfileId !== settings.activeMapProfileId;

        if (needsReload) {
          console.log(`[ParametersPanel] Profile mismatch - MapManager has '${loadedProfileId}', settings has '${settings.activeMapProfileId}'`);
          // Clear parameter data when profile changes
          actions.clearParameters();

          // Force reload maps with new profile
          await mapManager.reload(activeProfile);
          console.log(`[ParametersPanel] MapManager reloaded with ${activeProfile?.name || 'default'} profile`);
        } else if (!mapManager.isInitialized()) {
          // First time initialization
          await mapManager.initialize(activeProfile);
          console.log(`[ParametersPanel] MapManager initialized for first time`);
        }

        // Update local state with current map entries
        const entries = mapManager.getAllParameters();
        console.log(`[ParametersPanel] Loaded ${entries.length} parameter entries from mapManager`);
        setMapEntries(entries);

        // Create fast lookup map
        const lookup = new Map<number, MapEntry>();
        entries.forEach(entry => lookup.set(entry.address, entry));
        setMapLookup(lookup);

        setIsMapLoaded(true);
      } catch (error) {
        console.error('Failed to load parameter maps:', error);
      }
    };

    initializeMaps();
  }, [settings.activeMapProfileId, getActiveProfile, actions]);

  const canWrite = state.connection?.connected && (
    (state.connection.interface === 'TCP' && state.connection.controlState === 1) ||
    (state.connection.interface === 'UDP' && state.connection.controlState === 2)
  );

  const handleRefreshAll = () => {
    // Read all parameters that have already been read (refresh visible data)
    state.parameters.forEach((parameter) => {
      const mapEntry = mapLookup.get(parameter.address);
      actions.readParameter(parameter.address, mapEntry?.name || parameter.name);
    });
  };

  const handleReadAllMapped = () => {
    // Read all parameters defined in the map
    mapEntries.forEach((mapEntry) => {
      actions.readParameter(mapEntry.address, mapEntry.name);
    });
  };

  const handleEditParameter = (parameter: Parameter) => {
    setEditDialog({ open: true, parameter });
  };

  const handleWriteParameter = (address: number, value: number) => {
    actions.writeParameter(address, value);
  };

  const handleReadParameter = (address: number, name?: string) => {
    actions.readParameter(address, name);
  };

  const handleInlineValueChange = (address: number, value: string) => {
    setEditingValues(prev => ({ ...prev, [address]: value }));
  };

  const handleInlineValueWrite = (address: number, parameter: Parameter | undefined, mapEntry: MapEntry) => {
    const valueStr = editingValues[address];
    if (valueStr !== undefined && valueStr !== '') {
      let parsedValue: number;

      // Handle float type - convert to int32 representation
      if (mapEntry.type === 'float') {
        const floatValue = parseFloat(valueStr);
        if (isNaN(floatValue)) {
          toast.showError('Invalid float value');
          return;
        }
        parsedValue = floatToInt32(floatValue);
      } else if (mapEntry.showAsHex) {
        parsedValue = parseInt(valueStr, 16);
      } else {
        parsedValue = parseInt(valueStr, 10);
      }

      if (isNaN(parsedValue)) {
        toast.showError('Invalid numeric value');
        return;
      }

      // CRITICAL: Validate range for safety-critical applications
      // JavaScript numbers can exceed 32-bit integer ranges, causing device malfunction
      const MIN_INT32 = -2147483648;
      const MAX_INT32 = 2147483647;
      const MAX_UINT32 = 4294967295;

      // Validate based on data type
      if (mapEntry.type === DataForm.UINT) {
        if (parsedValue < 0 || parsedValue > MAX_UINT32) {
          toast.showError(`Value must be between 0 and ${MAX_UINT32.toLocaleString()} (uint32_t)`);
          return;
        }
      } else {
        // Signed int32_t
        if (parsedValue < MIN_INT32 || parsedValue > MAX_INT32) {
          toast.showError(`Value must be between ${MIN_INT32.toLocaleString()} and ${MAX_INT32.toLocaleString()} (int32_t)`);
          return;
        }
      }

      actions.writeParameter(address, parsedValue);

      // Clear editing state to remove orange border indicator
      setEditingValues(prev => {
        const updated = { ...prev };
        delete updated[address];
        return updated;
      });

      // Read back after write to verify
      setTimeout(() => {
        actions.readParameter(address, mapEntry.name);
      }, WRITE_VERIFICATION_DELAY_MS);
    }
  };

  const handleInlineValueKeyPress = (e: React.KeyboardEvent, address: number, parameter: Parameter | undefined, mapEntry: MapEntry) => {
    if (e.key === 'Enter') {
      handleInlineValueWrite(address, parameter, mapEntry);
      // Select all text so user can immediately type a new value
      (e.target as HTMLInputElement).select();
    }
  };

  const handleAutoRefreshIntervalChange = (interval: number) => {
    setAutoRefreshInterval(interval);
    if (state.autoRefresh.enabled) {
      actions.setAutoRefresh(true, interval);
    }
  };

  const toggleParameterAutoRefresh = (address: number, enabled: boolean) => {
    if (enabled) {
      // Get the proper name from the map
      const mapEntry = mapLookup.get(address);
      const existingParameter = state.parameters.get(address);
      const name = existingParameter?.name || mapEntry?.name;

      // Do an initial read with the proper name to ensure it's stored in state
      if (name) {
        actions.readParameter(address, name);
      }

      actions.addAutoRefreshParameter(address);
      // Enable auto-refresh if not already enabled
      if (!state.autoRefresh.enabled) {
        actions.setAutoRefresh(true, autoRefreshInterval);
      }
    } else {
      actions.removeAutoRefreshParameter(address);
      // Disable auto-refresh if no addresses are active
      if (state.autoRefresh.activeParameterAddresses.size === 1 && state.autoRefresh.activeAddresses.size === 0) {
        // This is the last address, disable auto-refresh
        actions.setAutoRefresh(false);
      }
    }
  };

  const toggleAllParametersAutoRefresh = (enabled: boolean) => {
    // Operate on all mapped parameters (visible in table)
    mapEntries.forEach((mapEntry) => {
      if (enabled) {
        const existingParameter = state.parameters.get(mapEntry.address);
        const name = existingParameter?.name || mapEntry.name;

        // Do an initial read with the proper name to ensure it's stored in state
        actions.readParameter(mapEntry.address, name);
        actions.addAutoRefreshParameter(mapEntry.address);
      } else {
        actions.removeAutoRefreshParameter(mapEntry.address);
      }
    });

    // Enable/disable auto-refresh based on state
    if (enabled) {
      actions.setAutoRefresh(true, autoRefreshInterval);
    } else {
      // Only disable if registers are also empty
      if (state.autoRefresh.activeAddresses.size === 0) {
        actions.setAutoRefresh(false);
      }
    }
  };

  const getMapEntryForParameter = (address: number): MapEntry | undefined => {
    return mapLookup.get(address);
  };

  const handleSaveValues = () => {
    try {
      // Create CSV content: Address, Name, Type, Value
      // Only save parameters that have been read
      const csvLines = ['Address,Name,Type,Value'];

      state.parameters.forEach((parameter) => {
        // Skip parameters that haven't been read yet (null values)
        if (parameter.value === null || parameter.value === undefined) {
          return;
        }

        const mapEntry = mapLookup.get(parameter.address);
        const name = parameter.name || mapEntry?.name || '';
        const type = mapEntry?.type || 'unknown';

        // Handle float values - convert to actual float for CSV
        let value: string | number;
        if (mapEntry?.type === 'float') {
          value = formatFloat(int32ToFloat(parameter.value));
        } else {
          value = parameter.value;
        }

        csvLines.push(`${parameter.address},${name},${type},${value}`);
      });

      // Check if we actually have any values to save
      const parameterCount = csvLines.length - 1; // Subtract header line
      if (parameterCount === 0) {
        toast.showWarning('No parameter values to save. Read parameters from the device first.');
        return;
      }

      const csvContent = csvLines.join('\n');

      // Build filename: parameters_YYYY-MM-DD_HH-MM-SS_DeviceName.csv
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
      const deviceName = state.connection?.deviceName || 'unknown';
      const sanitizedDeviceName = deviceName.replace(/[^a-zA-Z0-9_-]/g, '_'); // Remove invalid filename chars

      const filename = `parameters_${dateStr}_${timeStr}_${sanitizedDeviceName}.csv`;

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.showSuccess(`Saved ${parameterCount} parameter values to ${filename}`);
    } catch (error) {
      console.error('Failed to save parameter values:', error);
      toast.showError('Failed to save parameter values');
    }
  };

  const handleLoadValues = () => {
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);

        console.log(`[CSV Load] File has ${lines.length} lines (including header)`);
        console.log(`[CSV Load] Map has ${mapLookup.size} entries loaded`);
        console.log(`[CSV Load] isMapLoaded: ${isMapLoaded}`);

        // Validate header
        if (lines.length < 2) {
          toast.showError('CSV file is empty or invalid');
          return;
        }

        const header = lines[0];
        if (header !== 'Address,Name,Type,Value') {
          toast.showError('Invalid CSV format. Expected header: Address,Name,Type,Value');
          return;
        }

        // Parse and validate each line
        const newEditingValues: { [address: number]: string } = {};
        let errorLine = -1;
        let errorMessage = '';

        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',');
          if (parts.length !== 4) {
            errorLine = i + 1;
            errorMessage = `Line ${errorLine}: Expected 4 columns, got ${parts.length}`;
            break;
          }

          const [addressStr, name, type, valueStr] = parts;
          const address = parseInt(addressStr, 10);

          if (isNaN(address)) {
            errorLine = i + 1;
            errorMessage = `Line ${errorLine}: Invalid address "${addressStr}"`;
            break;
          }

          // Validate against map (not state, as parameters may not have been read yet)
          const mapEntry = getMapEntryForParameter(address);

          if (!mapEntry) {
            errorLine = i + 1;
            errorMessage = `Line ${errorLine}: Parameter at address ${address} not found in map`;
            break;
          }

          if (name !== mapEntry.name) {
            errorLine = i + 1;
            errorMessage = `Line ${errorLine}: Name mismatch for address ${address}. Expected "${mapEntry.name}", got "${name}"`;
            break;
          }

          if (type !== mapEntry.type) {
            errorLine = i + 1;
            errorMessage = `Line ${errorLine}: Type mismatch for address ${address}. Expected "${mapEntry.type}", got "${type}"`;
            break;
          }

          // Store value in editing field (don't write to board yet)
          // Trim whitespace from valueStr to handle any formatting issues
          const trimmedValue = valueStr?.trim();
          if (trimmedValue && trimmedValue !== '') {
            newEditingValues[address] = trimmedValue;
            console.log(`[CSV Load] Loaded address ${address} (${name}): "${trimmedValue}"`);
          } else {
            console.log(`[CSV Load] Skipped address ${address} (${name}): empty value`);
          }
        }

        if (errorLine !== -1) {
          toast.showError(`Load aborted: ${errorMessage}`);
          return;
        }

        const loadedCount = Object.keys(newEditingValues).length;

        if (loadedCount === 0) {
          toast.showWarning('No values to load. The CSV file may contain only empty values or unreadable entries.');
          return;
        }

        // Apply all values to editing fields
        setEditingValues(newEditingValues);
        toast.showSuccess(`Loaded ${loadedCount} parameter values. Click "Write All" to send to board.`);

      } catch (error) {
        console.error('Failed to load parameter values:', error);
        toast.showError('Failed to load parameter values');
      }
    };

    input.click();
  };

  const handleWriteAll = () => {
    if (!canWrite) {
      toast.showError('Cannot write: device not connected or control not taken');
      return;
    }

    const addresses = Object.keys(editingValues).map(k => parseInt(k, 10));
    if (addresses.length === 0) {
      toast.showWarning('No values to write');
      return;
    }

    const addressesToRead: Array<{ address: number; name: string }> = [];

    addresses.forEach((address) => {
      const valueStr = editingValues[address];
      if (valueStr !== undefined && valueStr !== '') {
        const mapEntry = mapLookup.get(address);
        if (!mapEntry) return;

        let parsedValue: number;

        // Handle float type - convert to int32 representation
        if (mapEntry.type === 'float') {
          const floatValue = parseFloat(valueStr);
          if (isNaN(floatValue)) return;
          parsedValue = floatToInt32(floatValue);
        } else if (mapEntry.showAsHex) {
          parsedValue = parseInt(valueStr, 16);
        } else {
          parsedValue = parseInt(valueStr, 10);
        }

        if (!isNaN(parsedValue)) {
          actions.writeParameter(address, parsedValue);
          addressesToRead.push({ address, name: mapEntry.name });
        }
      }
    });

    // Read back all written values after a delay to verify
    if (addressesToRead.length > 0) {
      setTimeout(() => {
        addressesToRead.forEach(({ address, name }, index) => {
          // Stagger reads slightly to avoid overwhelming the board
          setTimeout(() => {
            actions.readParameter(address, name);
          }, index * WRITE_ALL_BATCH_DELAY_MS);
        });
      }, WRITE_VERIFICATION_DELAY_MS);
    }

    // Clear all editing values after writing
    setEditingValues({});

    toast.showSuccess(`Writing ${addressesToRead.length} parameter values to board...`);
  };

  const formatParameterValue = (parameter: Parameter): string => {
    if (parameter.value === null || parameter.value === undefined) {
      return '---';
    }

    const mapEntry = mapLookup.get(parameter.address);

    // Handle float type - convert from int32 representation
    if (mapEntry?.type === 'float') {
      const floatValue = int32ToFloat(parameter.value);
      return formatFloat(floatValue);
    }

    if (mapEntry?.showAsHex) {
      return `0x${parameter.value.toString(16).toUpperCase()}`;
    }
    return parameter.value.toString();
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    openReadDialog: () => setReadDialog(true),
    readAllMapped: handleReadAllMapped,
    refreshAll: handleRefreshAll,
    canReadAll: () => state.connection?.connected && isMapLoaded,
    canRefreshAll: () => state.connection?.connected && isMapLoaded,
    isMapLoaded
  }));

  return (
    <Box>
      {/* Auto-refresh interval selector and Load/Save buttons */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Refresh Interval</InputLabel>
                <Select
                  value={autoRefreshInterval}
                  onChange={(e) => handleAutoRefreshIntervalChange(e.target.value as number)}
                  label="Refresh Interval"
                  disabled={!state.connection?.connected}
                >
                  <MenuItem value={1000}>1s</MenuItem>
                  <MenuItem value={2000}>2s</MenuItem>
                  <MenuItem value={5000}>5s</MenuItem>
                  <MenuItem value={10000}>10s</MenuItem>
                  <MenuItem value={30000}>30s</MenuItem>
                </Select>
              </FormControl>

              <Typography variant="body2" color="text.secondary">
                Active: {state.autoRefresh.activeParameterAddresses.size} parameters
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title="Save all parameter values to CSV file">
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveValues}
                  disabled={state.parameters.size === 0}
                >
                  Save
                </Button>
              </Tooltip>
              <Tooltip title="Load parameter values from CSV file">
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<UploadIcon />}
                  onClick={handleLoadValues}
                  disabled={!isMapLoaded}
                >
                  Load
                </Button>
              </Tooltip>
              <Tooltip title="Write all pending values to board">
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<SendIcon />}
                  onClick={handleWriteAll}
                  disabled={!canWrite || Object.keys(editingValues).length === 0}
                  color="primary"
                >
                  Write All ({Object.keys(editingValues).length})
                </Button>
              </Tooltip>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Alert severity="info" sx={{ mb: 3 }}>
        Parameters are configuration values that typically persist across device resets. 
        Changing parameter values may require a device restart to take effect.
      </Alert>

      {!state.connection?.connected && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Device not connected. Please connect to a device to view parameters.
        </Alert>
      )}

      {!canWrite && state.connection?.connected && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Write operations disabled. Take control of the device to enable parameter writes.
        </Alert>
      )}

      {mapEntries.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary" align="center">
              No parameter map loaded. Use "Read Parameter" to manually read specific parameters,
              or connect to a device that automatically loads parameter values.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Parameter Data ({mapEntries.length} parameters)
              {isMapLoaded && state.parameters.size > 0 && (
                <Chip
                  label={`${state.parameters.size} read`}
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ ml: 1 }}
                />
              )}
            </Typography>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ py: 0.5 }}>Address</TableCell>
                    <TableCell sx={{ py: 0.5 }}>Array Index</TableCell>
                    <TableCell sx={{ py: 0.5 }}>Name</TableCell>
                    <TableCell sx={{ py: 0.5 }}>Type</TableCell>
                    <TableCell sx={{ py: 0.5 }}>Value</TableCell>
                    <TableCell sx={{ py: 0.5 }}>Status</TableCell>
                    <TableCell sx={{ py: 0.5 }}>Last Updated</TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        Auto-Refresh
                        <Checkbox
                          size="small"
                          checked={mapEntries.length > 0 && mapEntries.every(e => state.autoRefresh.activeParameterAddresses.has(e.address))}
                          indeterminate={mapEntries.some(e => state.autoRefresh.activeParameterAddresses.has(e.address)) && !mapEntries.every(e => state.autoRefresh.activeParameterAddresses.has(e.address))}
                          onChange={(e) => toggleAllParametersAutoRefresh(e.target.checked)}
                          disabled={!state.connection?.connected || mapEntries.length === 0}
                        />
                      </Box>
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mapEntries.map((mapEntry) => {
                    // Look up parameter data if it exists
                    const parameter = state.parameters.get(mapEntry.address);
                    // Extract array index from name if it's an array element (e.g., "NAME[5]" -> "5")
                    const arrayIndexMatch = mapEntry.name.match(/\[(\d+)\]$/);
                    const arrayIndex = arrayIndexMatch ? arrayIndexMatch[1] : null;

                    return (
                      <TableRow key={mapEntry.address} hover>
                        <TableCell sx={{ py: 0.5 }}>
                          <Typography variant="body2" fontFamily="monospace">
                            0x{mapEntry.address.toString(16).toUpperCase().padStart(2, '0')} ({mapEntry.address})
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          {arrayIndex !== null && (
                            <Typography variant="body2" fontFamily="monospace">
                              [{arrayIndex}]
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                          >
                            {mapEntry.name}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Tooltip title={`Data type: ${mapEntry.type}`}>
                            <Chip
                              label={mapEntry.type}
                              size="small"
                              variant="outlined"
                              color={mapEntry.showAsHex ? 'secondary' : 'default'}
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <TextField
                              variant="outlined"
                              size="small"
                              placeholder="Write value..."
                              value={editingValues[mapEntry.address] || ''}
                              onChange={(e) => handleInlineValueChange(mapEntry.address, e.target.value)}
                              onKeyPress={(e) => handleInlineValueKeyPress(e, mapEntry.address, parameter, mapEntry)}
                              disabled={!state.connection?.connected}
                              sx={{
                                fontFamily: 'monospace',
                                width: 120,
                                '& .MuiInputBase-input': {
                                  fontFamily: 'monospace',
                                  py: 0.5,
                                  fontSize: '0.875rem'
                                },
                                '& .MuiOutlinedInput-root': {
                                  '& fieldset': {
                                    borderColor: editingValues[mapEntry.address] ? 'warning.main' : undefined,
                                    borderWidth: editingValues[mapEntry.address] ? 2 : 1
                                  }
                                }
                              }}
                            />
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, position: 'relative' }}>
                              <Typography variant="body2" fontFamily="monospace">
                                {parameter ? formatParameterValue(parameter) : '---'}
                              </Typography>
                              <Box sx={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                {editingValues[mapEntry.address] && parameter && parameter.value !== null && (() => {
                                  // Handle float comparison properly
                                  if (mapEntry.type === 'float') {
                                    const writtenFloat = parseFloat(editingValues[mapEntry.address]);
                                    const boardFloat = int32ToFloat(parameter.value);
                                    return !isNaN(writtenFloat) && Math.abs(writtenFloat - boardFloat) > FLOAT_COMPARISON_TOLERANCE ? (
                                      <Tooltip title={`Mismatch: Wrote ${formatFloat(writtenFloat)} but read ${formatFloat(boardFloat)}`}>
                                        <Box component="span" sx={{ color: 'error.main', display: 'flex', alignItems: 'center' }}>
                                          ⚠️
                                        </Box>
                                      </Tooltip>
                                    ) : null;
                                  } else {
                                    const writtenValue = mapEntry.showAsHex ? parseInt(editingValues[mapEntry.address], 16) : parseInt(editingValues[mapEntry.address], 10);
                                    const boardValue = parameter.value;
                                    return !isNaN(writtenValue) && writtenValue !== boardValue ? (
                                      <Tooltip title={`Mismatch: Wrote ${writtenValue} but read ${boardValue}`}>
                                        <Box component="span" sx={{ color: 'error.main', display: 'flex', alignItems: 'center' }}>
                                          ⚠️
                                        </Box>
                                      </Tooltip>
                                    ) : null;
                                  }
                                })()}
                              </Box>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Chip
                            label={!parameter || parameter.value === null ? 'Not Read' : (parameter.valid ? 'Valid' : 'Invalid')}
                            color={!parameter || parameter.value === null ? 'default' : (parameter.valid ? 'success' : 'error')}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Typography variant="caption">
                            {!parameter || parameter.timestamp === 0 ? '---' : new Date(parameter.timestamp).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Tooltip title={state.autoRefresh.activeParameterAddresses.has(mapEntry.address) ? 'Remove from auto-refresh' : 'Add to auto-refresh'}>
                            <Checkbox
                              size="small"
                              checked={state.autoRefresh.activeParameterAddresses.has(mapEntry.address)}
                              onChange={(e) => toggleParameterAutoRefresh(mapEntry.address, e.target.checked)}
                              disabled={!state.connection?.connected}
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title="Refresh parameter value">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  actions.readParameter(mapEntry.address, mapEntry.name);
                                }}
                                disabled={!state.connection?.connected}
                              >
                                <RefreshIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Edit parameter value">
                              <IconButton
                                size="small"
                                onClick={() => handleEditParameter(parameter || { address: mapEntry.address, name: mapEntry.name, value: null, valid: false, timestamp: 0 })}
                                disabled={!canWrite}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      <ParameterEditDialog
        open={editDialog.open}
        parameter={editDialog.parameter}
        onClose={() => setEditDialog({ open: false, parameter: null })}
        onWrite={handleWriteParameter}
      />

      <ReadParameterDialog
        open={readDialog}
        onClose={() => setReadDialog(false)}
        onRead={handleReadParameter}
      />
    </Box>
  );
});

ParametersPanel.displayName = 'ParametersPanel';

export default ParametersPanel;