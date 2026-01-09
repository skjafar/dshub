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
import { MapEntry } from '../maps/mapParser';

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

  useEffect(() => {
    const initializeMaps = async () => {
      try {
        const activeProfile = getActiveProfile();
        await mapManager.initialize(activeProfile);
        setMapEntries(mapManager.getAllRegisters());
        setIsMapLoaded(true);
      } catch (error) {
        console.error('Failed to load register maps:', error);
      }
    };

    initializeMaps();
  }, [settings.activeMapProfileId, getActiveProfile]);

  const canWrite = state.connection?.connected && (
    (state.connection.interface === 'TCP' && state.connection.controlState === 1) ||
    (state.connection.interface === 'UDP' && state.connection.controlState === 2)
  );

  const handleRefreshAll = () => {
    // Read only registers that have been previously read (have actual values)
    visibleRegisters.forEach((register) => {
      if (register.value !== null && register.value !== undefined) {
        const mapEntry = getMapEntryForRegister(register.address);
        actions.readRegister(register.address, mapEntry?.name || register.name);
      }
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

  const handleAutoRefreshToggle = (enabled: boolean) => {
    actions.setAutoRefresh(enabled, autoRefreshInterval);
    
    if (enabled) {
      // Add all visible registers with values to auto-refresh
      visibleRegisters.forEach(register => {
        if (register.value !== null && register.value !== undefined) {
          actions.addAutoRefreshRegister(register.address);
        }
      });
    } else {
      // Clear all register addresses from auto-refresh
      actions.clearAutoRefreshAddresses();
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
      actions.addAutoRefreshRegister(address);
    } else {
      actions.removeAutoRefreshRegister(address);
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
    canRefreshAll: () => state.connection?.connected && visibleRegisters.filter(r => r.value !== null).length > 0,
    isMapLoaded
  }));

  return (
    <Box>
      {/* Auto-refresh controls */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={state.autoRefresh.enabled}
                    onChange={(e) => handleAutoRefreshToggle(e.target.checked)}
                    disabled={!state.connection?.connected}
                  />
                }
                label="Auto-refresh"
              />
              <TimerIcon color={state.autoRefresh.enabled ? 'primary' : 'disabled'} />
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Interval</InputLabel>
                <Select
                  value={autoRefreshInterval}
                  onChange={(e) => handleAutoRefreshIntervalChange(e.target.value as number)}
                  label="Interval"
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
                    <TableCell>Address</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Value</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Last Updated</TableCell>
                    <TableCell>Auto-Refresh</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleRegisters.map((register) => {
                    const mapEntry = getMapEntryForRegister(register.address);
                    return (
                      <TableRow key={register.address} hover>
                        <TableCell>
                          <Box>
                            <Typography variant="body2" fontFamily="monospace">
                              0x{register.address.toString(16).toUpperCase().padStart(4, '0')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {register.address}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {register.name || mapEntry?.name || `REG_${register.address}`}
                            </Typography>
                            {mapEntry && mapEntry.isArray && (
                              <Typography variant="caption" color="text.secondary">
                                Array element
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={mapEntry ? `Data type: ${mapEntry.type}` : 'Unknown type'}>
                            <Chip
                              label={mapEntry?.type || 'unknown'}
                              size="small"
                              variant="outlined"
                              color={mapEntry?.showAsHex ? 'secondary' : 'default'}
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontFamily="monospace">
                            {formatRegisterValue(register)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={register.value === null ? 'Not Read' : (register.valid ? 'Valid' : 'Invalid')}
                            color={register.value === null ? 'default' : (register.valid ? 'success' : 'error')}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {register.timestamp === 0 ? '---' : new Date(register.timestamp).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={state.autoRefresh.activeAddresses.has(register.address) ? 'Remove from auto-refresh' : 'Add to auto-refresh'}>
                            <Checkbox
                              size="small"
                              checked={state.autoRefresh.activeAddresses.has(register.address)}
                              onChange={(e) => toggleRegisterAutoRefresh(register.address, e.target.checked)}
                              disabled={!state.connection?.connected || register.value === null || register.value === undefined}
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell>
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