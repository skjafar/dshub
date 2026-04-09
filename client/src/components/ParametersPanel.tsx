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
  Chip,
  Alert,
  Tooltip,
  Switch,
  FormControlLabel,
  Checkbox,
  InputAdornment
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  InfoOutlined as InfoIcon,
} from '@mui/icons-material';
import RegisterInspector from './RegisterInspector';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { mapManager } from '../maps/mapManager';
import { MapEntry } from '../maps/mapParser';
import { useToast } from './ToastNotification';
import { int32ToFloat, formatFloat } from '../utils/floatConversion';
import { canWriteToDevice, formatDataValue, filterWriteValueFromMap, parseWriteValue } from '../utils/dataTableUtils';
import { useDebouncedCallback } from '../hooks/useDebounce';
import { DataEditDialog, DataReadDialog } from './DataEditDialog';
import { FONT_MONO } from '../theme';
import { logger } from '../utils/logger';

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

export interface ParametersPanelRef {
  openReadDialog: () => void;
  refresh: () => void;
  canRefresh: () => boolean;
  isMapLoaded: boolean;
  autoRefreshInterval: number;
  setAutoRefreshInterval: (interval: number) => void;
  activeCount: number;
  saveValues: () => void;
  loadValues: () => void;
  writeAll: () => void;
  pendingWriteCount: number;
  canWrite: boolean;
}

interface ParametersPanelProps {}

