import React from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Typography,
} from '@mui/material';
import { useSettings } from '../contexts/SettingsContext';
import { FONT_MONO } from '../theme';

interface PanelEntry {
  label: string;
  description: string;
}

interface PanelGroup {
  heading: string;
  panels: PanelEntry[];
}

const panelGroups: PanelGroup[] = [
  {
    heading: 'Connect',
    panels: [
      { label: 'Device Scanner', description: 'Discovers devices on the network via UDP broadcast.' },
      { label: 'Status', description: 'Board overview — connection state, device info, and quick stats.' },
    ],
  },
  {
    heading: 'Monitor & Control',
    panels: [
      { label: 'Dashboard', description: 'Custom widget layouts to read/write values and watch live data.' },
      { label: 'Plot', description: 'Real-time charts for registers and parameters over time.' },
      { label: 'SYS_COMMAND', description: 'Send system-level commands directly to the device.' },
      { label: 'Registers', description: 'Inspect and edit raw register values at any address.' },
      { label: 'Parameters', description: 'Read and write named parameters with full type information.' },
    ],
  },
  {
    heading: 'Configure',
    panels: [
      { label: 'Map Editor', description: 'Create and edit register, parameter, and command maps with metadata.' },
      { label: 'Profiles', description: 'Save and switch between multiple device configurations.' },
    ],
  },
  {
    heading: 'System',
    panels: [
      { label: 'Activity Logs', description: 'Connection events, register reads/writes, and protocol traffic.' },
      { label: 'Settings', description: 'Appearance, connection defaults, and data management.' },
    ],
  },
];

interface GettingStartedDialogProps {
  open: boolean;
  onClose: () => void;
  onViewGuide: () => void;
}

export default function GettingStartedDialog({ open, onClose, onViewGuide }: GettingStartedDialogProps): React.ReactElement {
  const { updateSettings } = useSettings();

  const handleClose = () => {
    // Dismiss permanently — re-open any time from the About panel
    updateSettings({ showGettingStarted: false });
    onClose();
  };

  const handleViewGuide = () => {
    updateSettings({ showGettingStarted: false });
    onViewGuide();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.875rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'primary.main',
          }}
        >
          Getting Started
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          A quick overview of the panels and what each one does.
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        {panelGroups.map((group, gi) => (
          <Box key={group.heading}>
            {gi > 0 && <Divider sx={{ my: 1.5 }} />}
            <Typography
              variant="overline"
              sx={{ color: 'text.secondary', display: 'block', mb: 1, letterSpacing: '0.08em' }}
            >
              {group.heading}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {group.panels.map((panel) => (
                <Box key={panel.label} sx={{ display: 'flex', gap: 1.5, alignItems: 'baseline' }}>
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: FONT_MONO, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 120, color: 'text.primary' }}
                  >
                    {panel.label}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {panel.description}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ))}

        <Divider sx={{ mt: 2, mb: 1.5 }} />

        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          New to DSHub? Open the <strong>Guide</strong> for a step-by-step walkthrough — from creating a profile to connecting your board and building a dashboard. Access it any time via the <strong>?</strong> button in the top bar.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={handleViewGuide} variant="outlined">
          View Guide
        </Button>
        <Button size="small" onClick={handleClose} variant="contained">
          Get Started
        </Button>
      </DialogActions>
    </Dialog>
  );
}
