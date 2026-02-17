import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Typography,
  Chip
} from '@mui/material';
import {
  Security as ControlIcon,
  Link as ConnectedIcon,
  LinkOff as DisconnectedIcon,
  Build as ControlTakeIcon,
  PowerSettingsNew as DisconnectIcon
} from '@mui/icons-material';
import { useDSHub } from '../contexts/DSHubContext';
import { ControlInterfaceState, InterfaceType } from '../types/shared';
import { FONT_MONO } from '../theme';

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
  const { state, actions } = useDSHub();

  if (!state.connection) {
    return (
      <Box>
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
          No device connected. Please use the Device Scanner to discover and connect to a device.
        </Typography>
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
      <Grid container spacing={2}>
        {/* Connection Status */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1.5, display: 'block' }}>
                Connection
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: state.connection.connected ? 'success.main' : 'error.main',
                    boxShadow: state.connection.connected ? '0 0 8px' : 'none',
                    boxShadowColor: state.connection.connected ? 'success.main' : undefined,
                  }}
                />
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: '1rem', fontWeight: 600 }}>
                  {state.connection.connected ? 'Connected' : 'Disconnected'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 2, mb: 1.5 }}>
                <Typography variant="caption" sx={{ fontFamily: FONT_MONO, color: 'text.secondary' }}>
                  {state.connection.ip}:{state.connection.port}
                </Typography>
                <Chip label={state.connection.interface} size="small" variant="outlined" sx={{ fontFamily: FONT_MONO, fontSize: '0.6rem' }} />
              </Box>
              {state.connection.connected && (
                <Button variant="outlined" size="small" color="error" startIcon={<DisconnectIcon />} onClick={actions.disconnectDevice}>
                  Disconnect
                </Button>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Control Status */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1.5, display: 'block' }}>
                Control Interface
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: canControl ? 'success.main' : 'warning.main',
                    boxShadow: canControl ? '0 0 8px' : 'none',
                    boxShadowColor: canControl ? 'success.main' : undefined,
                  }}
                />
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: '1rem', fontWeight: 600 }}>
                  {controlState.label}
                </Typography>
              </Box>
              {!canControl && (
                <Button variant="contained" size="small" startIcon={<ControlTakeIcon />} onClick={actions.takeControl} disabled={!state.connection.connected}>
                  Take Control
                </Button>
              )}
              {canControl && (
                <Typography variant="caption" color="success.main" sx={{ fontFamily: FONT_MONO }}>
                  Write operations enabled
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Stat Bar */}
        <Grid size={12}>
          <Card>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {stateRegister && (
                  <Box>
                    <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1 }}>
                      Device State
                    </Typography>
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: '1.5rem', fontWeight: 700, color: 'primary.main', lineHeight: 1.3 }}>
                      {stateRegister.value}
                    </Typography>
                  </Box>
                )}
                {warningsRegister && (
                  <Box>
                    <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1 }}>
                      Warnings
                    </Typography>
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: '1.5rem', fontWeight: 700, color: warningsRegister.value > 0 ? 'error.main' : 'success.main', lineHeight: 1.3 }}>
                      {warningsRegister.value}
                    </Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1 }}>
                    Registers
                  </Typography>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.3 }}>
                    {state.registers.size}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1 }}>
                    Parameters
                  </Typography>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.3 }}>
                    {state.parameters.size}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1 }}>
                    Log Entries
                  </Typography>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.3 }}>
                    {state.logs.length}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1 }}>
                    Plot Series
                  </Typography>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.3 }}>
                    {state.plotData.size}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Registers */}
        <Grid size={12}>
          <Card>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1, display: 'block' }}>
                Recent Register Updates
              </Typography>
              {state.registers.size === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  No register data available
                </Typography>
              ) : (
                <Box sx={{ maxHeight: 280, overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {Array.from(state.registers.values())
                        .sort((a, b) => b.timestamp - a.timestamp)
                        .slice(0, 10)
                        .map((register) => (
                          <tr key={register.address} style={{ borderBottom: '1px solid var(--mui-palette-divider, rgba(255,255,255,0.04))' }}>
                            <td style={{ padding: '4px 8px 4px 0' }}>
                              <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8125rem' }}>
                                {register.name}
                              </Typography>
                              <Typography variant="caption" sx={{ fontFamily: FONT_MONO, fontSize: '0.6rem', color: 'text.secondary' }}>
                                0x{register.address.toString(16).toUpperCase()}
                              </Typography>
                            </td>
                            <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                              <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.875rem', fontWeight: 600 }}>
                                {register.value}
                              </Typography>
                            </td>
                            <td style={{ padding: '4px 0 4px 8px', textAlign: 'right' }}>
                              <Typography variant="caption" sx={{ fontFamily: FONT_MONO, fontSize: '0.6rem', color: 'text.secondary' }}>
                                {new Date(register.timestamp).toLocaleTimeString()}
                              </Typography>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}