import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import {
  AppBar,
  Box,
  Chip,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Toolbar,
  Typography,
  Badge,
  useTheme,
  useMediaQuery,
  Tooltip,
  Button,
  Slider,
  Switch,
  TextField,
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
  Edit as EditIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Description as MapEditorIcon,
  Send as SysCommandIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Save as SaveIcon,
  SaveAs as SaveAsIcon,
  RestartAlt as RestartAltIcon,
  LibraryBooks as ProfilesIcon,
  Upload as ImportIcon,
  Timer as TimerIcon,
  Send as SendIcon,
  Upload as UploadIcon,
  HelpOutline as HelpOutlineIcon,
} from '@mui/icons-material';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { NavigationContext } from '../contexts/NavigationContext';
import { useToast } from './ToastNotification';
import { InterfaceType, ControlInterfaceState } from '../types/shared';
import { DEFAULT_GRID_CONFIG } from '../types/dashboard';
import { FONT_MONO } from '../theme';
import { mapManager } from '../maps/mapManager';
import { logger } from '../utils/logger';
import DeviceScannerPanel from './DeviceScannerPanel';
import StatusBar, { STATUS_BAR_HEIGHT } from './StatusBar';
import type { DashboardPanelRef } from './DashboardPanel';
import type { RegistersPanelRef } from './RegistersPanel';
import type { ParametersPanelRef } from './ParametersPanel';
import type { MapEditorPanelRef, MapEditorBarState } from './maps/MapEditorPanel';
import type { MapProfilesPanelRef } from './MapProfilesPanel';
import GettingStartedDialog from './GettingStartedDialog';

