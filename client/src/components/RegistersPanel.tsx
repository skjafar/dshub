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
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  InputAdornment
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Timer as TimerIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Search as SearchIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ToastNotification';
import { mapManager } from '../maps/mapManager';
import { MapEntry, DataAccessPermit } from '../maps/mapParser';
import { int32ToFloat, formatFloat } from '../utils/floatConversion';
import { canWriteToDevice, formatDataValue, parseWriteValue, filterWriteValueFromMap } from '../utils/dataTableUtils';
import { useDebouncedCallback } from '../hooks/useDebounce';
import { FONT_MONO } from '../theme';

interface RegisterEditDialogProps {
  open: boolean;
  register: { address: number; name: string; value: number | null } | null;
  mapEntry?: MapEntry;
  onClose: () => void;
  onWrite: (address: number, value: number) => void;
}

function RegisterEditDialog({ open, register, mapEntry, onClose, onWrite }: RegisterEditDialogProps) {
  const [valueStr, setValueStr] = useState('');

  // Update value when register changes
  useEffect(() => {
    if (register) {
      setValueStr(String(register.value ?? 0));
    }
  }, [register]);

  const handleWrite = () => {
    if (register) {
      const parsed = parseWriteValue(valueStr, mapEntry);
      if (parsed.value === null) return;
      onWrite(register.address, parsed.value);
      onClose();
    }
  };

  const placeholder = mapEntry?.showAsHex ? '0x0000' : '0';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Edit Register {register?.name || ''} (0x{register?.address.toString(16).toUpperCase()})
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
          helperText={mapEntry?.showAsHex ? 'Hex input (e.g. 1A2B or 0x1A2B)' : mapEntry?.type === 'float' ? 'Float value' : 'Integer value'}
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

interface ReadRegisterDialogProps {
  open: boolean;
  onClose: () => void;
  onRead: (address: number) => void;
}

function ReadRegisterDialog({ open, onClose, onRead }: ReadRegisterDialogProps) {
  const [address, setAddress] = useState(0);

  const handleRead = () => {
    onRead(address);
    onClose();
    setAddress(0);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Read Register</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Register Address (decimal)"
          type="number"
          fullWidth
          variant="outlined"
          value={address}
          onChange={(e) => setAddress(Number(e.target.value))}
          sx={{ mt: 2 }}
          helperText="Enter the register address in decimal format"
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

export interface RegistersPanelRef {
  openReadDialog: () => void;
  readAllMapped: () => void;
  refreshAll: () => void;
  canReadAll: () => boolean;
  canRefreshAll: () => boolean;
  isMapLoaded: boolean;
}

interface RegistersPanelProps {}

const RegistersPanel = forwardRef<RegistersPanelRef, RegistersPanelProps>((props, ref) => {
  const { state, actions } = useDSHub();
  const { settings, getActiveProfile } = useSettings();
  const { showError } = useToast();
  const [editDialog, setEditDialog] = useState<{ open: boolean; register: any; mapEntry?: MapEntry }>({
    open: false,
    register: null
  });
  const [readDialog, setReadDialog] = useState(false);
  const [currentTab, setCurrentTab] = useState(0);
  const [mapEntries, setMapEntries] = useState<MapEntry[]>([]);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(1000);
  const [editingValues, setEditingValues] = useState<{ [address: number]: string }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const debouncedSetFilter = useDebouncedCallback((query: string) => {
    setFilterQuery(query);
  }, 300);

  useEffect(() => {
    const initializeMaps = async () => {
      try {
        const activeProfile = getActiveProfile();

        // Check if the loaded profile matches the active profile
        const loadedProfileId = mapManager.getCurrentProfileId();
        const needsReload = loadedProfileId !== settings.activeMapProfileId;

        if (needsReload) {
          console.log(`[RegistersPanel] Profile mismatch - MapManager has '${loadedProfileId}', settings has '${settings.activeMapProfileId}'`);
          // Clear register data when profile changes
          actions.clearRegisters();

          // Force reload maps with new profile
          await mapManager.reload(activeProfile);
          console.log(`[RegistersPanel] MapManager reloaded with ${activeProfile?.name || 'default'} profile`);
        } else if (!mapManager.isInitialized()) {
          // First time initialization
          await mapManager.initialize(activeProfile);
          console.log(`[RegistersPanel] MapManager initialized for first time`);
        }

        // Update local state with current map entries
        const entries = mapManager.getAllRegisters();
        console.log(`[RegistersPanel] Loaded ${entries.length} register entries from mapManager`);
        setMapEntries(entries);
        setIsMapLoaded(true);
      } catch (error) {
        console.error('Failed to load register maps:', error);
      }
    };

    initializeMaps();
  }, [settings.activeMapProfileId, getActiveProfile, actions]);

  const canWrite = canWriteToDevice(state.connection);

  const handleRefreshAll = () => {
    // Read all visible registers in the current tab
    visibleRegisters.forEach((register) => {
      const mapEntry = getMapEntryForRegister(register.address);
      actions.readRegister(register.address, mapEntry?.name || register.name);
    });
  };

  const handleReadAllMapped = () => {
    // Read all registers defined in the map for current tab
    allMappedRegisters.forEach((mapEntry) => {
      actions.readRegister(mapEntry.address, mapEntry.name);
    });
  };

  const handleEditRegister = (register: any, mapEntry?: MapEntry) => {
    setEditDialog({ open: true, register, mapEntry });
  };

  const handleWriteRegister = (address: number, value: number) => {
    actions.writeRegister(address, value);
  };

  const handleReadRegister = (address: number, name?: string) => {
    actions.readRegister(address, name);
  };

  const handleInlineValueChange = (address: number, value: string, mapEntry?: MapEntry) => {
    setEditingValues(prev => ({ ...prev, [address]: filterWriteValueFromMap(value, mapEntry) }));
  };

  const handleInlineValueWrite = (address: number, register: any, mapEntry: MapEntry | undefined) => {
    const valueStr = editingValues[address];
    if (valueStr !== undefined && valueStr !== '') {
      const result = parseWriteValue(valueStr, mapEntry);
      if (result.value === null) {
        showError(result.error);
        return;
      }

      actions.writeRegister(address, result.value);

      // Clear editing state to remove orange border indicator
      setEditingValues(prev => {
        const updated = { ...prev };
        delete updated[address];
        return updated;
      });

      // Read back after write to verify
      setTimeout(() => {
        actions.readRegister(address, mapEntry?.name || register.name);
      }, 100);
    }
  };

  const handleInlineValueKeyPress = (e: React.KeyboardEvent, address: number, register: any, mapEntry: MapEntry | undefined) => {
    if (e.key === 'Enter') {
      handleInlineValueWrite(address, register, mapEntry);
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

  const toggleRegisterAutoRefresh = (address: number, enabled: boolean) => {
    if (enabled) {
      // Get the proper name from the map or existing state
      const mapEntry = getMapEntryForRegister(address);
      const existingRegister = state.registers.get(address);
      const name = existingRegister?.name || mapEntry?.name;

      // Do an initial read with the proper name to ensure it's stored in state
      if (name) {
        actions.readRegister(address, name);
      }

      actions.addAutoRefreshRegister(address);
      // Enable auto-refresh if not already enabled
      if (!state.autoRefresh.enabled) {
        actions.setAutoRefresh(true, autoRefreshInterval);
      }
    } else {
      actions.removeAutoRefreshRegister(address);
      // Disable auto-refresh if no addresses are active
      if (state.autoRefresh.activeAddresses.size === 1 && state.autoRefresh.activeParameterAddresses.size === 0) {
        // This is the last address, disable auto-refresh
        actions.setAutoRefresh(false);
      }
    }
  };

  const toggleAllRegistersAutoRefresh = (enabled: boolean) => {
    visibleRegisters.forEach((register) => {
      if (enabled) {
        // Get the proper name from the map or existing state
        const mapEntry = getMapEntryForRegister(register.address);
        const name = register.name || mapEntry?.name;

        // Do an initial read with the proper name to ensure it's stored in state
        if (name) {
          actions.readRegister(register.address, name);
        }

        actions.addAutoRefreshRegister(register.address);
      } else {
        actions.removeAutoRefreshRegister(register.address);
      }
    });

    // Enable/disable auto-refresh based on state
    if (enabled) {
      actions.setAutoRefresh(true, autoRefreshInterval);
    } else {
      // Only disable if parameters are also empty
      if (state.autoRefresh.activeParameterAddresses.size === 0) {
        actions.setAutoRefresh(false);
      }
    }
  };

  const getMapEntryForRegister = (address: number): MapEntry | undefined => {
    return mapEntries.find(entry => entry.address === address);
  };

  const formatRegisterValue = (register: any): string => {
    const mapEntry = getMapEntryForRegister(register.address);
    return formatDataValue(register.value, mapEntry);
  };

  const getRegistersForCurrentTab = () => {
    if (!isMapLoaded || mapEntries.length === 0) {
      // Fallback to actual registers if no map data
      return Array.from(state.registers.values()).sort((a, b) => a.address - b.address);
    }

    const mappedEntries = currentTab === 0 
      ? mapManager.getReadOnlyRegisters() 
      : mapManager.getReadWriteRegisters();

    // Create combined list: map entries with actual values where available
    return mappedEntries.map(mapEntry => {
      const actualRegister = state.registers.get(mapEntry.address);
      return actualRegister || {
        address: mapEntry.address,
        name: mapEntry.name,
        value: null, // Placeholder for unread values
        valid: false,
        timestamp: 0
      };
    }).sort((a, b) => a.address - b.address);
  };

  const getAllMappedRegisters = () => {
    if (currentTab === 0) {
      return mapManager.getReadOnlyRegisters();
    } else {
      return mapManager.getReadWriteRegisters();
    }
  };

  const visibleRegisters = getRegistersForCurrentTab();
  const allMappedRegisters = getAllMappedRegisters();

  const filteredRegisters = filterQuery
    ? visibleRegisters.filter(register => {
        const query = filterQuery.toLowerCase();
        const mapEntry = getMapEntryForRegister(register.address);
        const name = (register.name || mapEntry?.name || '').toLowerCase();
        const addressDec = register.address.toString();
        const addressHex = '0x' + register.address.toString(16).toLowerCase();
        return name.includes(query) || addressDec.includes(query) || addressHex.includes(query);
      })
    : visibleRegisters;

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
      {/* Auto-refresh interval selector */}
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
                  <MenuItem value={500}>500ms</MenuItem>
                  <MenuItem value={1000}>1s</MenuItem>
                  <MenuItem value={2000}>2s</MenuItem>
                  <MenuItem value={5000}>5s</MenuItem>
                  <MenuItem value={10000}>10s</MenuItem>
                </Select>
              </FormControl>

              <Typography variant="body2" color="text.secondary">
                Active: {state.autoRefresh.activeAddresses.size} registers
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {!state.connection?.connected && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Device not connected. Please connect to a device to view registers.
        </Alert>
      )}

      {!canWrite && state.connection?.connected && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Write operations disabled. Take control of the device to enable register writes.
        </Alert>
      )}

      {isMapLoaded && (
        <Box sx={{ mb: 1 }}>
          <Tabs
            value={currentTab}
            onChange={(_, value) => setCurrentTab(value)}
          >
            <Tab
              icon={<LockIcon sx={{ fontSize: 14 }} />}
              iconPosition="start"
              label={`Read Only (${mapManager.getReadOnlyRegisters().length})`}
            />
            <Tab
              icon={<LockOpenIcon sx={{ fontSize: 14 }} />}
              iconPosition="start"
              label={`Read/Write (${mapManager.getReadWriteRegisters().length})`}
            />
          </Tabs>
        </Box>
      )}

      {visibleRegisters.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary" align="center">
              No register data available. Use "Read Register" to manually read specific registers,
              or connect to a device that automatically updates register values.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">
                Register Data ({filteredRegisters.length}{filterQuery ? ` / ${visibleRegisters.length}` : ''} registers)
                {isMapLoaded && (
                  <Chip
                    label={currentTab === 0 ? 'Read Only' : 'Read/Write'}
                    size="small"
                    color={currentTab === 0 ? 'default' : 'primary'}
                    sx={{ ml: 1 }}
                  />
                )}
              </Typography>
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
                          checked={visibleRegisters.length > 0 && visibleRegisters.every(r => state.autoRefresh.activeAddresses.has(r.address))}
                          indeterminate={visibleRegisters.some(r => state.autoRefresh.activeAddresses.has(r.address)) && !visibleRegisters.every(r => state.autoRefresh.activeAddresses.has(r.address))}
                          onChange={(e) => toggleAllRegistersAutoRefresh(e.target.checked)}
                          disabled={!state.connection?.connected || visibleRegisters.length === 0}
                        />
                      </Box>
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRegisters.map((register) => {
                    const mapEntry = getMapEntryForRegister(register.address);
                    // Extract array index from name if it's an array element (e.g., "NAME[5]" -> "5")
                    const arrayIndexMatch = (register.name || mapEntry?.name || '').match(/\[(\d+)\]$/);
                    const arrayIndex = arrayIndexMatch ? arrayIndexMatch[1] : null;

                    return (
                      <TableRow key={register.address} hover>
                        <TableCell sx={{ py: 0.5 }}>
                          <Typography variant="body2" fontFamily={FONT_MONO}>
                            0x{register.address.toString(16).toUpperCase().padStart(2, '0')} ({register.address})
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
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            color={(!register.name && !mapEntry?.name) ? 'error' : 'inherit'}
                          >
                            {register.name || mapEntry?.name || <em>Missing name in map</em>}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Tooltip title={mapEntry ? `Data type: ${mapEntry.type}` : 'Unknown type'}>
                            <Chip
                              label={mapEntry?.type || 'unknown'}
                              size="small"
                              variant="outlined"
                              color={mapEntry?.showAsHex ? 'secondary' : 'default'}
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          {mapEntry?.accessPermit === DataAccessPermit.READ_WRITE && state.connection?.connected ? (
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                              <TextField
                                variant="outlined"
                                size="small"
                                placeholder="Write value..."
                                value={editingValues[register.address] || ''}
                                onChange={(e) => handleInlineValueChange(register.address, e.target.value, mapEntry)}
                                onKeyDown={(e) => handleInlineValueKeyPress(e, register.address, register, mapEntry)}
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
                                      borderColor: editingValues[register.address] ? 'primary.main' : undefined,
                                      borderWidth: editingValues[register.address] ? 1.5 : 1
                                    }
                                  }
                                }}
                              />
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, position: 'relative' }}>
                                <Typography variant="body2" fontFamily={FONT_MONO}>
                                  {formatRegisterValue(register)}
                                </Typography>
                                <Box sx={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {editingValues[register.address] && register.value !== null && (() => {
                                    // Handle float comparison properly
                                    if (mapEntry?.type === 'float') {
                                      const writtenFloat = parseFloat(editingValues[register.address]);
                                      const boardFloat = int32ToFloat(register.value);
                                      const tolerance = 0.0001; // Small tolerance for floating point comparison
                                      return !isNaN(writtenFloat) && Math.abs(writtenFloat - boardFloat) > tolerance ? (
                                        <Tooltip title={`Mismatch: Wrote ${formatFloat(writtenFloat)} but read ${formatFloat(boardFloat)}`}>
                                          <Box component="span" sx={{ color: 'error.main', display: 'flex', alignItems: 'center' }}>
                                            ⚠️
                                          </Box>
                                        </Tooltip>
                                      ) : null;
                                    } else {
                                      const writtenValue = mapEntry?.showAsHex ? parseInt(editingValues[register.address], 16) : parseInt(editingValues[register.address], 10);
                                      const boardValue = register.value;
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
                          ) : (
                            <Typography variant="body2" fontFamily={FONT_MONO}>
                              {formatRegisterValue(register)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Chip
                            label={register.value === null ? 'Not Read' : (register.valid ? 'Valid' : 'Invalid')}
                            color={register.value === null ? 'default' : (register.valid ? 'success' : 'error')}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Typography variant="caption">
                            {register.timestamp === 0 ? '---' : new Date(register.timestamp).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Tooltip title={state.autoRefresh.activeAddresses.has(register.address) ? 'Remove from auto-refresh' : 'Add to auto-refresh'}>
                            <Checkbox
                              size="small"
                              checked={state.autoRefresh.activeAddresses.has(register.address)}
                              onChange={(e) => toggleRegisterAutoRefresh(register.address, e.target.checked)}
                              disabled={!state.connection?.connected}
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title="Refresh register value">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  const mapEntry = getMapEntryForRegister(register.address);
                                  actions.readRegister(register.address, mapEntry?.name || register.name);
                                }}
                                disabled={!state.connection?.connected}
                              >
                                <RefreshIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={currentTab === 0 ? 'Read-only register' : 'Edit register value'}>
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => handleEditRegister(register, mapEntry)}
                                  disabled={!canWrite || currentTab === 0}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </span>
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

      <RegisterEditDialog
        open={editDialog.open}
        register={editDialog.register}
        mapEntry={editDialog.mapEntry}
        onClose={() => setEditDialog({ open: false, register: null })}
        onWrite={handleWriteRegister}
      />

      <ReadRegisterDialog
        open={readDialog}
        onClose={() => setReadDialog(false)}
        onRead={handleReadRegister}
      />
    </Box>
  );
});

RegistersPanel.displayName = 'RegistersPanel';

export default RegistersPanel;