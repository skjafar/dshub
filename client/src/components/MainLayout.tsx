import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import {
  AppBar,
  Box,
  ButtonBase,
  Chip,
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
  useMediaQuery,
  Tooltip,
  CircularProgress
} from '@mui/material';
import {
  Menu as MenuIcon,
  AssessmentOutlined as StatusIcon,
  Search as SearchIcon,
  Timeline as PlotIcon,
  Dashboard as DashboardIcon,
  Memory as ParametersIcon,
  Storage as RegistersIcon,
  History as LogsIcon,
  Info as AboutIcon,
  SettingsApplications as SettingsIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Description as MapEditorIcon,
  Send as SysCommandIcon,
  LibraryBooks as ProfilesIcon,
  HelpOutline as HelpOutlineIcon,
} from '@mui/icons-material';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { NavigationContext } from '../contexts/NavigationContext';
import { useToast } from './ToastNotification';
import { InterfaceType, ControlInterfaceState } from '../types/shared';
import { FONT_MONO } from '../design/tokens';
import { logger } from '../utils/logger';
import DeviceScannerPanel from './DeviceScannerPanel';
import StatusBar, { STATUS_BAR_HEIGHT } from './StatusBar';
import GettingStartedDialog from './GettingStartedDialog';
import { ErrorBoundary } from './ErrorBoundary';

// Lazy-load heavy panels for code splitting
const DeviceDashboard = lazy(() => import('./DeviceDashboard'));
const DashboardPanel = lazy(() => import('./DashboardPanel'));
const PlotPanel = lazy(() => import('./PlotPanel'));
const SysCommandPanel = lazy(() => import('./SysCommandPanel'));
const RegistersPanel = lazy(() => import('./RegistersPanel'));
const ParametersPanel = lazy(() => import('./ParametersPanel'));
const LogsPanel = lazy(() => import('./LogsPanel'));
const SettingsPanel = lazy(() => import('./SettingsPanel'));
const MapEditorPanel = lazy(() => import('./maps/MapEditorPanel'));
const MapProfilesPanelLazy = lazy(() => import('./MapProfilesPanel'));
const AboutPanel = lazy(() => import('./AboutPanel'));
const GuidePanel = lazy(() => import('./GuidePanel'));

const drawerWidth = 240;
const drawerWidthCollapsed = 64;

type ViewType = 'scanner' | 'status' | 'dashboard' | 'plot' | 'syscommand' | 'registers' | 'parameters' | 'logs' | 'mapeditor' | 'profiles' | 'settings' | 'about';

