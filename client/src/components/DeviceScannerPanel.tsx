import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  IconButton,
  Paper,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { Refresh as RefreshIcon, Link as ConnectIcon, Add as AddIcon } from '@mui/icons-material';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ToastNotification';
import { InterfaceType, DEFAULT_TCP_PORT, DEFAULT_UDP_PORT } from '../types/shared';
import { mapManager } from '../maps/mapManager';

const formatMacAddress = (mac: string): string => {
  return mac.toUpperCase();
};

const formatFirmwareVersion = (version: number): string => {
  const major = (version >> 8) & 0xFF;
  const minor = version & 0xFF;
  return `${major}.${minor}`;
};

export default function DeviceScannerPanel() {
  const { state, actions } = useDSHub();
  const { settings, getActiveProfile, updateSettings } = useSettings();
  const { showSuccess, showWarning } = useToast();
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState(DEFAULT_TCP_PORT);
  const [manualInterface, setManualInterface] = useState<InterfaceType>(InterfaceType.TCP);
  const [ipError, setIpError] = useState('');

  // Initialize map manager on mount to load board types
  useEffect(() => {
    const initializeMaps = async () => {
      try {
        const activeProfile = getActiveProfile();
        await mapManager.initialize(activeProfile);
      } catch (error) {
        console.error('Failed to load board types map:', error);
      }
    };

    initializeMaps();
  }, [settings.activeMapProfileId, getActiveProfile]);

  // Load saved settings on mount
  useEffect(() => {
    if (settings.lastDeviceIP) {
      setManualIp(settings.lastDeviceIP);
    }
    setManualInterface(settings.lastInterfaceType === 'TCP' ? InterfaceType.TCP : InterfaceType.UDP);
  }, [settings.lastDeviceIP, settings.lastInterfaceType]);

  // Get board type name from map manager
  const getBoardTypeName = (typeId: number): string => {
    return mapManager.getBoardTypeName(typeId);
  };

  const validateIp = (ip: string): boolean => {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  };

  const handleConnect = (ip: string, tcpPort: number, udpPort: number, deviceName?: string) => {
    // Check if a device is already connected
    if (state.connection?.connected) {
      showWarning('A device is already connected. Disconnect the current device before connecting to another.');
      return;
    }

    // Save the device IP and name to settings
    updateSettings({
      lastDeviceIP: ip,
      lastDeviceName: deviceName,
      lastInterfaceType: 'TCP'
    });

    actions.connectDevice(ip, InterfaceType.TCP, deviceName);
    showSuccess(`Connecting to ${deviceName || ip}...`);
  };

  const handleManualConnect = () => {
    if (!manualIp.trim()) {
      setIpError('IP address is required');
      return;
    }

    if (!validateIp(manualIp)) {
      setIpError('Please enter a valid IP address (e.g., 192.168.1.100)');
      return;
    }

    // Check if a device is already connected
    if (state.connection?.connected) {
      showWarning('A device is already connected. Disconnect the current device before connecting to another.');
      return;
    }

    setIpError('');

    // Look up device name from discovered devices if available
    const discoveredDevice = state.discoveredDevices.find(d => d.ip_address === manualIp);
    const deviceName = discoveredDevice?.board_name;

    // Save the device IP, name, and interface to settings
    updateSettings({
      lastDeviceIP: manualIp,
      lastDeviceName: deviceName,
      lastInterfaceType: manualInterface === InterfaceType.TCP ? 'TCP' : 'UDP'
    });

    actions.connectDevice(manualIp, manualInterface, deviceName);
    showSuccess(`Connecting to ${deviceName || manualIp}...`);
  };

  const handleIpChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setManualIp(value);
    if (ipError && value.trim()) {
      setIpError('');
    }
  };

  const handleInterfaceChange = (event: any) => {
    const newInterface = event.target.value as InterfaceType;
    setManualInterface(newInterface);
    // Update port to match the interface type
    setManualPort(newInterface === InterfaceType.TCP ? DEFAULT_TCP_PORT : DEFAULT_UDP_PORT);
  };

  return (
    <Box>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Manual Connection
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Connect directly to a device using its IP address if you know it.
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Box sx={{ minWidth: '200px', flex: '1 1 200px' }}>
              <TextField
                fullWidth
                label="IP Address"
                placeholder="192.168.1.100"
                value={manualIp}
                onChange={handleIpChange}
                error={!!ipError}
                helperText={ipError}
                size="small"
              />
            </Box>
            <Box sx={{ minWidth: '120px', flex: '0 1 120px' }}>
              <FormControl fullWidth size="small">
                <InputLabel>Interface</InputLabel>
                <Select
                  value={manualInterface}
                  onChange={handleInterfaceChange}
                  label="Interface"
                >
                  <MenuItem value={InterfaceType.TCP}>TCP</MenuItem>
                  <MenuItem value={InterfaceType.UDP}>UDP</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ minWidth: '100px', flex: '0 1 100px' }}>
              <TextField
                fullWidth
                label="Port"
                type="number"
                value={manualPort}
                onChange={(e) => setManualPort(Number(e.target.value))}
                size="small"
                disabled
                helperText={`Default: ${manualInterface === InterfaceType.TCP ? DEFAULT_TCP_PORT : DEFAULT_UDP_PORT}`}
              />
            </Box>
            <Box sx={{ minWidth: '100px', flex: '0 1 100px' }}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleManualConnect}
                disabled={!manualIp.trim() || !!ipError}
                size="small"
                sx={{ height: '40px' }}
              >
                Connect
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {state.discoveredDevices.length === 0 && !state.isScanning && (
        <Card>
          <CardContent>
            <Typography color="text.secondary" align="center">
              No devices discovered. Click "Scan Network" to search for devices on your network.
            </Typography>
          </CardContent>
        </Card>
      )}

      {state.discoveredDevices.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Discovered Devices ({state.discoveredDevices.length})
            </Typography>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Board Name</TableCell>
                    <TableCell>IP Address</TableCell>
                    <TableCell>MAC Address</TableCell>
                    <TableCell>Board Type</TableCell>
                    <TableCell>Firmware</TableCell>
                    <TableCell>Ports</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {state.discoveredDevices.map((device) => (
                    <TableRow key={device.device_id} hover>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {device.board_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ID: {device.device_id}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {device.ip_address}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {formatMacAddress(device.mac_address)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getBoardTypeName(device.board_type)}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatFirmwareVersion(device.firmware_version)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="caption" display="block">
                            TCP: {device.tcp_port}
                          </Typography>
                          <Typography variant="caption" display="block">
                            UDP: {device.udp_port}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleConnect(device.ip_address, device.tcp_port, device.udp_port, device.board_name)}
                          title="Connect to device"
                        >
                          <ConnectIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {state.isScanning && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={24} />
              <Typography>
                Scanning network for devices... This may take a few seconds.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}