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
  Checkbox
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Timer as TimerIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon
} from '@mui/icons-material';
import { useDeviceMon } from '../contexts/DeviceMonContext';
import { useSettings } from '../contexts/SettingsContext';
import { mapManager } from '../maps/mapManager';
import { MapEntry, DataAccessPermit, DataForm } from '../maps/mapParser';
import { int32ToFloat, floatToInt32, formatFloat } from '../utils/floatConversion';

interface RegisterEditDialogProps {
  open: boolean;
  register: { address: number; name: string; value: number | null } | null;
  onClose: () => void;
  onWrite: (address: number, value: number) => void;
}

function RegisterEditDialog({ open, register, onClose, onWrite }: RegisterEditDialogProps) {
  const [value, setValue] = useState(0);

  // Update value when register changes
  useEffect(() => {
    if (register) {
      setValue(register.value ?? 0);
    }
  }, [register]);

  const handleWrite = () => {
    if (register) {
      onWrite(register.address, value);
      onClose();
    }
  };

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
          type="number"
          fullWidth
          variant="outlined"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          sx={{ mt: 2 }}
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
  const { state, actions } = useDeviceMon();
  const { settings, getActiveProfile } = useSettings();
  const [editDialog, setEditDialog] = useState<{ open: boolean; register: any }>({
    open: false,
    register: null
  });
  const [readDialog, setReadDialog] = useState(false);
  const [currentTab, setCurrentTab] = useState(0);
  const [mapEntries, setMapEntries] = useState<MapEntry[]>([]);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(1000);
  const [editingValues, setEditingValues] = useState<{ [address: number]: string }>({});

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

  const canWrite = state.connection?.connected && (
    (state.connection.interface === 'TCP' && state.connection.controlState === 1) ||
    (state.connection.interface === 'UDP' && state.connection.controlState === 2)
  );

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

  const handleEditRegister = (register: any) => {
    setEditDialog({ open: true, register });
  };

  const handleWriteRegister = (address: number, value: number) => {
    actions.writeRegister(address, value);
  };

  const handleReadRegister = (address: number, name?: string) => {
    actions.readRegister(address, name);
  };

  const handleInlineValueChange = (address: number, value: string) => {
    setEditingValues(prev => ({ ...prev, [address]: value }));
  };

  const handleInlineValueWrite = (address: number, register: any, mapEntry: MapEntry | undefined) => {
    const valueStr = editingValues[address];
    if (valueStr !== undefined && valueStr !== '') {
      let parsedValue: number;

      // Handle float type - convert to int32 representation
      if (mapEntry?.type === 'float') {
        const floatValue = parseFloat(valueStr);
        if (isNaN(floatValue)) return;
        parsedValue = floatToInt32(floatValue);
      } else if (mapEntry?.showAsHex) {
        parsedValue = parseInt(valueStr, 16);
      } else {
        parsedValue = parseInt(valueStr, 10);
      }

      if (!isNaN(parsedValue)) {
        actions.writeRegister(address, parsedValue);
        // Read back after write to verify
        setTimeout(() => {
          actions.readRegister(address, mapEntry?.name || register.name);
        }, 100);
      }
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
    if (register.value === null || register.value === undefined) {
      return '---'; // Placeholder for unread values
    }

    const mapEntry = getMapEntryForRegister(register.address);

    // Handle float type - convert from int32 representation
    if (mapEntry?.type === 'float') {
      const floatValue = int32ToFloat(register.value);
      return formatFloat(floatValue);
    }

    if (mapEntry?.showAsHex) {
      return `0x${register.value.toString(16).toUpperCase()}`;
    }
    return register.value.toString();
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
        <Box sx={{ mb: 2 }}>
          <Tabs value={currentTab} onChange={(_, value) => setCurrentTab(value)}>
            <Tab 
              icon={<LockIcon />} 
              label={`Read Only (${mapManager.getReadOnlyRegisters().length})`}
            />
            <Tab 
              icon={<LockOpenIcon />} 
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
            <Typography variant="h6" gutterBottom>
              Register Data ({visibleRegisters.length} registers)
              {isMapLoaded && (
                <Chip 
                  label={currentTab === 0 ? 'Read Only' : 'Read/Write'} 
                  size="small" 
                  color={currentTab === 0 ? 'default' : 'primary'}
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
                  {visibleRegisters.map((register) => {
                    const mapEntry = getMapEntryForRegister(register.address);
                    // Extract array index from name if it's an array element (e.g., "NAME[5]" -> "5")
                    const arrayIndexMatch = (register.name || mapEntry?.name || '').match(/\[(\d+)\]$/);
                    const arrayIndex = arrayIndexMatch ? arrayIndexMatch[1] : null;

                    return (
                      <TableRow key={register.address} hover>
                        <TableCell sx={{ py: 0.5 }}>
                          <Typography variant="body2" fontFamily="monospace">
                            0x{register.address.toString(16).toUpperCase().padStart(2, '0')} ({register.address})
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
                                onChange={(e) => handleInlineValueChange(register.address, e.target.value)}
                                onKeyPress={(e) => handleInlineValueKeyPress(e, register.address, register, mapEntry)}
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
                                      borderColor: editingValues[register.address] ? 'warning.main' : undefined,
                                      borderWidth: editingValues[register.address] ? 2 : 1
                                    }
                                  }
                                }}
                              />
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, position: 'relative' }}>
                                <Typography variant="body2" fontFamily="monospace">
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
                            <Typography variant="body2" fontFamily="monospace">
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
                                  onClick={() => handleEditRegister(register)}
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