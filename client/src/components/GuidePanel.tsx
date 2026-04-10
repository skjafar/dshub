import React from 'react';
import { Box, Card, CardContent, Chip, Divider, Typography } from '@mui/material';
import { FONT_MONO } from '../theme';

interface GuideStep {
  number: number;
  title: string;
  description: string;
  details: string;
  hints: string[];
}

const steps: GuideStep[] = [
  {
    number: 1,
    title: 'Create a Profile',
    description:
      'Open the Map Editor to define your device\'s registers, parameters, and system commands. ' +
      'Add metadata — descriptions, units, and value options — to make the interface informative and self-documenting.',
    details:
      'A profile is the schema for your device. It tells DSHub what addresses exist, their types, and how to display them. ' +
      'You can create multiple profiles for different boards or firmware configurations.',
    hints: ['Map Editor', 'Profiles'],
  },
  {
    number: 2,
    title: 'Export Files',
    description:
      'From the Map Editor or Profiles panel, export .map files and C header files. ' +
      'These files are consumed by your board firmware to set up the DSHub communication layer.',
    details:
      'The .map files describe the register and parameter layout. The C headers give your firmware the address constants it needs. ' +
      'Keep these in sync with your firmware — a mismatch will cause misread or corrupted values.',
    hints: ['Map Editor → Export', 'Profiles → Download'],
  },
  {
    number: 3,
    title: 'Flash & Run the Board',
    description:
      'Integrate the exported files into your firmware, build, and flash your board. ' +
      'Once running, the device will listen and respond to the DSHub protocol over TCP or UDP.',
    details:
      'DSHub uses the DataStream binary protocol. Your firmware must implement the server side — reading/writing registers ' +
      'at the addresses defined in your profile. The exported headers provide the address constants.',
    hints: ['Firmware', 'TCP / UDP server'],
  },
  {
    number: 4,
    title: 'Scan for Device',
    description:
      'Open the Scanner panel. DSHub broadcasts a UDP discovery request on the local network. ' +
      'Any running board will respond with its name, IP address, and port.',
    details:
      'Make sure DSHub and the board are on the same subnet. The scanner will list all responding devices. ' +
      'You can also connect manually by entering the IP and port directly.',
    hints: ['Device Scanner'],
  },
  {
    number: 5,
    title: 'Connect',
    description:
      'Select a discovered device from the Scanner or enter its address in the Status panel. ' +
      'Connect via TCP for reliable, bidirectional communication or UDP for lower-latency monitoring.',
    details:
      'TCP is recommended for control work — it ensures delivery and supports the control handshake. ' +
      'UDP is useful for high-frequency read-only polling where some packet loss is acceptable.',
    hints: ['Device Scanner', 'Status'],
  },
  {
    number: 6,
    title: 'Build a Dashboard',
    description:
      'Open the Dashboard panel and add widgets — value readers, buttons, gauges, mini-plots, dropdowns, and more. ' +
      'Bind each widget to a register or parameter to create a tailored control interface.',
    details:
      'Dashboards are saved per profile. You can create multiple tabs and organize widgets freely. ' +
      'Enable Edit Mode from the AppBar to drag, resize, and configure widgets.',
    hints: ['Dashboard'],
  },
  {
    number: 7,
    title: 'Take Control',
    description:
      'To write values — sending commands, editing registers, or updating parameters — you must take TCP control. ' +
      'Request control from the connection status area in the AppBar.',
    details:
      'Control is exclusive: only one client can hold it at a time. Taking control prevents other sessions from ' +
      'accidentally writing to the device. Release it when done to allow others to connect.',
    hints: ['AppBar → Take Control', 'SYS_COMMAND', 'Registers', 'Parameters'],
  },
];

export default function GuidePanel(): React.ReactElement {
  return (
    <Box sx={{ maxWidth: 680 }}>
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
              Workflow Guide
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              From zero to a connected, controllable device
            </Typography>
          </Box>

          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Follow these steps to go from an empty profile to a running board with a live dashboard.
            Each step links to the panel or action that handles it.
          </Typography>

          <Divider sx={{ mb: 2 }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {steps.map((step, index) => (
              <React.Fragment key={step.number}>
                {index > 0 && <Divider sx={{ my: 2 }} />}
                <Box sx={{ display: 'flex', gap: 2 }}>
                  {/* Step number */}
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      mt: 0.25,
                    }}
                  >
                    <Typography
                      sx={{ fontFamily: FONT_MONO, fontSize: '0.75rem', fontWeight: 700, lineHeight: 1 }}
                    >
                      {step.number}
                    </Typography>
                  </Box>

                  {/* Step content */}
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="body1"
                      sx={{ fontWeight: 600, mb: 0.5 }}
                    >
                      {step.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                      {step.description}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.disabled', mb: 1.25, fontSize: '0.8rem' }}>
                      {step.details}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                      {step.hints.map((hint) => (
                        <Chip
                          key={hint}
                          label={hint}
                          size="small"
                          variant="outlined"
                          sx={{ fontFamily: FONT_MONO, fontSize: '0.625rem' }}
                        />
                      ))}
                    </Box>
                  </Box>
                </Box>
              </React.Fragment>
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
