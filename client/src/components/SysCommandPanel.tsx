import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert,
  Paper,
  Divider,
  Chip
} from '@mui/material';
import {
  Send as SendIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ToastNotification';

export default function SysCommandPanel() {
  const { state, actions } = useDSHub();
  const { getActiveProfile } = useSettings();
  const { showSuccess, showError } = useToast();

  // Get commands from active profile
  const activeProfile = getActiveProfile();
  const profileCommands = activeProfile?.sysCommands || [];

  // Initialize with first command or 0
  const [commandCode, setCommandCode] = useState<number>(profileCommands.length > 0 ? profileCommands[0].code : 0);
  const [commandValue, setCommandValue] = useState<number>(0);
  const [lastResponse, setLastResponse] = useState<{ command: number; result: number; success: boolean } | null>(null);

  const canSend = state.connection?.connected && (
    (state.connection.interface === 'TCP' && state.connection.controlState === 1) ||
    (state.connection.interface === 'UDP' && state.connection.controlState === 2)
  );

  const handleSendCommand = () => {
    if (!canSend) {
      showError('Not connected or control not taken');
      return;
    }

    try {
      actions.sendCommand(commandCode, commandValue);
      showSuccess(`Sent SYS_COMMAND ${commandCode} with value ${commandValue}`);

      // Store the sent command for display
      setLastResponse({
        command: commandCode,
        result: 0, // Will be updated when response arrives
        success: true
      });
    } catch (error) {
      showError(`Failed to send command: ${error}`);
      setLastResponse({
        command: commandCode,
        result: -1,
        success: false
      });
    }
  };

  const handleQuickCommand = (code: number) => {
    setCommandCode(code);
    setCommandValue(0);
  };

  const getCommandInfo = (code: number) => {
    return profileCommands.find(cmd => cmd.code === code);
  };

  const currentCommandInfo = getCommandInfo(commandCode);

  return (
    <Box>
      {!state.connection?.connected && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Device not connected. Please connect to a device to send SYS_COMMANDs.
        </Alert>
      )}

      {!canSend && state.connection?.connected && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Take control of the device to send SYS_COMMANDs.
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Manual Command Entry and Quick Commands */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SendIcon />
                Send SYS_COMMAND
              </Typography>

              <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Command Code"
                  type="number"
                  fullWidth
                  value={commandCode}
                  onChange={(e) => setCommandCode(Number(e.target.value))}
                  helperText={currentCommandInfo ? currentCommandInfo.name : 'Custom command code'}
                />

                <TextField
                  label="Value (Optional)"
                  type="number"
                  fullWidth
                  value={commandValue}
                  onChange={(e) => setCommandValue(Number(e.target.value))}
                  helperText="Command-specific value parameter"
                />

                {currentCommandInfo && (
                  <Paper sx={{ p: 1.5, bgcolor: 'info.lighter' }}>
                    <Typography variant="body2" color="info.main" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <InfoIcon fontSize="small" />
                      {currentCommandInfo.description}
                    </Typography>
                  </Paper>
                )}

                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  onClick={handleSendCommand}
                  disabled={!canSend}
                  startIcon={<SendIcon />}
                >
                  Send Command
                </Button>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Commands
              </Typography>
              <Divider sx={{ mb: 2 }} />

              {profileCommands.length === 0 ? (
                <Alert severity="info">
                  No SYS_COMMANDs defined in this profile. Go to Map Editor to add commands.
                </Alert>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: '400px', overflowY: 'auto' }}>
                  {profileCommands.map((cmd) => (
                    <Paper
                      key={cmd.code}
                      sx={{
                        p: 1.5,
                        cursor: 'pointer',
                        '&:hover': {
                          bgcolor: 'action.hover'
                        },
                        border: commandCode === cmd.code ? '2px solid' : '1px solid',
                        borderColor: commandCode === cmd.code ? 'primary.main' : 'divider'
                      }}
                      onClick={() => handleQuickCommand(cmd.code)}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {cmd.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {cmd.description}
                          </Typography>
                        </Box>
                        <Chip label={cmd.code} size="small" variant="outlined" />
                      </Box>
                    </Paper>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* Last Response */}
        {lastResponse && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Last Command Response
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Chip
                  label={lastResponse.success ? 'Success' : 'Failed'}
                  color={lastResponse.success ? 'success' : 'error'}
                  size="small"
                />
                <Typography variant="body2">
                  Command: <strong>{lastResponse.command}</strong>
                </Typography>
                <Typography variant="body2">
                  Result: <strong>{lastResponse.result}</strong>
                </Typography>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Protocol Information */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Protocol Information
            </Typography>
            <Typography variant="body2" paragraph>
              SYS_COMMAND uses request type 0. The command code is sent in the address field,
              and an optional value can be included in the value field.
            </Typography>
            <Typography variant="body2" component="div">
              Packet structure: <code>[0x00] [CommandCode] [Value (4 bytes)]</code>
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
