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
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip
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
      {/* Scanning progress bar */}
      {state.isScanning && (
        <Box
          sx={{
            height: 2,
            mb: 2,
            borderRadius: 1,
            overflow: 'hidden',
            backgroundColor: 'action.hover',
          }}
        >
          <Box
            sx={{
              height: '100%',
              width: '30%',
              backgroundColor: 'primary.main',
              borderRadius: 1,
              animation: 'scanLine 1.5s ease-in-out infinite',
              '@keyframes scanLine': {
                '0%': { transform: 'translateX(-100%)' },
                '100%': { transform: 'translateX(400%)' },
              },
            }}
          />
        </Box>
      )}

      {/* Manual Connection */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Typography
              variant="overline"
              sx={{ alignSelf: 'center', color: 'text.secondary', mr: 0.5 }}
            >
              Manual
            </Typography>
            <Box sx={{ minWidth: '180px', flex: '1 1 180px' }}>
              <TextField
                fullWidth
                label="IP Address"
                placeholder="192.168.1.100"
                value={manualIp}
                onChange={handleIpChange}
                error={!!ipError}
                helperText={ipError}
                size="small"
                sx={{ '& .MuiInputBase-input': { fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem' } }}
              />
            </Box>
            <Box sx={{ minWidth: '100px', flex: '0 1 100px' }}>
              <FormControl fullWidth size="small">
                <InputLabel>Interface</InputLabel>
                <Select
                  value={manualInterface}
                  onChange={handleInterfaceChange}
                  label="Interface"
                  sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem' }}
                >
                  <MenuItem value={InterfaceType.TCP}>TCP</MenuItem>
                  <MenuItem value={InterfaceType.UDP}>UDP</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ minWidth: '90px', flex: '0 1 90px' }}>
              <TextField
                fullWidth
                label="Port"
                type="number"
                value={manualPort}
                onChange={(e) => setManualPort(Number(e.target.value))}
                size="small"
                disabled
                sx={{ '& .MuiInputBase-input': { fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem' } }}
              />
            </Box>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleManualConnect}
              disabled={!manualIp.trim() || !!ipError}
              size="small"
              sx={{ height: '40px', minWidth: '100px' }}
            >
              Connect
            </Button>
          </Box>
        </CardContent>
      </Card>

      {state.discoveredDevices.length === 0 && !state.isScanning && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, color: 'text.secondary' }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            No devices discovered
          </Typography>
          <Typography variant="caption">
            Click "Scan Network" to search for devices on your network
          </Typography>
        </Box>
      )}

      {state.discoveredDevices.length > 0 && (
        <Card>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1, display: 'block' }}>
              Discovered Devices ({state.discoveredDevices.length})
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Board Name</TableCell>
                    <TableCell>IP Address</TableCell>
                    <TableCell>MAC Address</TableCell>
                    <TableCell>Board Type</TableCell>
                    <TableCell>FW</TableCell>
                    <TableCell>Ports</TableCell>
                    <TableCell sx={{ width: 48 }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {state.discoveredDevices.map((device) => (
                    <TableRow key={device.device_id} hover sx={{ cursor: 'pointer' }} onClick={() => handleConnect(device.ip_address, device.tcp_port, device.udp_port, device.board_name)}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8125rem' }}>
                          {device.board_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6rem' }}>
                          {device.device_id}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem' }}>
                          {device.ip_address}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem', color: 'text.secondary' }}>
                          {formatMacAddress(device.mac_address)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getBoardTypeName(device.board_type)}
                          size="small"
                          variant="outlined"
                          sx={{ fontFamily: '"JetBrains Mono", monospace' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem' }}>
                          {formatFirmwareVersion(device.firmware_version)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: 'text.secondary' }}>
                          {device.tcp_port}/{device.udp_port}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Connect">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={(e) => { e.stopPropagation(); handleConnect(device.ip_address, device.tcp_port, device.udp_port, device.board_name); }}
                          >
                            <ConnectIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 2, color: 'text.secondary' }}>
          <CircularProgress size={14} sx={{ color: 'primary.main' }} />
          <Typography variant="caption">
            Scanning network...
          </Typography>
        </Box>
      )}
    </Box>
  );
}