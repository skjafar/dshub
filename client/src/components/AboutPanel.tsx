import { Box, Button, Card, CardContent, Typography, Chip, Divider } from '@mui/material';
import { HelpOutline as HelpOutlineIcon } from '@mui/icons-material';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { FONT_MONO } from '../theme';

interface AboutPanelProps {
  onOpenGettingStarted?: () => void;
  onOpenGuide?: () => void;
}

export default function AboutPanel({ onOpenGettingStarted, onOpenGuide }: AboutPanelProps): React.ReactElement {
  const { state } = useDSHub();
  const { updateSettings } = useSettings();

  const handleOpenGettingStarted = () => {
    updateSettings({ showGettingStarted: true });
    onOpenGettingStarted?.();
  };

  const techStack = ['React 19', 'TypeScript 5', 'MUI 7', 'Vite 6', 'Tauri 2', 'Socket.IO 4', 'Chart.js 4'];

  return (
    <Box sx={{ maxWidth: 600 }}>
      <Card>
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ mb: 2 }}>
            <Typography
              sx={{
                fontFamily: FONT_MONO,
                fontSize: '1.25rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: 'primary.main',
                textTransform: 'uppercase',
              }}
            >
              DSHub
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: FONT_MONO, color: 'text.secondary' }}>
              v0.2.3
            </Typography>
          </Box>

          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Web-based device monitoring and control interface for industrial embedded systems.
            Communicates via a the DataStream protocol over TCP/UDP.
          </Typography>

          <Divider sx={{ my: 1.5 }} />

          <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', mb: 1, letterSpacing: '0.08em' }}>
            Technology
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
            {techStack.map(tech => (
              <Chip
                key={tech}
                label={tech}
                size="small"
                variant="outlined"
                sx={{ fontFamily: FONT_MONO, fontSize: '0.625rem' }}
              />
            ))}
          </Box>

          <Divider sx={{ my: 1.5 }} />

          <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', mb: 1, letterSpacing: '0.08em' }}>
            Session
          </Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Server</Typography>
              <Typography variant="body2" sx={{ fontFamily: FONT_MONO, fontWeight: 600 }}>
                {state.serverConnected ? 'Connected' : 'Disconnected'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Device</Typography>
              <Typography variant="body2" sx={{ fontFamily: FONT_MONO, fontWeight: 600 }}>
                {state.connection?.connected
                  ? `${state.connection.deviceName ?? state.connection.ip}:${state.connection.port}`
                  : 'None'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Registers</Typography>
              <Typography variant="body2" sx={{ fontFamily: FONT_MONO, fontWeight: 600 }}>
                {state.registers.size}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Parameters</Typography>
              <Typography variant="body2" sx={{ fontFamily: FONT_MONO, fontWeight: 600 }}>
                {state.parameters.size}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 1.5 }} />

          <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', mb: 1, letterSpacing: '0.08em' }}>
            Help
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<HelpOutlineIcon fontSize="small" />}
              onClick={onOpenGuide}
            >
              Workflow Guide
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={handleOpenGettingStarted}
            >
              Getting Started
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
