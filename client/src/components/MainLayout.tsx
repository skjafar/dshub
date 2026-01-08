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
  useTheme,
  Tooltip
} from '@mui/material';
import {
  Menu as MenuIcon,
  AssessmentOutlined as StatusIcon,
  Search as SearchIcon,
  Timeline as PlotIcon,
  Memory as ParametersIcon,
  Storage as RegistersIcon,
  History as LogsIcon,
  Info as AboutIcon,
  SettingsApplications as SettingsIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon
} from '@mui/icons-material';
import { useDeviceMon } from '../contexts/DeviceMonContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ToastNotification';
import { InterfaceType, ControlInterfaceState } from '../types/shared';
import DeviceScannerPanel from './DeviceScannerPanel';
import DeviceDashboard from './DeviceDashboard';
import PlotPanel from './PlotPanel';
import RegistersPanel from './RegistersPanel';
import ParametersPanel from './ParametersPanel';
import LogsPanel from './LogsPanel';
import SettingsPanel from './SettingsPanel';

const drawerWidth = 240;
const drawerWidthCollapsed = 64;

type ViewType = 'scanner' | 'status' | 'plot' | 'registers' | 'parameters' | 'logs' | 'settings' | 'about';

const views: Array<{ key: ViewType; label: string; icon: React.ReactNode }> = [
  { key: 'scanner', label: 'Device Scanner', icon: <SearchIcon /> },
  { key: 'status', label: 'Status', icon: <StatusIcon /> },
  { key: 'plot', label: 'Plot', icon: <PlotIcon /> },
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
  const { showWarning, showInfo } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>('scanner');
  const [autoConnectAttempts, setAutoConnectAttempts] = useState(0);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [hasAutoScanned, setHasAutoScanned] = useState(false);

  // Auto-scan on startup if enabled
  useEffect(() => {
    if (settings.autoScan && !hasAutoScanned && !state.isScanning) {
      console.log('Auto-scan enabled, starting device scan...');
      actions.startScan();
      setHasAutoScanned(true);
    }
  }, [settings.autoScan, hasAutoScanned, state.isScanning, actions]);

  // Auto-connect on startup with retry logic
  useEffect(() => {
    // If auto-scan is enabled, wait for scan to complete before auto-connecting
    const shouldWaitForScan = settings.autoScan && !hasAutoScanned;

    if (
      settings.autoConnect &&
      settings.lastDeviceIP &&
      !state.connection?.connected &&
      autoConnectAttempts < settings.autoConnectRetries &&
      !isAutoConnecting &&
      !shouldWaitForScan &&
      !state.isScanning  // Don't connect while scanning
    ) {
      setIsAutoConnecting(true);
      const interfaceType = settings.lastInterfaceType === 'TCP' ? InterfaceType.TCP : InterfaceType.UDP;

      const attemptNumber = autoConnectAttempts + 1;
      const isFirstAttempt = attemptNumber === 1;

      // For first attempt, connect immediately; for retries, wait for retry delay
      const delay = isFirstAttempt ? 0 : settings.autoConnectRetryDelay;

      setTimeout(() => {
        console.log(`Auto-connect attempt ${attemptNumber}/${settings.autoConnectRetries}`);

        // Look up device name from discovered devices if available, otherwise use saved name
        const discoveredDevice = state.discoveredDevices.find(d => d.ip_address === settings.lastDeviceIP);
        const deviceName = discoveredDevice?.board_name || settings.lastDeviceName;

        if (deviceName) {
          console.log(`Using device name for connection: ${deviceName}`);
        }

        actions.connectDevice(settings.lastDeviceIP, interfaceType, deviceName);
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
  }, [settings.autoConnect, settings.autoScan, settings.lastDeviceIP, settings.lastDeviceName, settings.lastInterfaceType, settings.autoConnectRetries, settings.autoConnectRetryDelay, state.connection?.connected, state.discoveredDevices, state.isScanning, autoConnectAttempts, isAutoConnecting, hasAutoScanned, actions]);

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

  const handleDrawerCollapse = () => {
    setDrawerCollapsed(!drawerCollapsed);
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'scanner':
        return <DeviceScannerPanel />;
      case 'status':
        return <DeviceDashboard />;
      case 'plot':
        return <PlotPanel />;
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
      <Toolbar sx={{ display: 'flex', justifyContent: drawerCollapsed ? 'center' : 'space-between' }}>
        {!drawerCollapsed && (
          <Typography variant="h6" noWrap component="div">
            DeviceMon
          </Typography>
        )}
        <Tooltip title={drawerCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
          <IconButton onClick={handleDrawerCollapse} size="small">
            {drawerCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Tooltip>
      </Toolbar>
      <List>
        {views.map((view) => {
          const isLogs = view.key === 'logs';
          const logCount = isLogs ? state.logs.length : 0;

          const listItemButton = (
            <ListItemButton
              selected={currentView === view.key}
              onClick={() => setCurrentView(view.key)}
              sx={{
                minHeight: 48,
                justifyContent: drawerCollapsed ? 'center' : 'initial',
                px: 2.5,
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  mr: drawerCollapsed ? 'auto' : 3,
                  justifyContent: 'center',
                }}
              >
                {isLogs && logCount > 0 ? (
                  <Badge badgeContent={logCount} color="secondary" max={99}>
                    {view.icon}
                  </Badge>
                ) : (
                  view.icon
                )}
              </ListItemIcon>
              {!drawerCollapsed && <ListItemText primary={view.label} />}
            </ListItemButton>
          );

          return (
            <ListItem key={view.key} disablePadding sx={{ display: 'block' }}>
              {drawerCollapsed ? (
                <Tooltip title={view.label} placement="right">
                  {listItemButton}
                </Tooltip>
              ) : (
                listItemButton
              )}
            </ListItem>
          );
        })}
      </List>
    </div>
  );

  const connectionStatus = state.connection?.connected ? 'Connected' : 'Disconnected';
  const connectionColor = state.connection?.connected ? theme.palette.success.main : theme.palette.error.main;

  // Determine control state label and color
  const getControlStateInfo = () => {
    if (!state.connection) return null;

    const { controlState, interface: interfaceType } = state.connection;

    // Check if control matches current interface
    const hasControl =
      (interfaceType === 'TCP' && controlState === ControlInterfaceState.TCP_DATASTREAM) ||
      (interfaceType === 'UDP' && controlState === ControlInterfaceState.UDP_DATASTREAM);

    let label = '';
    switch (controlState) {
      case ControlInterfaceState.UNDECIDED:
        label = 'No Control';
        break;
      case ControlInterfaceState.TCP_DATASTREAM:
        label = 'TCP Control';
        break;
      case ControlInterfaceState.UDP_DATASTREAM:
        label = 'UDP Control';
        break;
      case ControlInterfaceState.TCP_CLI:
        label = 'TCP CLI';
        break;
      case ControlInterfaceState.USB:
        label = 'USB Control';
        break;
      default:
        label = 'Unknown';
    }

    return {
      label,
      color: hasControl ? theme.palette.success.main : theme.palette.warning.main
    };
  };

  const controlStateInfo = getControlStateInfo();

  // Handle connection status click - disconnect or navigate to scanner
  const handleConnectionClick = () => {
    if (state.connection?.connected) {
      const deviceName = state.connection.deviceName || state.connection.ip;
      showInfo(`Disconnecting from ${deviceName}...`);
      actions.disconnectDevice();
    } else if (state.connection) {
      // Disconnected state - navigate to Device Scanner
      showInfo('Navigating to Device Scanner to connect...');
      setCurrentView('scanner');
    }
  };

  // Handle control state click - take control
  const handleControlClick = () => {
    if (!state.connection) {
      showWarning('No device connected. Please connect to a device first.');
      return;
    }

    if (!state.connection.connected) {
      showWarning('Device is not connected. Please connect to a device first.');
      return;
    }

    const { controlState, interface: interfaceType } = state.connection;

    // Check if already has control
    const hasControl =
      (interfaceType === 'TCP' && controlState === ControlInterfaceState.TCP_DATASTREAM) ||
      (interfaceType === 'UDP' && controlState === ControlInterfaceState.UDP_DATASTREAM);

    if (hasControl) {
      showInfo(`Already have control via ${interfaceType}`);
    } else {
      showInfo(`Taking control via ${interfaceType}...`);
      actions.takeControl();
    }
  };

  const currentDrawerWidth = drawerCollapsed ? drawerWidthCollapsed : drawerWidth;

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${currentDrawerWidth}px)` },
          ml: { sm: `${currentDrawerWidth}px` },
          transition: theme.transitions.create(['margin', 'width'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
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
                {state.connection.deviceName && (
                  <Typography variant="body2" color="inherit" sx={{ fontWeight: 500 }}>
                    {state.connection.deviceName}
                  </Typography>
                )}
                <Typography variant="body2" color="inherit">
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
                <Typography
                  variant="body2"
                  color="inherit"
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { textDecoration: 'underline' }
                  }}
                  onClick={handleConnectionClick}
                  title={state.connection?.connected ? 'Click to disconnect' : 'Use Device Scanner to connect'}
                >
                  {connectionStatus}
                </Typography>
                {controlStateInfo && (
                  <>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: controlStateInfo.color,
                      }}
                    />
                    <Typography
                      variant="body2"
                      color="inherit"
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { textDecoration: 'underline' }
                      }}
                      onClick={handleControlClick}
                      title="Click to take control"
                    >
                      {controlStateInfo.label}
                    </Typography>
                  </>
                )}
              </>
            )}
          </Box>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: currentDrawerWidth }, flexShrink: { sm: 0 } }}
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
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: currentDrawerWidth,
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
              overflowX: 'hidden',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${currentDrawerWidth}px)` },
          transition: theme.transitions.create(['margin', 'width'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar />
        {renderCurrentView()}
      </Box>
    </Box>
  );
}