const ParametersPanel = forwardRef<ParametersPanelRef, ParametersPanelProps>((props, ref) => {
  const { state, actions } = useDSHub();
  const { settings, getActiveProfile } = useSettings();
  const toast = useToast();
  const [editDialog, setEditDialog] = useState<{ open: boolean; parameter: Parameter | null; mapEntry?: MapEntry }>({
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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const debouncedSetFilter = useDebouncedCallback((query: string) => {
    setFilterQuery(query);
  }, 300);
  const [selectedAddress, setSelectedAddress] = useState<number | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(() =>
    localStorage.getItem('dshub-param-inspector-open') === 'true'
  );

  useEffect(() => {
    localStorage.setItem('dshub-param-inspector-open', String(inspectorOpen));
  }, [inspectorOpen]);

  useEffect(() => {
    const initializeMaps = async () => {
      try {
        const activeProfile = getActiveProfile();

        // Check if the loaded profile matches the active profile
        const loadedProfileId = mapManager.getCurrentProfileId();
        const needsReload = loadedProfileId !== settings.activeMapProfileId;

        if (needsReload) {
          logger.log(`[ParametersPanel] Profile mismatch - MapManager has '${loadedProfileId}', settings has '${settings.activeMapProfileId}'`);
          // Clear parameter data when profile changes
          actions.clearParameters();

          // Force reload maps with new profile
          await mapManager.reload(activeProfile);
          logger.log(`[ParametersPanel] MapManager reloaded with ${activeProfile?.name || 'default'} profile`);
        } else if (!mapManager.isInitialized()) {
          // First time initialization
          await mapManager.initialize(activeProfile);
          logger.log(`[ParametersPanel] MapManager initialized for first time`);
        }

        // Update local state with current map entries
        const entries = mapManager.getAllParameters();
        logger.log(`[ParametersPanel] Loaded ${entries.length} parameter entries from mapManager`);
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

  const canWrite = canWriteToDevice(state.connection);

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

  const handleEditParameter = (parameter: Parameter, mapEntry?: MapEntry) => {
    setEditDialog({ open: true, parameter, mapEntry });
  };

  const handleWriteParameter = (address: number, value: number) => {
    actions.writeParameter(address, value);
  };

  const handleReadParameter = (address: number, name?: string) => {
    actions.readParameter(address, name);
  };

  const handleInlineValueChange = (address: number, value: string, mapEntry?: MapEntry) => {
    setEditingValues(prev => ({ ...prev, [address]: filterWriteValueFromMap(value, mapEntry) }));
  };

  const handleInlineValueWrite = (address: number, parameter: Parameter | undefined, mapEntry: MapEntry) => {
    const valueStr = editingValues[address];
    if (valueStr !== undefined && valueStr !== '') {
      const result = parseWriteValue(valueStr, mapEntry);
      if (result.value === null) {
        toast.showError(result.error);
        return;
      }

      actions.writeParameter(address, result.value);

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

  const filteredMapEntries = filterQuery
    ? mapEntries.filter(entry => {
        const query = filterQuery.toLowerCase();
        const name = entry.name.toLowerCase();
        const addressDec = entry.address.toString();
        const addressHex = '0x' + entry.address.toString(16).toLowerCase();
        return name.includes(query) || addressDec.includes(query) || addressHex.includes(query);
      })
    : mapEntries;

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

        logger.log(`[CSV Load] File has ${lines.length} lines (including header)`);
        logger.log(`[CSV Load] Map has ${mapLookup.size} entries loaded`);
        logger.log(`[CSV Load] isMapLoaded: ${isMapLoaded}`);

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
            logger.log(`[CSV Load] Loaded address ${address} (${name}): "${trimmedValue}"`);
          } else {
            logger.log(`[CSV Load] Skipped address ${address} (${name}): empty value`);
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

        const result = parseWriteValue(valueStr, mapEntry);
        if (result.value !== null) {
          actions.writeParameter(address, result.value);
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
    const mapEntry = mapLookup.get(parameter.address);
    return formatDataValue(parameter.value, mapEntry);
  };

  // ─── Inspector derived state ──────────────────────────────────────────────
  const selectedMapEntry = selectedAddress !== null
    ? getMapEntryForParameter(selectedAddress)
    : undefined;

  const selectedParamData = selectedAddress !== null
    ? state.parameters.get(selectedAddress)
    : undefined;

  const isAutoRefreshing = selectedAddress !== null
    ? state.autoRefresh.activeParameterAddresses.has(selectedAddress)
    : false;

  const handleInspectorRead = () => {
    if (selectedAddress === null || !selectedMapEntry) return;
    actions.readParameter(selectedAddress, selectedMapEntry.name);
  };

  const handleInspectorToggleAutoRefresh = (enabled: boolean) => {
    if (selectedAddress === null) return;
    toggleParameterAutoRefresh(selectedAddress, enabled);
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    openReadDialog: () => setReadDialog(true),
    refresh: () => isMapLoaded ? handleReadAllMapped() : handleRefreshAll(),
    canRefresh: () => !!state.connection?.connected,
    isMapLoaded,
    autoRefreshInterval,
    setAutoRefreshInterval: handleAutoRefreshIntervalChange,
    activeCount: state.autoRefresh.activeParameterAddresses.size,
    saveValues: handleSaveValues,
    loadValues: handleLoadValues,
    writeAll: handleWriteAll,
    pendingWriteCount: Object.keys(editingValues).length,
    canWrite,
  }));

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">
                Parameter Data ({filteredMapEntries.length}{filterQuery ? ` / ${mapEntries.length}` : ''} parameters)
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
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder="Search by name or address..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  debouncedSetFilter(e.target.value);
                }}
                sx={{ width: 260 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                    endAdornment: searchQuery ? (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => { setSearchQuery(''); setFilterQuery(''); }}>
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : null
                  }
                }}
              />
              <Tooltip title={inspectorOpen ? 'Close inspector' : 'Open inspector'}>
                <IconButton
                  size="small"
                  onClick={() => setInspectorOpen(v => !v)}
                  sx={{
                    borderRadius: '4px',
                    border: '1px solid',
                    borderColor: inspectorOpen ? 'rgba(0,229,255,0.25)' : 'rgba(59,73,76,0.2)',
                    backgroundColor: inspectorOpen ? 'rgba(0,229,255,0.08)' : 'transparent',
                    color: inspectorOpen ? 'primary.main' : 'text.secondary',
                    '&:hover': { backgroundColor: 'rgba(0,218,243,0.06)', color: 'primary.main' },
                  }}
                >
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              </Box>
            </Box>
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
                  {filteredMapEntries.map((mapEntry) => {
                    // Look up parameter data if it exists
                    const parameter = state.parameters.get(mapEntry.address);
                    // Extract array index from name if it's an array element (e.g., "NAME[5]" -> "5")
                    const arrayIndexMatch = mapEntry.name.match(/\[(\d+)\]$/);
                    const arrayIndex = arrayIndexMatch ? arrayIndexMatch[1] : null;

                    return (
                      <TableRow
                        key={mapEntry.address}
                        hover
                        selected={selectedAddress === mapEntry.address && inspectorOpen}
                        onClick={() => { setSelectedAddress(mapEntry.address); setInspectorOpen(true); }}
                        sx={{
                          cursor: 'pointer',
                          '&.Mui-selected': { backgroundColor: 'rgba(0,229,255,0.05)' },
                          '&.Mui-selected:hover': { backgroundColor: 'rgba(0,229,255,0.08)' },
                        }}
                      >
                        <TableCell sx={{ py: 0.5 }}>
                          <Typography variant="body2" fontFamily={FONT_MONO}>
                            0x{mapEntry.address.toString(16).toUpperCase().padStart(2, '0')} ({mapEntry.address})
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          {arrayIndex !== null && (
                            <Typography variant="body2" fontFamily={FONT_MONO}>
                              [{arrayIndex}]
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Tooltip title={mapEntry.description} enterDelay={1000} disableInteractive>
                            <Typography
                              variant="body2"
                              fontWeight="medium"
                            >
                              {mapEntry.name}
                            </Typography>
                          </Tooltip>
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
                              onChange={(e) => handleInlineValueChange(mapEntry.address, e.target.value, mapEntry)}
                              onKeyDown={(e) => handleInlineValueKeyPress(e, mapEntry.address, parameter, mapEntry)}
                              disabled={!state.connection?.connected}
                              sx={{
                                fontFamily: FONT_MONO,
                                width: 120,
                                '& .MuiInputBase-input': {
                                  fontFamily: FONT_MONO,
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
                              <Typography variant="body2" fontFamily={FONT_MONO}>
                                {parameter ? formatParameterValue(parameter) : '---'}
                              </Typography>
                              <Box sx={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                {editingValues[mapEntry.address] && parameter && parameter.value !== null && (() => {
                                  // Handle float comparison properly
                                  if (mapEntry.type === 'float') {
                                    const writtenFloat = parseFloat(editingValues[mapEntry.address]);
                                    const boardFloat = int32ToFloat(parameter.value);
                                    return !isNaN(writtenFloat) && Math.abs(writtenFloat - boardFloat) > FLOAT_COMPARISON_TOLERANCE ? (
                                      <Tooltip title={`Mismatch: Set ${formatFloat(writtenFloat)} but read ${formatFloat(boardFloat)}`}>
                                        <Box component="span" sx={{ color: 'error.main', display: 'flex', alignItems: 'center' }}>
                                          ⚠️
                                        </Box>
                                      </Tooltip>
                                    ) : null;
                                  } else {
                                    const writtenValue = mapEntry.showAsHex ? parseInt(editingValues[mapEntry.address], 16) : parseInt(editingValues[mapEntry.address], 10);
                                    const boardValue = parameter.value;
                                    return !isNaN(writtenValue) && writtenValue !== boardValue ? (
                                      <Tooltip title={`Mismatch: Set ${writtenValue} but read ${boardValue}`}>
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
                                onClick={() => handleEditParameter(parameter || { address: mapEntry.address, name: mapEntry.name, value: null, valid: false, timestamp: 0 }, mapEntry)}
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

      <DataEditDialog
        open={editDialog.open}
        dataType="Parameter"
        item={editDialog.parameter}
        mapEntry={editDialog.mapEntry}
        onClose={() => setEditDialog({ open: false, parameter: null })}
        onWrite={handleWriteParameter}
      />

      <DataReadDialog
        open={readDialog}
        dataType="Parameter"
        onClose={() => setReadDialog(false)}
        onRead={handleReadParameter}
        helperText="Enter the parameter address in decimal format. Parameters typically start at address 1000+"
      />
      </Box>
      <RegisterInspector
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        mapEntry={selectedMapEntry}
        value={selectedParamData?.value ?? null}
        valid={selectedParamData?.valid ?? false}
        timestamp={selectedParamData?.timestamp ?? 0}
        dataType="parameter"
        isAutoRefresh={isAutoRefreshing}
        canRead={!!state.connection?.connected}
        canToggleAutoRefresh={!!state.connection?.connected}
        onRead={handleInspectorRead}
        onToggleAutoRefresh={handleInspectorToggleAutoRefresh}
      />
    </Box>
  );
});

ParametersPanel.displayName = 'ParametersPanel';

export default ParametersPanel;