import React, { useState, useEffect } from 'react';
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
  Timer as TimerIcon
} from '@mui/icons-material';
import { useDeviceMon } from '../contexts/DeviceMonContext';
import { useSettings } from '../contexts/SettingsContext';
import { mapManager } from '../maps/mapManager';
import { MapEntry } from '../maps/mapParser';

interface ParameterEditDialogProps {
  open: boolean;
  parameter: { address: number; name: string; value: number | null } | null;
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

export default function ParametersPanel() {
  const { state, actions } = useDeviceMon();
  const { settings, getActiveProfile } = useSettings();
  const [editDialog, setEditDialog] = useState<{ open: boolean; parameter: any }>({
    open: false,
    parameter: null
  });
  const [readDialog, setReadDialog] = useState(false);
  const [mapEntries, setMapEntries] = useState<MapEntry[]>([]);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(2000);

  useEffect(() => {
    const initializeMaps = async () => {
      try {
        const activeProfile = getActiveProfile();
        await mapManager.initialize(activeProfile);
        setMapEntries(mapManager.getAllParameters());
        setIsMapLoaded(true);
      } catch (error) {
        console.error('Failed to load parameter maps:', error);
      }
    };

    initializeMaps();
  }, [settings.activeMapProfileId, getActiveProfile]);

  const canWrite = state.connection?.connected && (
    (state.connection.interface === 'TCP' && state.connection.controlState === 1) ||
    (state.connection.interface === 'UDP' && state.connection.controlState === 2)
  );

  const handleRefreshAll = () => {
    // Read only parameters that have been previously read (have actual values)
    parameters.forEach((parameter) => {
      if (parameter.value !== null && parameter.value !== undefined) {
        actions.readParameter(parameter.address);
      }
    });
  };

  const handleReadAllMapped = () => {
    // Read all parameters defined in the map
    mapEntries.forEach((mapEntry) => {
      actions.readParameter(mapEntry.address);
    });
  };

  const handleEditParameter = (parameter: any) => {
    setEditDialog({ open: true, parameter });
  };

  const handleWriteParameter = (address: number, value: number) => {
    actions.writeParameter(address, value);
  };

  const handleReadParameter = (address: number) => {
    actions.readParameter(address);
  };

  const handleAutoRefreshToggle = (enabled: boolean) => {
    actions.setAutoRefresh(enabled, autoRefreshInterval);
    
    if (enabled) {
      // Add all visible parameters with values to auto-refresh
      parameters.forEach(parameter => {
        if (parameter.value !== null && parameter.value !== undefined) {
          actions.addAutoRefreshParameter(parameter.address);
        }
      });
    } else {
      // Clear all parameter addresses from auto-refresh
      actions.clearAutoRefreshAddresses();
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
      actions.addAutoRefreshParameter(address);
    } else {
      actions.removeAutoRefreshParameter(address);
    }
  };

  const getMapEntryForParameter = (address: number): MapEntry | undefined => {
    return mapEntries.find(entry => entry.address === address);
  };

  const formatParameterValue = (parameter: any): string => {
    if (parameter.value === null || parameter.value === undefined) {
      return '---'; // Placeholder for unread values
    }
    
    const mapEntry = getMapEntryForParameter(parameter.address);
    if (mapEntry?.showAsHex) {
      return `0x${parameter.value.toString(16).toUpperCase()}`;
    }
    return parameter.value.toString();
  };

  const getParametersToShow = () => {
    if (!isMapLoaded || mapEntries.length === 0) {
      // Fallback to actual parameters if no map data
      return Array.from(state.parameters.values()).sort((a, b) => a.address - b.address);
    }

    // Create combined list: map entries with actual values where available
    return mapEntries.map(mapEntry => {
      const actualParameter = state.parameters.get(mapEntry.address);
      return actualParameter || {
        address: mapEntry.address,
        name: mapEntry.name,
        value: null, // Placeholder for unread values
        valid: false,
        timestamp: 0
      };
    }).sort((a, b) => a.address - b.address);
  };

  const parameters = getParametersToShow();

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" component="h1">
          Device Parameters
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setReadDialog(true)}
            disabled={!state.connection?.connected}
          >
            Read Parameter
          </Button>
          {isMapLoaded && (
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleReadAllMapped}
              disabled={!state.connection?.connected}
            >
              Read All Mapped
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={handleRefreshAll}
            disabled={!state.connection?.connected || parameters.filter(p => p.value !== null).length === 0}
          >
            Refresh All
          </Button>
        </Box>
      </Box>

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

      {parameters.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary" align="center">
              No parameter data available. Use "Read Parameter" to manually read specific parameters,
              or connect to a device that automatically loads parameter values.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Parameter Data ({parameters.length} parameters)
              {isMapLoaded && (
                <Chip 
                  label={`${mapEntries.length} mapped`}
                  size="small" 
                  color="primary"
                  variant="outlined"
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
                  {parameters.map((parameter) => {
                    const mapEntry = getMapEntryForParameter(parameter.address);
                    return (
                      <TableRow key={parameter.address} hover>
                        <TableCell>
                          <Box>
                            <Typography variant="body2" fontFamily="monospace">
                              0x{parameter.address.toString(16).toUpperCase().padStart(4, '0')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {parameter.address}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {parameter.name || mapEntry?.name || `PARAM_${parameter.address}`}
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
                            {formatParameterValue(parameter)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={parameter.value === null ? 'Not Read' : (parameter.valid ? 'Valid' : 'Invalid')}
                            color={parameter.value === null ? 'default' : (parameter.valid ? 'success' : 'error')}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {parameter.timestamp === 0 ? '---' : new Date(parameter.timestamp).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={state.autoRefresh.activeParameterAddresses.has(parameter.address) ? 'Remove from auto-refresh' : 'Add to auto-refresh'}>
                            <Checkbox
                              size="small"
                              checked={state.autoRefresh.activeParameterAddresses.has(parameter.address)}
                              onChange={(e) => toggleParameterAutoRefresh(parameter.address, e.target.checked)}
                              disabled={!state.connection?.connected || parameter.value === null || parameter.value === undefined}
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title="Refresh parameter value">
                              <IconButton
                                size="small"
                                onClick={() => actions.readParameter(parameter.address)}
                                disabled={!state.connection?.connected}
                              >
                                <RefreshIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Edit parameter value">
                              <IconButton
                                size="small"
                                onClick={() => handleEditParameter(parameter)}
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
}