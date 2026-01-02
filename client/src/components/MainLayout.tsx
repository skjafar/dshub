import React, { useState, useEffect } from 'react';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Badge,
  useTheme
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Search as SearchIcon,
  Timeline as MultiPlotIcon,
  Memory as ParametersIcon,
  Storage as RegistersIcon,
  History as LogsIcon,
  Info as AboutIcon,
  SettingsApplications as SettingsIcon
} from '@mui/icons-material';
import { useDeviceMon } from '../contexts/DeviceMonContext';
import { useSettings } from '../contexts/SettingsContext';
import { InterfaceType } from '../types/shared';
import DeviceScannerPanel from './DeviceScannerPanel';
import DeviceDashboard from './DeviceDashboard';
import MultiPlotPanel from './MultiPlotPanel';
import RegistersPanel from './RegistersPanel';
import ParametersPanel from './ParametersPanel';
import LogsPanel from './LogsPanel';
import SettingsPanel from './SettingsPanel';

const drawerWidth = 240;

type ViewType = 'scanner' | 'dashboard' | 'multiplot' | 'registers' | 'parameters' | 'logs' | 'settings' | 'about';

const views: Array<{ key: ViewType; label: string; icon: React.ReactNode }> = [
  { key: 'scanner', label: 'Device Scanner', icon: <SearchIcon /> },
  { key: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { key: 'multiplot', label: 'Multi-Plot', icon: <MultiPlotIcon /> },
  { key: 'registers', label: 'Registers', icon: <RegistersIcon /> },
  { key: 'parameters', label: 'Parameters', icon: <ParametersIcon /> },
  { key: 'logs', label: 'Activity Logs', icon: <LogsIcon /> },
  { key: 'settings', label: 'Settings', icon: <SettingsIcon /> },
  { key: 'about', label: 'About', icon: <AboutIcon /> },
];

export default function MainLayout() {
  const theme = useTheme();
  const { state, actions } = useDeviceMon();
  const { settings } = useSettings();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>('scanner');
  const [autoConnectAttempts, setAutoConnectAttempts] = useState(0);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);

  // Auto-connect on startup with retry logic
  useEffect(() => {
    if (
      settings.autoConnect &&
      settings.lastDeviceIP &&
      !state.connection?.connected &&
      autoConnectAttempts < settings.autoConnectRetries &&
      !isAutoConnecting
    ) {
      setIsAutoConnecting(true);
      const interfaceType = settings.lastInterfaceType === 'TCP' ? InterfaceType.TCP : InterfaceType.UDP;

      const attemptNumber = autoConnectAttempts + 1;
      const isFirstAttempt = attemptNumber === 1;

      // For first attempt, connect immediately; for retries, wait for retry delay
      const delay = isFirstAttempt ? 0 : settings.autoConnectRetryDelay;

      setTimeout(() => {
        console.log(`Auto-connect attempt ${attemptNumber}/${settings.autoConnectRetries}`);
        actions.connectDevice(settings.lastDeviceIP, interfaceType);
        setAutoConnectAttempts(prev => prev + 1);

        // Schedule next retry check if this is not the last attempt
        if (attemptNumber < settings.autoConnectRetries) {
          setTimeout(() => {
            setIsAutoConnecting(false);
          }, settings.autoConnectRetryDelay);
        } else {
          setIsAutoConnecting(false);
        }
      }, delay);
    }
  }, [settings.autoConnect, settings.lastDeviceIP, settings.lastInterfaceType, settings.autoConnectRetries, settings.autoConnectRetryDelay, state.connection?.connected, autoConnectAttempts, isAutoConnecting, actions]);

  // Reset retry counter when successfully connected
  useEffect(() => {
    if (state.connection?.connected) {
      setAutoConnectAttempts(settings.autoConnectRetries); // Stop retrying
      setIsAutoConnecting(false);
    }
  }, [state.connection?.connected, settings.autoConnectRetries]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'scanner':
        return <DeviceScannerPanel />;
      case 'dashboard':
        return <DeviceDashboard />;
      case 'multiplot':
        return <MultiPlotPanel />;
      case 'registers':
        return <RegistersPanel />;
      case 'parameters':
        return <ParametersPanel />;
      case 'logs':
        return <LogsPanel />;
      case 'settings':
        return <SettingsPanel />;
      case 'about':
        return (
          <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>
              DeviceMon Web
            </Typography>
            <Typography variant="body1" paragraph>
              Version 1.0.0 - Web-based device monitoring and control interface
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Built with React, TypeScript, and Material-UI
            </Typography>
          </Box>
        );
      default:
        return <DeviceScannerPanel />;
    }
  };

  const drawer = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          DeviceMon
        </Typography>
      </Toolbar>
      <List>
        {views.map((view) => {
          const isLogs = view.key === 'logs';
          const logCount = isLogs ? state.logs.length : 0;
          
          return (
            <ListItem key={view.key} disablePadding>
              <ListItemButton
                selected={currentView === view.key}
                onClick={() => setCurrentView(view.key)}
              >
                <ListItemIcon>
                  {isLogs && logCount > 0 ? (
                    <Badge badgeContent={logCount} color="secondary" max={999}>
                      {view.icon}
                    </Badge>
                  ) : (
                    view.icon
                  )}
                </ListItemIcon>
                <ListItemText primary={view.label} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </div>
  );

  const connectionStatus = state.connection?.connected ? 'Connected' : 'Disconnected';
  const connectionColor = state.connection?.connected ? theme.palette.success.main : theme.palette.error.main;

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {views.find(v => v.key === currentView)?.label || 'DeviceMon'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {state.connection && (
              <>
                <Typography variant="body2" color="inherit">
                  {state.connection.deviceName ? `${state.connection.deviceName} - ` : ''}
                  {state.connection.ip}:{state.connection.port} ({state.connection.interface})
                </Typography>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: connectionColor,
                  }}
                />
                <Typography variant="body2" color="inherit">
                  {connectionStatus}
                </Typography>
              </>
            )}
          </Box>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
        aria-label="navigation"
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{ flexGrow: 1, p: 3, width: { sm: `calc(100% - ${drawerWidth}px)` } }}
      >
        <Toolbar />
        {renderCurrentView()}
      </Box>
    </Box>
  );
}