const views: Array<{ key: ViewType; label: string; icon: React.ReactNode }> = [
  { key: 'scanner', label: 'Device Scanner', icon: <SearchIcon /> },
  { key: 'status', label: 'Status', icon: <StatusIcon /> },
  { key: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { key: 'plot', label: 'Plot', icon: <PlotIcon /> },
  { key: 'syscommand', label: 'SYS_COMMAND', icon: <SysCommandIcon /> },
  { key: 'registers', label: 'Registers', icon: <RegistersIcon /> },
  { key: 'parameters', label: 'Parameters', icon: <ParametersIcon /> },
  { key: 'logs', label: 'Activity Logs', icon: <LogsIcon /> },
  { key: 'mapeditor', label: 'Map Editor', icon: <MapEditorIcon /> },
  { key: 'profiles', label: 'Profiles', icon: <ProfilesIcon /> },

  { key: 'settings', label: 'Settings', icon: <SettingsIcon /> },
  { key: 'about', label: 'About', icon: <AboutIcon /> },
];

export default function MainLayout() {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'));
  const { state, actions } = useDSHub();
  const { settings } = useSettings();
  const { showWarning, showInfo, showError } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const effectiveDrawerCollapsed = drawerCollapsed || isNarrow;
  const [currentView, setCurrentView] = useState<ViewType>(() => {
    const saved = localStorage.getItem('dshub-last-view');
    if (saved && views.some(v => v.key === saved)) {
      return saved as ViewType;
    }
    return 'scanner';
  });
  const [autoConnectAttempts, setAutoConnectAttempts] = useState(0);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [gettingStartedOpen, setGettingStartedOpen] = useState(false);
  const [helpDrawerOpen, setHelpDrawerOpen] = useState(false);
  // Show Getting Started dialog on startup if enabled
  useEffect(() => {
    if (settings.showGettingStarted) {
      setGettingStartedOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Persist last viewed panel
  useEffect(() => {
    localStorage.setItem('dshub-last-view', currentView);
  }, [currentView]);

  // Clear the unread badge while the logs view is open, including entries that
  // arrive after it is opened.
  useEffect(() => {
    if (currentView !== 'logs') return;
    actions.markLogsRead();
  }, [currentView, actions, state.unreadLogCount]);

  // Report a connection attempt that ended without a link. The backend cannot
  // distinguish "refused because another session holds the device" from
  // "unreachable", so the message must not claim either.
  const wasConnectingRef = useRef(false);
  useEffect(() => {
    if (state.connecting) wasConnectingRef.current = true;
  }, [state.connecting]);
  useEffect(() => {
    if (!wasConnectingRef.current) return;
    if (!state.connection || state.connection.connected) return;
    // A reconnect loop is already running and reports its own progress.
    if (state.connection.reconnecting) return;

    wasConnectingRef.current = false;
    const name = state.connection.deviceName ?? state.connection.ip;
    showError(`Could not connect to ${name}. Check that it is powered on, reachable, and not already in use by another session.`);
  }, [state.connection, showError]);

  // Auto-connect on startup with retry logic
  // Auto-scan is handled by AutoScanManager in App.tsx
  useEffect(() => {
    // If auto-scan is enabled and scan is still running, wait unless the target device is already discovered
    const targetDeviceFound = state.discoveredDevices.some(d => d.ip_address === settings.lastDeviceIP);
    const shouldWaitForScan = settings.autoScan && !targetDeviceFound;

    if (
      settings.autoConnect &&
      settings.lastDeviceIP &&
      !state.connection?.connected &&
      autoConnectAttempts < settings.autoConnectRetries &&
      !isAutoConnecting &&
      !shouldWaitForScan
    ) {
      setIsAutoConnecting(true);
      const interfaceType = settings.lastInterfaceType === 'TCP' ? InterfaceType.TCP : InterfaceType.UDP;

      const attemptNumber = autoConnectAttempts + 1;
      const isFirstAttempt = attemptNumber === 1;

      // For first attempt, connect immediately; for retries, wait for retry delay
      const delay = isFirstAttempt ? 0 : settings.autoConnectRetryDelay;

      setTimeout(() => {
        logger.log(`Auto-connect attempt ${attemptNumber}/${settings.autoConnectRetries}`);

        // Look up device name from discovered devices if available, otherwise use saved name
        const discoveredDevice = state.discoveredDevices.find(d => d.ip_address === settings.lastDeviceIP);
        const deviceName = discoveredDevice?.board_name || settings.lastDeviceName;

        if (deviceName) {
          logger.log(`Using device name for connection: ${deviceName}`);
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
  }, [settings.autoConnect, settings.autoScan, settings.lastDeviceIP, settings.lastDeviceName, settings.lastInterfaceType, settings.autoConnectRetries, settings.autoConnectRetryDelay, state.connection?.connected, state.discoveredDevices, state.isScanning, autoConnectAttempts, isAutoConnecting, actions]);

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
      case 'scanner':     return <DeviceScannerPanel />;
      case 'status':      return <DeviceDashboard />;
      case 'dashboard':   return <DashboardPanel />;
      case 'plot':        return <PlotPanel />;
      case 'syscommand':  return <SysCommandPanel />;
      case 'registers':   return <RegistersPanel />;
      case 'parameters':  return <ParametersPanel />;
      case 'logs':        return <LogsPanel />;
      case 'mapeditor':   return <MapEditorPanel />;
      case 'profiles':    return <MapProfilesPanelLazy />;
      case 'settings':    return <SettingsPanel />;
      case 'about':
        return (
          <AboutPanel
            onOpenGettingStarted={() => setGettingStartedOpen(true)}
            onOpenGuide={() => setHelpDrawerOpen(true)}
          />
        );
      default:            return <DeviceScannerPanel />;
    }
  };

  // Group nav items with separators (settings/about go to bottom)
  const navGroups: ViewType[][] = [
    ['scanner', 'status'],
    ['dashboard', 'plot'],
    ['syscommand', 'registers', 'parameters'],
    ['profiles'],
    ['mapeditor'],
  ];
  const bottomNavItems: ViewType[] = ['settings', 'logs', 'about'];

  const renderNavItem = (viewKey: ViewType) => {
    const view = views.find(v => v.key === viewKey)!;
    const isLogs = view.key === 'logs';
    const logCount = isLogs ? state.unreadLogCount : 0;

    const listItemButton = (
      <ListItemButton
        selected={currentView === view.key}
        onClick={() => setCurrentView(view.key)}
        sx={{
          minHeight: 40,
          justifyContent: effectiveDrawerCollapsed ? 'center' : 'initial',
          px: 2,
          py: 0.5,
          borderLeft: '3px solid transparent',
          '&.Mui-selected': {
            borderLeftColor: 'primary.main',
          },
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: 0,
            mr: effectiveDrawerCollapsed ? 'auto' : 2,
            justifyContent: 'center',
            color: currentView === view.key ? 'primary.main' : 'text.secondary',
            '& .MuiSvgIcon-root': { fontSize: '1.2rem' },
          }}
        >
          {isLogs && logCount > 0 ? (
            <Badge badgeContent={logCount} color="secondary" max={99} sx={{ '& .MuiBadge-badge': { fontSize: '0.55rem', minWidth: 16, height: 16 } }}>
              {view.icon}
            </Badge>
          ) : (
            view.icon
          )}
        </ListItemIcon>
        {!effectiveDrawerCollapsed && (
          <ListItemText
            primary={view.label}
            // Size comes from the theme's ListItemText (0.8125rem); overriding it
            // to 1rem made the sidebar read a full step larger than everything else.
            primaryTypographyProps={{
              fontWeight: currentView === view.key ? 600 : 400,
              color: currentView === view.key ? 'text.primary' : 'text.secondary',
            }}
          />
        )}
      </ListItemButton>
    );

    return (
      <ListItem key={view.key} disablePadding sx={{ display: 'block' }}>
        {effectiveDrawerCollapsed ? (
          <Tooltip title={view.label} placement="right">
            {listItemButton}
          </Tooltip>
        ) : (
          listItemButton
        )}
      </ListItem>
    );
  };

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Height comes from the shared MuiToolbar override so the nav list lines up
          with the top of the content area. */}
      <Toolbar sx={{ display: 'flex', justifyContent: effectiveDrawerCollapsed ? 'center' : 'space-between' }}>
        {!effectiveDrawerCollapsed && (
          <Typography
            noWrap
            component="div"
            sx={{
              fontFamily: FONT_MONO,
              fontSize: '0.875rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: 'primary.main',
              textTransform: 'uppercase',
            }}
          >
            DSHub
          </Typography>
        )}
        <Tooltip title={effectiveDrawerCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
          <IconButton
            onClick={handleDrawerCollapse}
            size="small"
            aria-label={effectiveDrawerCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            sx={{ color: 'text.secondary' }}
          >
            {effectiveDrawerCollapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Toolbar>

      {/* Main nav — grows to fill available space */}
      <List sx={{ pt: 0, flexGrow: 1 }}>
        {navGroups.map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            {groupIndex > 0 && (
              <Box sx={{ mx: effectiveDrawerCollapsed ? 1 : 2, my: 0.5, borderTop: '1px solid', borderColor: 'divider' }} />
            )}
            {group.map(renderNavItem)}
          </React.Fragment>
        ))}
      </List>

      {/* Bottom nav — settings & about */}
      <Box>
        <Box sx={{ mx: effectiveDrawerCollapsed ? 1 : 2, my: 0.5, borderTop: '1px solid', borderColor: 'divider' }} />
        <List sx={{ pt: 0, pb: `${STATUS_BAR_HEIGHT}px` }}>
          {bottomNavItems.map(renderNavItem)}
        </List>
      </Box>
    </Box>
  );

  const connectionStatus = state.connection?.connected
    ? 'Connected'
    : state.connection?.reconnecting
      ? 'Reconnecting…'
      : 'Disconnected';
  const connectionColor = state.connection?.connected
    ? theme.palette.success.main
    : state.connection?.reconnecting
      ? theme.palette.warning.main
      : theme.palette.error.main;

  // Determine control state label and color
  const getControlStateInfo = () => {
    if (!state.connection) return null;

    const { controlState, interface: interfaceType } = state.connection;

    // Check if control matches current interface
    const hasControl =
      (interfaceType === 'TCP' && controlState === ControlInterfaceState.TCP_DATASTREAM) ||
      (interfaceType === 'UDP' && controlState === ControlInterfaceState.UDP_DATASTREAM);

    let label: string;
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

  const currentDrawerWidth = effectiveDrawerCollapsed ? drawerWidthCollapsed : drawerWidth;

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { sm: `calc(100% - ${currentDrawerWidth}px)` },
          ml: { sm: `${currentDrawerWidth}px` },
          transition: theme.transitions.create(['margin', 'width'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
          backgroundColor: theme.palette.background.paper,
          color: theme.palette.text.primary,
          borderBottom: `1px solid ${theme.palette.divider}`,
          backdropFilter: 'blur(8px)',
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

          <Typography component="h1" sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.primary' }}>
            {views.find(v => v.key === currentView)?.label ?? 'DSHub'}
          </Typography>

          {/* The AppBar carries app identity and device state only. Panel controls
              live in each panel's own header — see PanelHeader. Previously seven
              panels injected their own toolbars here, which overflowed and pushed
              this connection block off screen at 1280px. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 'auto', minWidth: 0 }}>
            {state.connection && (
              <>
                {state.connection.deviceName && (
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.primary' }}
                  >
                    {state.connection.deviceName}
                  </Typography>
                )}
                <Typography
                  variant="body2"
                  noWrap
                  sx={{ fontFamily: FONT_MONO, fontSize: '0.6875rem', color: 'text.secondary' }}
                >
                  {state.connection.ip}:{state.connection.port}
                </Typography>
                <Chip
                  label={state.connection.interface}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.5625rem', height: 18, '& .MuiChip-label': { px: 0.75 } }}
                />

                <Tooltip title={state.connection.connected ? 'Disconnect from this device' : 'Open the Device Scanner to connect'}>
                  <ButtonBase
                    onClick={handleConnectionClick}
                    aria-label={`Connection: ${connectionStatus}. ${state.connection.connected ? 'Activate to disconnect.' : 'Activate to open the scanner.'}`}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 0.75,
                      px: 1, py: 0.25, borderRadius: 1,
                      '&:hover': { backgroundColor: 'action.hover' },
                    }}
                  >
                    <Box
                      sx={{
                        width: 8, height: 8, borderRadius: '50%',
                        backgroundColor: connectionColor,
                        boxShadow: state.connection.connected ? `0 0 6px ${connectionColor}` : 'none',
                      }}
                    />
                    <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: connectionColor, whiteSpace: 'nowrap' }}>
                      {connectionStatus}
                    </Typography>
                  </ButtonBase>
                </Tooltip>

                {controlStateInfo && (
                  <Tooltip title="Device control interface — activate to take control">
                    <ButtonBase
                      onClick={handleControlClick}
                      aria-label={`Control state: ${controlStateInfo.label}. Activate to take control.`}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 0.75,
                        px: 1, py: 0.25, borderRadius: 1,
                        '&:hover': { backgroundColor: 'action.hover' },
                      }}
                    >
                      <Box
                        sx={{
                          width: 8, height: 8, borderRadius: '50%',
                          backgroundColor: controlStateInfo.color,
                          boxShadow: `0 0 6px ${controlStateInfo.color}`,
                        }}
                      />
                      <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: controlStateInfo.color, whiteSpace: 'nowrap' }}>
                        {controlStateInfo.label}
                      </Typography>
                    </ButtonBase>
                  </Tooltip>
                )}
              </>
            )}

            <Tooltip title="Workflow guide">
              <IconButton
                size="small"
                onClick={() => setHelpDrawerOpen(true)}
                sx={{ color: 'text.secondary' }}
                aria-label="Open workflow guide"
              >
                <HelpOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
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
              height: '100%',
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
              overflowX: 'hidden',
              backgroundColor: theme.palette.custom.surfaceLowest,
              borderRight: `1px solid ${theme.palette.divider}`,
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
          minWidth: 0,
          p: 3,
          pb: `${STATUS_BAR_HEIGHT + 24}px`,
        }}
      >
        <Toolbar />
        <NavigationContext.Provider value={{ navigate: (v) => setCurrentView(v as ViewType) }}>
          {/* Boundary is keyed on the view so a crash in one panel is contained
              there and clears when the user navigates away — previously a single
              panel error blanked the entire application. */}
          <ErrorBoundary key={currentView}>
            <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>}>
              {renderCurrentView()}
            </Suspense>
          </ErrorBoundary>
        </NavigationContext.Provider>
      </Box>

      <StatusBar />

      <GettingStartedDialog
        open={gettingStartedOpen}
        onClose={() => setGettingStartedOpen(false)}
        onViewGuide={() => {
          setGettingStartedOpen(false);
          setHelpDrawerOpen(true);
        }}
      />

      <Drawer
        anchor="right"
        open={helpDrawerOpen}
        onClose={() => setHelpDrawerOpen(false)}
        slotProps={{ paper: { sx: { width: 420, p: 2, overflowX: 'hidden' } } }}
      >
        <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}><CircularProgress /></Box>}>
          <GuidePanel />
        </Suspense>
      </Drawer>
    </Box>
  );
}