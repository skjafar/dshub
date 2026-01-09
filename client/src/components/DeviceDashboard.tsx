import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Typography,
  Chip,
  Alert,
  Divider
} from '@mui/material';
import {
  Security as ControlIcon,
  Link as ConnectedIcon,
  LinkOff as DisconnectedIcon,
  Build as ControlTakeIcon,
  PowerSettingsNew as DisconnectIcon
} from '@mui/icons-material';
import { useDeviceMon } from '../contexts/DeviceMonContext';
import { ControlInterfaceState, InterfaceType } from '../types/shared';

const getControlStateLabel = (state: ControlInterfaceState, currentInterface: InterfaceType) => {
  switch (state) {
    case ControlInterfaceState.UNDECIDED:
      return { label: 'Undecided', color: 'warning' as const };
    case ControlInterfaceState.TCP_DATASTREAM:
      return { 
        label: 'TCP Datastream', 
        color: currentInterface === InterfaceType.TCP ? 'success' as const : 'error' as const 
      };
    case ControlInterfaceState.UDP_DATASTREAM:
      return { 
        label: 'UDP Datastream', 
        color: currentInterface === InterfaceType.UDP ? 'success' as const : 'error' as const 
      };
    case ControlInterfaceState.TCP_CLI:
      return { label: 'TCP CLI', color: 'error' as const };
    case ControlInterfaceState.USB:
      return { label: 'USB CLI', color: 'error' as const };
    default:
      return { label: 'Unknown', color: 'default' as const };
  }
};

export default function DeviceDashboard() {
  const { state, actions } = useDeviceMon();

  if (!state.connection) {
    return (
      <Box>
        <Alert severity="info" sx={{ mb: 3 }}>
          No device connected. Please use the Device Scanner to discover and connect to a device.
        </Alert>
      </Box>
    );
  }

  const controlState = getControlStateLabel(state.connection.controlState, state.connection.interface);
  const canControl = state.connection.connected && (
    (state.connection.interface === InterfaceType.TCP && state.connection.controlState === ControlInterfaceState.TCP_DATASTREAM) ||
    (state.connection.interface === InterfaceType.UDP && state.connection.controlState === ControlInterfaceState.UDP_DATASTREAM)
  );

  // Get some key registers for display
  const stateRegister = Array.from(state.registers.values()).find(r => r.name.includes('STATE'));
  const warningsRegister = Array.from(state.registers.values()).find(r => r.name.includes('WARNING'));

  return (
    <Box>
      <Grid container spacing={3}>
        {/* Connection Status */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                {state.connection.connected ? (
                  <ConnectedIcon color="success" sx={{ mr: 1 }} />
                ) : (
                  <DisconnectedIcon color="error" sx={{ mr: 1 }} />
                )}
                <Typography variant="h6">
                  Connection Status
                </Typography>
              </Box>
              
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Device Address: {state.connection.ip}:{state.connection.port}
              </Typography>
              
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Interface: {state.connection.interface}
              </Typography>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                <Chip
                  label={state.connection.connected ? 'Connected' : 'Disconnected'}
                  color={state.connection.connected ? 'success' : 'error'}
                  size="small"
                />

                {state.connection.connected && (
                  <Button
                    variant="outlined"
                    size="small"
                    color="error"
                    startIcon={<DisconnectIcon />}
                    onClick={actions.disconnectDevice}
                  >
                    Disconnect
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Control Status */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <ControlIcon color={canControl ? 'success' : 'warning'} sx={{ mr: 1 }} />
                <Typography variant="h6">
                  Control Interface
                </Typography>
              </Box>
              
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Current Control State
              </Typography>
              
              <Chip
                label={controlState.label}
                color={controlState.color}
                size="small"
                sx={{ mt: 1, mb: 2 }}
              />
              
              {!canControl && (
                <Box>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<ControlTakeIcon />}
                    onClick={actions.takeControl}
                    disabled={!state.connection.connected}
                  >
                    Take Control
                  </Button>
                </Box>
              )}
              
              {canControl && (
                <Alert severity="success" sx={{ mt: 1 }}>
                  Write operations enabled
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Key Registers */}
        {stateRegister && (
          <Grid size={{ xs: 12, md: 4 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Device State
                </Typography>
                <Typography variant="h4" color="primary">
                  {stateRegister.value}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Address: 0x{stateRegister.address.toString(16).toUpperCase()}
                </Typography>
                <Typography variant="caption" display="block" color="text.secondary">
                  Updated: {new Date(stateRegister.timestamp).toLocaleTimeString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}

        {warningsRegister && (
          <Grid size={{ xs: 12, md: 4 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Warnings
                </Typography>
                <Typography variant="h4" color={warningsRegister.value > 0 ? 'error' : 'success'}>
                  {warningsRegister.value}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Address: 0x{warningsRegister.address.toString(16).toUpperCase()}
                </Typography>
                <Typography variant="caption" display="block" color="text.secondary">
                  Updated: {new Date(warningsRegister.timestamp).toLocaleTimeString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Statistics */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Statistics
              </Typography>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Registers: {state.registers.size}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Parameters: {state.parameters.size}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Log Entries: {state.logs.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Plot Series: {state.plotData.size}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Registers */}
        <Grid size={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Register Updates
              </Typography>
              {state.registers.size === 0 ? (
                <Typography color="text.secondary">
                  No register data available. Registers will appear here as they are updated.
                </Typography>
              ) : (
                <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {Array.from(state.registers.values())
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, 10)
                    .map((register) => (
                      <Box key={register.address} sx={{ mb: 1, pb: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="body2" fontWeight="medium">
                            {register.name} (0x{register.address.toString(16).toUpperCase()})
                          </Typography>
                          <Typography variant="body2" fontFamily="monospace">
                            {register.value}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(register.timestamp).toLocaleString()}
                        </Typography>
                        <Divider sx={{ mt: 1 }} />
                      </Box>
                    ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}