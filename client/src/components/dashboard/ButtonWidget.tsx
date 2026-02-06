import React, { useState } from 'react';
import { Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, Typography } from '@mui/material';
import {
  PlayArrow,
  Stop,
  Refresh,
  Power,
  PowerOff,
  Upload,
  Download,
  Send,
  Save,
  Check,
  Close,
  Warning,
  Info,
  Settings,
  Build,
  Lock,
  LockOpen,
  Visibility,
  VisibilityOff,
  Home,
  Dashboard,
  Timeline,
  Assessment,
  Storage,
  Memory,
  BrightnessHigh,
  BrightnessLow,
  VolumeUp,
  VolumeOff,
  Speed,
  ThermostatAuto,
  WbSunny,
  Nightlight,
  Bolt,
  ElectricBolt,
  // Additional icons
  Pause,
  SkipNext,
  SkipPrevious,
  FastForward,
  FastRewind,
  Repeat,
  Shuffle,
  Edit,
  ContentCopy,
  ContentCut,
  ContentPaste,
  Print,
  Share,
  Favorite,
  Star,
  Notifications,
  NotificationsOff,
  Alarm,
  AlarmOn,
  Timer,
  Schedule,
  CalendarToday,
  Event,
  ArrowUpward,
  ArrowDownward,
  ArrowBack,
  ArrowForward,
  TrendingUp,
  TrendingDown,
  TrendingFlat,
  ZoomIn,
  ZoomOut,
  Fullscreen,
  FullscreenExit,
  Remove,
  Block,
  Done,
  DoneAll,
  Error,
  HelpOutline,
  Report,
  Lightbulb,
  FlashOn,
  FlashOff,
  Wifi,
  WifiOff,
  Bluetooth,
  BluetoothDisabled,
  Mic,
  MicOff,
  Videocam,
  VideocamOff,
  Call,
  CallEnd,
  PhoneAndroid,
  Computer,
  Laptop,
  Keyboard,
  Mouse,
  Router,
  DeviceHub,
  Sensors,
  DeveloperBoard,
  Air,
  AcUnit,
  LocalFireDepartment,
  WaterDrop,
  Opacity,
  Cloud,
  CloudOff,
  Thunderstorm,
  FilterDrama,
  NightsStay,
  Grade,
  Stars,
  WbIncandescent,
  FluorescentOutlined,
  Flag,
  Bookmark,
  LocalOffer,
  Label,
  ShoppingCart,
  AttachMoney,
  BarChart,
  PieChart,
  ShowChart,
  MultilineChart,
  BubbleChart,
  ScatterPlot,
  OpenInNew,
  Launch,
  Link,
  LinkOff,
  AttachFile,
  CloudUpload,
  CloudDownload,
  Sync,
  SyncDisabled,
  CachedOutlined,
  Loop,
  Autorenew,
  Update,
  SystemUpdate,
  GetApp,
  Publish,
  Undo,
  Redo,
  Reply,
  Forward as ForwardIcon,
  Search,
  FilterList,
  Sort,
  ViewList,
  ViewModule,
  ViewQuilt,
  GridView,
  RestartAlt,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { ButtonWidgetConfig } from '../../types/dashboard';
import { useDSHub } from '../../contexts/DSHubContext';
import { useToast } from '../ToastNotification';

// Icon mapping for button widgets
const ICON_COMPONENTS: Record<string, React.ComponentType> = {
  PlayArrow,
  Pause,
  Stop,
  SkipNext,
  SkipPrevious,
  FastForward,
  FastRewind,
  Repeat,
  Shuffle,
  AddIcon,
  Remove,
  DeleteIcon,
  Edit,
  Check,
  DoneAll,
  Close,
  Block,
  Save,
  Send,
  Share,
  Print,
  ContentCopy,
  ContentCut,
  ContentPaste,
  Undo,
  Redo,
  Power,
  PowerOff,
  Refresh,
  RestartAlt,
  Sync,
  SyncDisabled,
  Loop,
  Autorenew,
  Update,
  SystemUpdate,
  Upload,
  Download,
  CloudUpload,
  CloudDownload,
  GetApp,
  Publish,
  Warning,
  Error,
  Info,
  HelpOutline,
  Report,
  Notifications,
  NotificationsOff,
  Alarm,
  AlarmOn,
  Settings,
  Build,
  Lock,
  LockOpen,
  Visibility,
  VisibilityOff,
  Home,
  Dashboard,
  ArrowUpward,
  ArrowDownward,
  ArrowBack,
  ArrowForward,
  Reply,
  ForwardIcon,
  OpenInNew,
  Launch,
  Timeline,
  Assessment,
  TrendingUp,
  TrendingDown,
  TrendingFlat,
  BarChart,
  PieChart,
  ShowChart,
  MultilineChart,
  BubbleChart,
  ScatterPlot,
  Storage,
  Memory,
  PhoneAndroid,
  Computer,
  Laptop,
  Keyboard,
  Mouse,
  Router,
  DeviceHub,
  Sensors,
  DeveloperBoard,
  Wifi,
  WifiOff,
  Bluetooth,
  BluetoothDisabled,
  Link,
  LinkOff,
  AttachFile,
  Call,
  CallEnd,
  Mic,
  MicOff,
  Videocam,
  VideocamOff,
  BrightnessHigh,
  BrightnessLow,
  Lightbulb,
  FlashOn,
  FlashOff,
  WbIncandescent,
  FluorescentOutlined,
  VolumeUp,
  VolumeOff,
  WbSunny,
  Nightlight,
  NightsStay,
  Cloud,
  CloudOff,
  Thunderstorm,
  FilterDrama,
  Air,
  AcUnit,
  LocalFireDepartment,
  WaterDrop,
  Opacity,
  ThermostatAuto,
  Bolt,
  ElectricBolt,
  Speed,
  Favorite,
  Star,
  Grade,
  Stars,
  Flag,
  Bookmark,
  Label,
  Timer,
  Schedule,
  CalendarToday,
  Event,
  ZoomIn,
  ZoomOut,
  Fullscreen,
  FullscreenExit,
  ViewList,
  ViewModule,
  ViewQuilt,
  GridView,
  Search,
  FilterList,
  Sort
};

interface ButtonWidgetProps {
  config: ButtonWidgetConfig;
  isEditMode: boolean;
}

export default function ButtonWidget({ config, isEditMode }: ButtonWidgetProps) {
  const { state, actions } = useDSHub();
  const { showSuccess, showError } = useToast();
  const [confirmDialog, setConfirmDialog] = useState(false);

  // Get the icon component if configured
  const IconComponent = config.icon ? ICON_COMPONENTS[config.icon] : null;

  // Check if label is empty or just whitespace
  const hasLabel = config.label && config.label.trim().length > 0;

  const handleClick = () => {
    if (isEditMode) return; // Don't trigger actions in edit mode

    if (!state.connection?.connected) {
      showError('Not connected to device');
      return;
    }

    if (config.confirmationRequired) {
      setConfirmDialog(true);
    } else {
      executeWrite();
    }
  };

  const executeWrite = () => {
    setConfirmDialog(false);

    try {
      if (config.target === 'register') {
        actions.writeRegister(config.address, config.valueToWrite);
        showSuccess(`Wrote ${config.valueToWrite} to register ${config.address}`);
      } else if (config.target === 'parameter') {
        actions.writeParameter(config.address, config.valueToWrite);
        showSuccess(`Wrote ${config.valueToWrite} to parameter ${config.address}`);
      } else if (config.target === 'sysCommand') {
        actions.sendCommand(config.address, config.valueToWrite);
        showSuccess(`Sent SYS_COMMAND ${config.address} with value ${config.valueToWrite}`);
      }
    } catch (error) {
      showError(`Failed to execute action: ${error}`);
    }
  };

  return (
    <>
      <Box
        sx={{
          position: 'relative',
          height: '100%',
          width: '100%'
        }}
      >
        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={handleClick}
          disabled={isEditMode || !state.connection?.connected}
          startIcon={hasLabel && IconComponent ? <IconComponent /> : undefined}
          sx={{
            height: '100%',
            width: '100%',
            backgroundColor: config.color || 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: config.fontSize ? `${config.fontSize}rem` : '1rem',
            fontWeight: 'bold',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.3s ease',
            '&:hover:not(:disabled)': {
              backgroundColor: config.color || 'primary.dark',
              transform: 'scale(1.02)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
            },
            '&:active:not(:disabled)': {
              transform: 'scale(0.98)'
            }
          }}
        >
          {hasLabel ? config.label : (IconComponent ? <IconComponent /> : config.label)}
        </Button>

        {!state.connection?.connected && (
          <Box
            sx={{
              position: 'absolute',
              bottom: '4px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              pointerEvents: 'none'
            }}
          >
            <Typography variant="caption" sx={{ color: 'white', fontSize: '0.65rem' }}>
              Not connected
            </Typography>
          </Box>
        )}
      </Box>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
        <DialogTitle>Confirm Action</DialogTitle>
        <DialogContent>
          <Typography>
            {config.target === 'sysCommand' ? (
              <>
                Are you sure you want to send SYS_COMMAND <strong>{config.address}</strong> with value{' '}
                <strong>{config.valueToWrite}</strong>?
              </>
            ) : (
              <>
                Are you sure you want to write <strong>{config.valueToWrite}</strong> to{' '}
                {config.target} <strong>{config.address}</strong>?
              </>
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(false)}>Cancel</Button>
          <Button onClick={executeWrite} variant="contained" color="primary">
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
