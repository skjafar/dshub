import { Box, Card, CardContent, Typography, Chip, Divider } from '@mui/material';
import { useDSHub } from '../contexts/DSHubContext';
import { FONT_MONO } from '../theme';

export default function AboutPanel(): React.ReactElement {
  const { state } = useDSHub();

  const techStack = ['React 19', 'TypeScript', 'MUI 7', 'Vite 6', 'Socket.IO', 'Chart.js'];

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
              v1.0.0
            </Typography>
          </Box>

          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Web-based device monitoring and control interface for industrial embedded systems.
            Communicates via a custom Modbus-like protocol over TCP/UDP.
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
        </CardContent>
      </Card>
    </Box>
  );
}
