import { createTheme } from '@mui/material/styles';

// Transition duration for theme switching (can be customized via settings)
const THEME_TRANSITION = '0.3s ease-in-out';

// Professional, modern theme for DeviceMon
export const deviceMonTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
      contrastText: '#fff',
    },
    secondary: {
      main: '#9c27b0',
      light: '#ba68c8',
      dark: '#7b1fa2',
      contrastText: '#fff',
    },
    error: {
      main: '#d32f2f',
      light: '#ef5350',
      dark: '#c62828',
    },
    warning: {
      main: '#ed6c02',
      light: '#ff9800',
      dark: '#e65100',
    },
    info: {
      main: '#0288d1',
      light: '#03a9f4',
      dark: '#01579b',
    },
    success: {
      main: '#2e7d32',
      light: '#4caf50',
      dark: '#1b5e20',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
    text: {
      primary: 'rgba(0, 0, 0, 0.87)',
      secondary: 'rgba(0, 0, 0, 0.6)',
      disabled: 'rgba(0, 0, 0, 0.38)',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontSize: '2.5rem',
      fontWeight: 500,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 500,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.6,
    },
    button: {
      textTransform: 'none', // More modern look without all caps
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 8, // More modern rounded corners
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          transition: `background-color ${THEME_TRANSITION}, color ${THEME_TRANSITION}`,
        },
        '*': {
          transition: `background-color ${THEME_TRANSITION}, color ${THEME_TRANSITION}, border-color ${THEME_TRANSITION}`,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 16px',
          boxShadow: 'none',
          transition: `all ${THEME_TRANSITION}`,
          '&:hover': {
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          },
        },
        contained: {
          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
          '&:hover': {
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          transition: 'box-shadow 0.3s ease',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
        elevation1: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        },
        elevation2: {
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          backgroundColor: '#f5f5f5',
        },
      },
    },
  },
});

// Dark theme variant with enhanced contrast
export const deviceMonDarkTheme = createTheme({
  ...deviceMonTheme,
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',      // Brighter blue for better contrast
      light: '#bbdefb',
      dark: '#42a5f5',
      contrastText: '#000',  // Dark text on bright primary
    },
    secondary: {
      main: '#ce93d8',      // Purple with good contrast
      light: '#f3e5f5',
      dark: '#ab47bc',
      contrastText: '#000',
    },
    error: {
      main: '#f44336',      // Brighter red for visibility
      light: '#e57373',
      dark: '#d32f2f',
      contrastText: '#fff',
    },
    warning: {
      main: '#ffa726',      // Brighter orange
      light: '#ffb74d',
      dark: '#f57c00',
      contrastText: '#000',
    },
    info: {
      main: '#29b6f6',      // Brighter cyan
      light: '#4fc3f7',
      dark: '#0288d1',
      contrastText: '#000',
    },
    success: {
      main: '#66bb6a',      // Brighter green
      light: '#81c784',
      dark: '#388e3c',
      contrastText: '#000',
    },
    background: {
      default: '#0a0a0a',   // Darker default for better contrast
      paper: '#1a1a1a',     // Slightly lighter cards
    },
    text: {
      primary: '#ffffff',           // Pure white for maximum contrast
      secondary: 'rgba(255, 255, 255, 0.85)',  // Increased from 0.7
      disabled: 'rgba(255, 255, 255, 0.50)',
    },
    divider: 'rgba(255, 255, 255, 0.15)',  // More visible dividers
    action: {
      active: '#fff',
      hover: 'rgba(255, 255, 255, 0.08)',
      selected: 'rgba(255, 255, 255, 0.16)',
      disabled: 'rgba(255, 255, 255, 0.3)',
      disabledBackground: 'rgba(255, 255, 255, 0.12)',
    },
  },
  components: {
    ...deviceMonTheme.components,
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          backgroundColor: '#2a2a2a',  // Distinct header background
          color: '#ffffff',
        },
        root: {
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',  // Visible borders
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',  // Stronger shadows
          border: '1px solid rgba(255, 255, 255, 0.1)',  // Subtle border for definition
          transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            borderColor: 'rgba(255, 255, 255, 0.2)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundImage: 'none',  // Remove default dark mode gradient
        },
        elevation1: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        },
        elevation2: {
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
          border: '1px solid transparent',
        },
        outlined: {
          borderColor: 'rgba(255, 255, 255, 0.3)',  // More visible chip borders
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 16px',
          boxShadow: 'none',
          transition: `all ${THEME_TRANSITION}`,
          '&:hover': {
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          },
        },
        contained: {
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          '&:hover': {
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          },
        },
        outlined: {
          borderWidth: '1.5px',  // Thicker borders for visibility
          '&:hover': {
            borderWidth: '1.5px',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.23)',  // More visible default border
            },
            '&:hover fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.4)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#90caf9',
              borderWidth: '2px',
            },
          },
          '& .MuiInputLabel-root': {
            color: 'rgba(255, 255, 255, 0.7)',
          },
          '& .MuiInputBase-input': {
            color: '#ffffff',
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          border: '1px solid',
        },
        standardSuccess: {
          backgroundColor: 'rgba(102, 187, 106, 0.15)',
          borderColor: 'rgba(102, 187, 106, 0.5)',
          color: '#81c784',
        },
        standardError: {
          backgroundColor: 'rgba(244, 67, 54, 0.15)',
          borderColor: 'rgba(244, 67, 54, 0.5)',
          color: '#e57373',
        },
        standardWarning: {
          backgroundColor: 'rgba(255, 167, 38, 0.15)',
          borderColor: 'rgba(255, 167, 38, 0.5)',
          color: '#ffb74d',
        },
        standardInfo: {
          backgroundColor: 'rgba(41, 182, 246, 0.15)',
          borderColor: 'rgba(41, 182, 246, 0.5)',
          color: '#4fc3f7',
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: 'rgba(144, 202, 249, 0.16)',
            '&:hover': {
              backgroundColor: 'rgba(144, 202, 249, 0.24)',
            },
          },
        },
      },
    },
  },
});
