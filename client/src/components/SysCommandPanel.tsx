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
  Info as InfoIcon,
  Search as SearchIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ToastNotification';
import { filterWriteInput } from '../utils/writeInputParse';
import { DS_SYS_COMMANDS } from '../utils/sysCommandFileGenerator';

export default function SysCommandPanel() {
  const { state, actions } = useDSHub();
  const { getActiveProfile } = useSettings();
  const { showSuccess, showError } = useToast();

  // Get commands from active profile
  const activeProfile = getActiveProfile();
  const profileCommands = activeProfile?.sysCommands || [];

  // Initialize with first command or 0
  const [commandCode, setCommandCode] = useState<string>(String(profileCommands.length > 0 ? profileCommands[0].code : 0));
  const [commandValue, setCommandValue] = useState<string>('0');
  const [lastResponse, setLastResponse] = useState<{ command: number; result: number; success: boolean } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const lowerSearch = searchQuery.toLowerCase();
  const filteredProfileCommands = profileCommands.filter(
    cmd => cmd.name.toLowerCase().includes(lowerSearch) || String(cmd.code).includes(lowerSearch)
  );
  const filteredLibraryCommands = DS_SYS_COMMANDS.filter(
    cmd => cmd.name.toLowerCase().includes(lowerSearch) || String(cmd.code).includes(lowerSearch)
  );

  const canSend = state.connection?.connected && (
    (state.connection.interface === 'TCP' && state.connection.controlState === 1) ||
    (state.connection.interface === 'UDP' && state.connection.controlState === 2)
  );

  const handleSendCommand = () => {
    if (!canSend) {
      showError('Not connected or control not taken');
      return;
    }

    const code = parseInt(commandCode, 10);
    const value = parseInt(commandValue, 10);
    if (isNaN(code) || isNaN(value)) {
      showError('Invalid command code or value');
      return;
    }

    try {
      actions.sendCommand(0, value, code);
      showSuccess(`Sent SYS_COMMAND ${code} with value ${value}`);

      // Store the sent command for display
      setLastResponse({
        command: code,
        result: 0, // Will be updated when response arrives
        success: true
      });
    } catch (error) {
      showError(`Failed to send command: ${error}`);
      setLastResponse({
        command: code,
        result: -1,
        success: false
      });
    }
  };

  const handleQuickCommand = (code: number) => {
    setCommandCode(String(code));
    setCommandValue('0');
  };

  const getCommandInfo = (code: string) => {
    const n = parseInt(code, 10);
    if (isNaN(n)) return undefined;
    return profileCommands.find(cmd => cmd.code === n) ?? DS_SYS_COMMANDS.find(cmd => cmd.code === n);
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
                  type="text"
                  fullWidth
                  value={commandCode}
                  onChange={(e) => setCommandCode(filterWriteInput(e.target.value, 'decimal'))}
                  slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                  helperText={currentCommandInfo ? currentCommandInfo.name : 'Custom command code'}
                />

                <TextField
                  label="Value (Optional)"
                  type="text"
                  fullWidth
                  value={commandValue}
                  onChange={(e) => setCommandValue(filterWriteInput(e.target.value, 'decimal'))}
                  slotProps={{ htmlInput: { inputMode: 'numeric' } }}
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
              <TextField
                size="small"
                fullWidth
                placeholder="Search by name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                sx={{ mb: 1.5 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                    endAdornment: searchQuery ? (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setSearchQuery('')}>
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  },
                }}
              />
              <Divider sx={{ mb: 2 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: '400px', overflowY: 'auto' }}>
                {profileCommands.length === 0 ? (
                  <Alert severity="info">
                    No SYS_COMMANDs defined in this profile. Go to Map Editor to add commands.
                  </Alert>
                ) : filteredProfileCommands.length === 0 ? null : (
                  filteredProfileCommands.map((cmd) => (
                    <Paper
                      key={cmd.code}
                      sx={{
                        p: 1.5,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' },
                        border: parseInt(commandCode, 10) === cmd.code ? '2px solid' : '1px solid',
                        borderColor: parseInt(commandCode, 10) === cmd.code ? 'primary.main' : 'divider'
                      }}
                      onClick={() => handleQuickCommand(cmd.code)}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">{cmd.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{cmd.description}</Typography>
                        </Box>
                        <Chip label={cmd.code} size="small" variant="outlined" />
                      </Box>
                    </Paper>
                  ))
                )}

                <Divider sx={{ my: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">Library</Typography>
                </Divider>

                {filteredLibraryCommands.map((cmd) => (
                  <Paper
                    key={cmd.code}
                    sx={{
                      p: 1.5,
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                      border: parseInt(commandCode, 10) === cmd.code ? '2px solid' : '1px solid',
                      borderColor: parseInt(commandCode, 10) === cmd.code ? 'primary.main' : 'divider',
                      opacity: 0.85,
                    }}
                    onClick={() => handleQuickCommand(cmd.code)}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="body2" fontWeight="medium" sx={{ fontFamily: 'monospace' }}>{cmd.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{cmd.description}</Typography>
                      </Box>
                      <Chip label={cmd.code} size="small" variant="outlined" color="secondary" />
                    </Box>
                  </Paper>
                ))}
              </Box>
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