const EMPTY_PROFILE_ID = '__empty__';

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
  // Persist last viewed panel & mark logs read when viewing logs
  useEffect(() => {
    localStorage.setItem('dshub-last-view', currentView);
    if (currentView === 'logs') {
      actions.markLogsRead();
    }
  }, [currentView, actions]);

  // Show error toast when a connection attempt is refused (device already connected elsewhere)
  const wasConnectingRef = useRef(false);
  useEffect(() => {
    if (state.connecting) wasConnectingRef.current = true;
  }, [state.connecting]);
  useEffect(() => {
    if (wasConnectingRef.current && state.connection && !state.connection.connected) {
      wasConnectingRef.current = false;
      const name = state.connection.deviceName ?? state.connection.ip;
      showError(`${name} is already connected in another session`);
    }
  }, [state.connection]);

  // Plot control state
  const [plotTimeSpan, setPlotTimeSpan] = useState(settings.plotDefaults.timeSpan);
  const [plotTimeSpanInput, setPlotTimeSpanInput] = useState(settings.plotDefaults.timeSpan.toString());
  const [plotAutoscale, setPlotAutoscale] = useState(true);
  const [plotShowStats, setPlotShowStats] = useState(false);

  const handlePlotTimeSpanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPlotTimeSpanInput(value);
    const num = parseInt(value);
    if (!isNaN(num) && num >= 5 && num <= settings.plotDefaults.maxTimeSpan) {
      setPlotTimeSpan(num);
    }
  };

  // Dashboard control state
  const [isDashboardEditMode, setIsDashboardEditMode] = useState(false);
  const [dashboardCellSize, setDashboardCellSize] = useState(60);
  const [dashboardSpacing, setDashboardSpacing] = useState(10);
  const [dashboardRoundedCorners, setDashboardRoundedCorners] = useState(true);
  const dashboardContainerRef = useRef<HTMLDivElement>(null);
  const [dashboardContainerWidth, setDashboardContainerWidth] = useState(1200);

  // Panel refs for exposing actions to AppBar
  const registersPanelRef = useRef<RegistersPanelRef>(null);
  const parametersPanelRef = useRef<ParametersPanelRef>(null);
  const dashboardPanelRef = useRef<DashboardPanelRef>(null);
  const mapEditorRef = useRef<MapEditorPanelRef>(null);
  const mapProfilesRef = useRef<MapProfilesPanelRef>(null);
  const [mapEditorBarState, setMapEditorBarState] = useState<MapEditorBarState>({
    hasUnsavedChanges: false,
    canSave: false,
    selectedProfileId: EMPTY_PROFILE_ID,
    allProfiles: [],
  });

  // Calculate dashboard columns based on container width and cell size
  const dashboardCols = Math.floor(dashboardContainerWidth / dashboardCellSize) || DEFAULT_GRID_CONFIG.cols;

  // Measure dashboard container width on mount and resize
  useEffect(() => {
    const updateWidth = () => {
      if (dashboardContainerRef.current) {
        setDashboardContainerWidth(dashboardContainerRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

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

  const handleDashboardAddWidget = () => {
    dashboardPanelRef.current?.openAddWidgetDialog();
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'scanner':
        return <DeviceScannerPanel />;
      case 'status':
        return <DeviceDashboard />;
      case 'dashboard':
        return (
          <DashboardPanel
            ref={dashboardPanelRef}
            isEditMode={isDashboardEditMode}
            cellSize={dashboardCellSize}
            cols={dashboardCols}
            spacing={dashboardSpacing}
            roundedCorners={dashboardRoundedCorners}
            onEditModeChange={setIsDashboardEditMode}
            onCellSizeChange={setDashboardCellSize}
            onAddWidget={handleDashboardAddWidget}
            containerRef={dashboardContainerRef}
            containerWidth={dashboardContainerWidth}
          />
        );
      case 'plot':
        return (
          <PlotPanel
            timeSpan={plotTimeSpan}
            isAutoscaleEnabled={plotAutoscale}
            showStatistics={plotShowStats}
          />
        );
      case 'syscommand':
        return <SysCommandPanel />;
      case 'registers':
        return <RegistersPanel ref={registersPanelRef} />;
      case 'parameters':
        return <ParametersPanel ref={parametersPanelRef} />;
      case 'logs':
        return <LogsPanel />;
      case 'mapeditor':
        return <MapEditorPanel ref={mapEditorRef} onBarStateChange={setMapEditorBarState} />;
      case 'profiles':
        return <MapProfilesPanelLazy ref={mapProfilesRef} />;
      case 'settings':
        return <SettingsPanel />;
      case 'about':
        return (
          <AboutPanel
            onOpenGettingStarted={() => setGettingStartedOpen(true)}
            onOpenGuide={() => setHelpDrawerOpen(true)}
          />
        );
      default:
        return <DeviceScannerPanel />;
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
            primaryTypographyProps={{
              fontSize: '1rem',
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
      <Toolbar sx={{ display: 'flex', justifyContent: effectiveDrawerCollapsed ? 'center' : 'space-between', minHeight: '48px !important' }}>
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

          {/* Scanner Controls - shown when on scanner view */}
          {currentView === 'scanner' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mr: 'auto' }}>
              <Button
                variant="contained"
                startIcon={state.isScanning ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
                onClick={actions.startScan}
                disabled={state.isScanning}
                color="primary"
                size="small"
              >
                {state.isScanning ? 'Scanning...' : 'Scan Network'}
              </Button>
            </Box>
          )}

          {/* Dashboard Controls - shown when on dashboard view */}
          {currentView === 'dashboard' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mr: 'auto' }}>
              <Button
                variant={isDashboardEditMode ? 'contained' : 'outlined'}
                startIcon={<EditIcon />}
                onClick={() => setIsDashboardEditMode(!isDashboardEditMode)}
                color={isDashboardEditMode ? 'primary' : 'inherit'}
                size="small"
              >
                {isDashboardEditMode ? 'Exit Edit' : 'Edit'}
              </Button>
              {isDashboardEditMode && (
                <>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleDashboardAddWidget}
                    color="primary"
                    size="small"
                  >
                    Add Widget
                  </Button>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 1 }}>
                    <Typography variant="body2" color="inherit" sx={{ whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
                      Grid:
                    </Typography>
                    <Slider
                      value={dashboardCellSize}
                      onChange={(_, value) => setDashboardCellSize(value as number)}
                      min={20}
                      max={150}
                      step={5}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(value) => `${value}px`}
                      sx={{
                        width: 120,
                        color: 'inherit',
                        '& .MuiSlider-thumb': {
                          width: 16,
                          height: 16,
                        },
                        '& .MuiSlider-rail': {
                          opacity: 0.3,
                        }
                      }}
                    />
                    <Typography variant="body2" color="inherit" sx={{ whiteSpace: 'nowrap', minWidth: '45px', fontSize: '0.875rem' }}>
                      {dashboardCellSize}px
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 1 }}>
                    <Typography variant="body2" color="inherit" sx={{ whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
                      Spacing:
                    </Typography>
                    <Slider
                      value={dashboardSpacing}
                      onChange={(_, value) => setDashboardSpacing(value as number)}
                      min={0}
                      max={30}
                      step={2}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(value) => `${value}px`}
                      sx={{
                        width: 100,
                        color: 'inherit',
                        '& .MuiSlider-thumb': {
                          width: 16,
                          height: 16,
                        },
                        '& .MuiSlider-rail': {
                          opacity: 0.3,
                        }
                      }}
                    />
                    <Typography variant="body2" color="inherit" sx={{ whiteSpace: 'nowrap', minWidth: '35px', fontSize: '0.875rem' }}>
                      {dashboardSpacing}px
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                    <Typography variant="body2" color="inherit" sx={{ whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
                      Rounded:
                    </Typography>
                    <Switch
                      checked={dashboardRoundedCorners}
                      onChange={(e) => setDashboardRoundedCorners(e.target.checked)}
                      size="small"
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': {
                          color: 'primary.main',
                        },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                          backgroundColor: 'primary.main',
                        },
                      }}
                    />
                  </Box>
                </>
              )}
            </Box>
          )}

          {/* Registers Controls - shown when on registers view */}
          {currentView === 'registers' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mr: 'auto' }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => registersPanelRef.current?.openReadDialog()}
                disabled={!state.connection?.connected}
                color="primary"
                size="small"
              >
                Read Register
              </Button>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => registersPanelRef.current?.refresh()}
                disabled={!state.connection?.connected}
                size="small"
                color="inherit"
              >
                Refresh All
              </Button>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <Tooltip title="Auto-refresh interval">
                <FormControl size="small" sx={{ minWidth: 90 }} disabled={!state.connection?.connected}>
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Interval</InputLabel>
                  <Select
                    value={state.autoRefresh.interval}
                    onChange={(e) => registersPanelRef.current?.setAutoRefreshInterval(e.target.value as number)}
                    label="Interval"
                    startAdornment={<TimerIcon sx={{ fontSize: 14, mr: 0.5, color: 'text.secondary' }} />}
                    sx={{ fontSize: '0.8125rem' }}
                  >
                    <MenuItem value={500}>500ms</MenuItem>
                    <MenuItem value={1000}>1s</MenuItem>
                    <MenuItem value={2000}>2s</MenuItem>
                    <MenuItem value={5000}>5s</MenuItem>
                    <MenuItem value={10000}>10s</MenuItem>
                  </Select>
                </FormControl>
              </Tooltip>
              <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                {state.autoRefresh.activeAddresses.size} active
              </Typography>
            </Box>
          )}

          {/* Parameters Controls - shown when on parameters view */}
          {currentView === 'parameters' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mr: 'auto' }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => parametersPanelRef.current?.openReadDialog()}
                disabled={!state.connection?.connected}
                color="primary"
                size="small"
              >
                Read Parameter
              </Button>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => parametersPanelRef.current?.refresh()}
                disabled={!state.connection?.connected}
                size="small"
                color="inherit"
              >
                Refresh All
              </Button>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <Tooltip title="Auto-refresh interval">
                <FormControl size="small" sx={{ minWidth: 90 }} disabled={!state.connection?.connected}>
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Interval</InputLabel>
                  <Select
                    value={state.autoRefresh.interval}
                    onChange={(e) => parametersPanelRef.current?.setAutoRefreshInterval(e.target.value as number)}
                    label="Interval"
                    startAdornment={<TimerIcon sx={{ fontSize: 14, mr: 0.5, color: 'text.secondary' }} />}
                    sx={{ fontSize: '0.8125rem' }}
                  >
                    <MenuItem value={1000}>1s</MenuItem>
                    <MenuItem value={2000}>2s</MenuItem>
                    <MenuItem value={5000}>5s</MenuItem>
                    <MenuItem value={10000}>10s</MenuItem>
                    <MenuItem value={30000}>30s</MenuItem>
                  </Select>
                </FormControl>
              </Tooltip>
              <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                {state.autoRefresh.activeParameterAddresses.size} active
              </Typography>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <Tooltip title="Save parameter values to CSV">
                <span>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<SaveIcon />}
                    onClick={() => parametersPanelRef.current?.saveValues()}
                    disabled={state.parameters.size === 0}
                    color="inherit"
                  >
                    Save
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="Load parameter values from CSV">
                <span>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<UploadIcon />}
                    onClick={() => parametersPanelRef.current?.loadValues()}
                    disabled={!mapManager.isInitialized()}
                    color="inherit"
                  >
                    Load
                  </Button>
                </span>
              </Tooltip>
              {(() => {
                const pendingCount = parametersPanelRef.current?.pendingWriteCount ?? 0;
                const canWrite = parametersPanelRef.current?.canWrite ?? false;
                return (
                  <Tooltip title="Write all pending values to board">
                    <span>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<SendIcon />}
                        onClick={() => parametersPanelRef.current?.writeAll()}
                        disabled={!canWrite || pendingCount === 0}
                        color="primary"
                      >
                        Write All{pendingCount > 0 ? ` (${pendingCount})` : ''}
                      </Button>
                    </span>
                  </Tooltip>
                );
              })()}
            </Box>
          )}

          {/* Plot Controls */}
          {currentView === 'plot' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mr: 'auto' }}>
              <TextField
                size="small"
                label="Time Span (s)"
                type="number"
                value={plotTimeSpanInput}
                onChange={handlePlotTimeSpanChange}
                error={parseInt(plotTimeSpanInput) < 5 || parseInt(plotTimeSpanInput) > settings.plotDefaults.maxTimeSpan || isNaN(parseInt(plotTimeSpanInput))}
                sx={{ width: 130 }}
                slotProps={{ htmlInput: { style: { fontSize: '0.875rem' } } }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontSize: '0.875rem', mr: 0.5 }}>
                  Autoscale
                </Typography>
                <Switch
                  checked={plotAutoscale}
                  onChange={(e) => setPlotAutoscale(e.target.checked)}
                  size="small"
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontSize: '0.875rem', mr: 0.5 }}>
                  Statistics
                </Typography>
                <Switch
                  checked={plotShowStats}
                  onChange={(e) => setPlotShowStats(e.target.checked)}
                  size="small"
                />
              </Box>
            </Box>
          )}

          {/* Map Editor Controls - shown when on mapeditor view */}
          {currentView === 'mapeditor' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 'auto' }}>
              <Button
                variant="outlined"
                startIcon={<PictureAsPdfIcon />}
                onClick={() => mapEditorRef.current?.exportPdf()}
                size="small"
                color="inherit"
                disabled={mapEditorBarState.selectedProfileId === EMPTY_PROFILE_ID}
              >
                Export PDF
              </Button>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel sx={{ fontSize: '0.8125rem' }}>Profile</InputLabel>
                <Select
                  value={mapEditorBarState.selectedProfileId}
                  label="Profile"
                  onChange={(e) => mapEditorRef.current?.changeProfile(e.target.value)}
                  sx={{ fontSize: '0.8125rem' }}
                >
                  <MenuItem value={EMPTY_PROFILE_ID} sx={{ fontSize: '0.8125rem' }}>
                    <em>No profile</em>
                  </MenuItem>
                  {mapEditorBarState.allProfiles.map(p => (
                    <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.8125rem' }}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {mapEditorBarState.hasUnsavedChanges && (
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'warning.main', flexShrink: 0 }} title="Unsaved changes" />
              )}
              <Tooltip title="Reset changes">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => mapEditorRef.current?.reset()}
                    disabled={!mapEditorBarState.hasUnsavedChanges}
                    color="inherit"
                  >
                    <RestartAltIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={() => mapEditorRef.current?.save()}
                disabled={!mapEditorBarState.canSave}
                size="small"
                color="primary"
              >
                Save
              </Button>
              <Button
                variant="outlined"
                startIcon={<SaveAsIcon />}
                onClick={() => mapEditorRef.current?.saveAs()}
                disabled={mapEditorBarState.selectedProfileId === EMPTY_PROFILE_ID}
                size="small"
                color="inherit"
              >
                Save As
              </Button>
            </Box>
          )}

          {/* Profiles Controls - shown when on profiles view */}
          {currentView === 'profiles' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 'auto' }}>
              <Button
                variant="outlined"
                startIcon={<ImportIcon />}
                onClick={() => mapProfilesRef.current?.openImport()}
                size="small"
                color="inherit"
              >
                Import
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => mapProfilesRef.current?.openCreate()}
                size="small"
                color="primary"
              >
                New Profile
              </Button>
            </Box>
          )}

          {/* Connection Status - always on the right */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: (currentView === 'dashboard' || currentView === 'scanner' || currentView === 'registers' || currentView === 'parameters' || currentView === 'plot' || currentView === 'mapeditor' || currentView === 'profiles') ? 0 : 'auto' }}>
            {state.connection && (
              <>
                {state.connection.deviceName && (
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: FONT_MONO,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'text.primary',
                    }}
                  >
                    {state.connection.deviceName}
                  </Typography>
                )}
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: FONT_MONO,
                    fontSize: '0.6875rem',
                    color: 'text.secondary',
                  }}
                >
                  {state.connection.ip}:{state.connection.port}
                </Typography>
                <Chip
                  label={state.connection.interface}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontFamily: FONT_MONO,
                    fontSize: '0.5625rem',
                    height: 18,
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
                <Box
                  onClick={handleConnectionClick}
                  title={state.connection?.connected ? 'Click to disconnect' : 'Use Device Scanner to connect'}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    cursor: 'pointer',
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                    '&:hover': { backgroundColor: 'action.hover' },
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: connectionColor,
                      boxShadow: state.connection?.connected ? `0 0 6px ${connectionColor}` : 'none',
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: FONT_MONO,
                      fontSize: '0.6875rem',
                      fontWeight: 500,
                      color: connectionColor,
                    }}
                  >
                    {connectionStatus}
                  </Typography>
                </Box>
                {controlStateInfo && (
                  <Box
                    onClick={handleControlClick}
                    title="Click to take control"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      cursor: 'pointer',
                      px: 1,
                      py: 0.25,
                      borderRadius: 1,
                      '&:hover': { backgroundColor: 'action.hover' },
                    }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: controlStateInfo.color,
                        boxShadow: `0 0 6px ${controlStateInfo.color}`,
                      }}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: FONT_MONO,
                        fontSize: '0.6875rem',
                        fontWeight: 500,
                        color: controlStateInfo.color,
                      }}
                    >
                      {controlStateInfo.label}
                    </Typography>
                  </Box>
                )}
              </>
            )}
          </Box>

          {/* Help button - pinned to far right */}
          <Tooltip title="Workflow Guide">
            <IconButton
              size="small"
              onClick={() => setHelpDrawerOpen(true)}
              sx={{ color: 'text.secondary', ml: 1 }}
              aria-label="Open workflow guide"
            >
              <HelpOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
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
          <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>}>
            {renderCurrentView()}
          </Suspense>
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