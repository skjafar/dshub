import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Switch,
  FormControlLabel,
  IconButton,
  Divider,
  Autocomplete
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
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
  TrendingUp as Analytics,
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
  RestartAlt
} from '@mui/icons-material';
import {
  WidgetType,
  WidgetConfig,
  DataSource,
  DisplayFormat,
  ButtonWidgetConfig,
  ValueReadWidgetConfig,
  ValueWriteWidgetConfig,
  MiniPlotWidgetConfig,
  DropdownWidgetConfig
} from '../../types/dashboard';
import { useDeviceMon } from '../../contexts/DeviceMonContext';
import { useSettings } from '../../contexts/SettingsContext';
import { parseMapFile, MapEntry } from '../../maps/mapParser';

// Available icons for button widgets
const AVAILABLE_ICONS = [
  { name: 'None', value: '' },
  // Media Controls
  { name: 'Play', value: 'PlayArrow', Icon: PlayArrow },
  { name: 'Pause', value: 'Pause', Icon: Pause },
  { name: 'Stop', value: 'Stop', Icon: Stop },
  { name: 'Skip Next', value: 'SkipNext', Icon: SkipNext },
  { name: 'Skip Previous', value: 'SkipPrevious', Icon: SkipPrevious },
  { name: 'Fast Forward', value: 'FastForward', Icon: FastForward },
  { name: 'Fast Rewind', value: 'FastRewind', Icon: FastRewind },
  { name: 'Repeat', value: 'Repeat', Icon: Repeat },
  { name: 'Shuffle', value: 'Shuffle', Icon: Shuffle },
  // Basic Actions
  { name: 'Add', value: 'AddIcon', Icon: AddIcon },
  { name: 'Remove', value: 'Remove', Icon: Remove },
  { name: 'Delete', value: 'DeleteIcon', Icon: DeleteIcon },
  { name: 'Edit', value: 'Edit', Icon: Edit },
  { name: 'Check', value: 'Check', Icon: Check },
  { name: 'Done All', value: 'DoneAll', Icon: DoneAll },
  { name: 'Close', value: 'Close', Icon: Close },
  { name: 'Block', value: 'Block', Icon: Block },
  { name: 'Save', value: 'Save', Icon: Save },
  { name: 'Send', value: 'Send', Icon: Send },
  { name: 'Share', value: 'Share', Icon: Share },
  { name: 'Print', value: 'Print', Icon: Print },
  { name: 'Copy', value: 'ContentCopy', Icon: ContentCopy },
  { name: 'Cut', value: 'ContentCut', Icon: ContentCut },
  { name: 'Paste', value: 'ContentPaste', Icon: ContentPaste },
  { name: 'Undo', value: 'Undo', Icon: Undo },
  { name: 'Redo', value: 'Redo', Icon: Redo },
  // Power & System
  { name: 'Power On', value: 'Power', Icon: Power },
  { name: 'Power Off', value: 'PowerOff', Icon: PowerOff },
  { name: 'Refresh', value: 'Refresh', Icon: Refresh },
  { name: 'Restart', value: 'RestartAlt', Icon: RestartAlt },
  { name: 'Sync', value: 'Sync', Icon: Sync },
  { name: 'Sync Disabled', value: 'SyncDisabled', Icon: SyncDisabled },
  { name: 'Loop', value: 'Loop', Icon: Loop },
  { name: 'Auto Renew', value: 'Autorenew', Icon: Autorenew },
  { name: 'Update', value: 'Update', Icon: Update },
  { name: 'System Update', value: 'SystemUpdate', Icon: SystemUpdate },
  // Upload/Download
  { name: 'Upload', value: 'Upload', Icon: Upload },
  { name: 'Download', value: 'Download', Icon: Download },
  { name: 'Cloud Upload', value: 'CloudUpload', Icon: CloudUpload },
  { name: 'Cloud Download', value: 'CloudDownload', Icon: CloudDownload },
  { name: 'Get App', value: 'GetApp', Icon: GetApp },
  { name: 'Publish', value: 'Publish', Icon: Publish },
  // Notifications & Status
  { name: 'Warning', value: 'Warning', Icon: Warning },
  { name: 'Error', value: 'Error', Icon: Error },
  { name: 'Info', value: 'Info', Icon: Info },
  { name: 'Help', value: 'HelpOutline', Icon: HelpOutline },
  { name: 'Report', value: 'Report', Icon: Report },
  { name: 'Notifications', value: 'Notifications', Icon: Notifications },
  { name: 'Notifications Off', value: 'NotificationsOff', Icon: NotificationsOff },
  { name: 'Alarm', value: 'Alarm', Icon: Alarm },
  { name: 'Alarm On', value: 'AlarmOn', Icon: AlarmOn },
  // Settings & Config
  { name: 'Settings', value: 'Settings', Icon: Settings },
  { name: 'Build', value: 'Build', Icon: Build },
  { name: 'Lock', value: 'Lock', Icon: Lock },
  { name: 'Unlock', value: 'LockOpen', Icon: LockOpen },
  { name: 'Show', value: 'Visibility', Icon: Visibility },
  { name: 'Hide', value: 'VisibilityOff', Icon: VisibilityOff },
  // Navigation
  { name: 'Home', value: 'Home', Icon: Home },
  { name: 'Dashboard', value: 'Dashboard', Icon: Dashboard },
  { name: 'Arrow Up', value: 'ArrowUpward', Icon: ArrowUpward },
  { name: 'Arrow Down', value: 'ArrowDownward', Icon: ArrowDownward },
  { name: 'Arrow Back', value: 'ArrowBack', Icon: ArrowBack },
  { name: 'Arrow Forward', value: 'ArrowForward', Icon: ArrowForward },
  { name: 'Reply', value: 'Reply', Icon: Reply },
  { name: 'Forward', value: 'ForwardIcon', Icon: ForwardIcon },
  { name: 'Open In New', value: 'OpenInNew', Icon: OpenInNew },
  { name: 'Launch', value: 'Launch', Icon: Launch },
  // Data & Charts
  { name: 'Timeline', value: 'Timeline', Icon: Timeline },
  { name: 'Assessment', value: 'Assessment', Icon: Assessment },
  { name: 'Trending Up', value: 'TrendingUp', Icon: TrendingUp },
  { name: 'Trending Down', value: 'TrendingDown', Icon: TrendingDown },
  { name: 'Trending Flat', value: 'TrendingFlat', Icon: TrendingFlat },
  { name: 'Bar Chart', value: 'BarChart', Icon: BarChart },
  { name: 'Pie Chart', value: 'PieChart', Icon: PieChart },
  { name: 'Show Chart', value: 'ShowChart', Icon: ShowChart },
  { name: 'Multiline Chart', value: 'MultilineChart', Icon: MultilineChart },
  { name: 'Bubble Chart', value: 'BubbleChart', Icon: BubbleChart },
  { name: 'Scatter Plot', value: 'ScatterPlot', Icon: ScatterPlot },
  // Devices & Hardware
  { name: 'Storage', value: 'Storage', Icon: Storage },
  { name: 'Memory', value: 'Memory', Icon: Memory },
  { name: 'Phone', value: 'PhoneAndroid', Icon: PhoneAndroid },
  { name: 'Computer', value: 'Computer', Icon: Computer },
  { name: 'Laptop', value: 'Laptop', Icon: Laptop },
  { name: 'Keyboard', value: 'Keyboard', Icon: Keyboard },
  { name: 'Mouse', value: 'Mouse', Icon: Mouse },
  { name: 'Router', value: 'Router', Icon: Router },
  { name: 'Device Hub', value: 'DeviceHub', Icon: DeviceHub },
  { name: 'Sensors', value: 'Sensors', Icon: Sensors },
  { name: 'Developer Board', value: 'DeveloperBoard', Icon: DeveloperBoard },
  // Connectivity
  { name: 'Wifi', value: 'Wifi', Icon: Wifi },
  { name: 'Wifi Off', value: 'WifiOff', Icon: WifiOff },
  { name: 'Bluetooth', value: 'Bluetooth', Icon: Bluetooth },
  { name: 'Bluetooth Disabled', value: 'BluetoothDisabled', Icon: BluetoothDisabled },
  { name: 'Link', value: 'Link', Icon: Link },
  { name: 'Link Off', value: 'LinkOff', Icon: LinkOff },
  { name: 'Attach File', value: 'AttachFile', Icon: AttachFile },
  // Communication
  { name: 'Call', value: 'Call', Icon: Call },
  { name: 'Call End', value: 'CallEnd', Icon: CallEnd },
  { name: 'Mic', value: 'Mic', Icon: Mic },
  { name: 'Mic Off', value: 'MicOff', Icon: MicOff },
  { name: 'Videocam', value: 'Videocam', Icon: Videocam },
  { name: 'Videocam Off', value: 'VideocamOff', Icon: VideocamOff },
  // Lighting & Display
  { name: 'Brightness High', value: 'BrightnessHigh', Icon: BrightnessHigh },
  { name: 'Brightness Low', value: 'BrightnessLow', Icon: BrightnessLow },
  { name: 'Lightbulb', value: 'Lightbulb', Icon: Lightbulb },
  { name: 'Flash On', value: 'FlashOn', Icon: FlashOn },
  { name: 'Flash Off', value: 'FlashOff', Icon: FlashOff },
  { name: 'Incandescent', value: 'WbIncandescent', Icon: WbIncandescent },
  { name: 'Fluorescent', value: 'FluorescentOutlined', Icon: FluorescentOutlined },
  // Audio
  { name: 'Volume Up', value: 'VolumeUp', Icon: VolumeUp },
  { name: 'Volume Off', value: 'VolumeOff', Icon: VolumeOff },
  // Weather & Environment
  { name: 'Sun', value: 'WbSunny', Icon: WbSunny },
  { name: 'Moon', value: 'Nightlight', Icon: Nightlight },
  { name: 'Nights Stay', value: 'NightsStay', Icon: NightsStay },
  { name: 'Cloud', value: 'Cloud', Icon: Cloud },
  { name: 'Cloud Off', value: 'CloudOff', Icon: CloudOff },
  { name: 'Thunderstorm', value: 'Thunderstorm', Icon: Thunderstorm },
  { name: 'Filter Drama', value: 'FilterDrama', Icon: FilterDrama },
  { name: 'Air', value: 'Air', Icon: Air },
  { name: 'AC Unit', value: 'AcUnit', Icon: AcUnit },
  { name: 'Fire', value: 'LocalFireDepartment', Icon: LocalFireDepartment },
  { name: 'Water Drop', value: 'WaterDrop', Icon: WaterDrop },
  { name: 'Opacity', value: 'Opacity', Icon: Opacity },
  // Temperature & Climate
  { name: 'Thermostat', value: 'ThermostatAuto', Icon: ThermostatAuto },
  // Electrical
  { name: 'Bolt', value: 'Bolt', Icon: Bolt },
  { name: 'Electric', value: 'ElectricBolt', Icon: ElectricBolt },
  { name: 'Speed', value: 'Speed', Icon: Speed },
  // Favorites & Markers
  { name: 'Favorite', value: 'Favorite', Icon: Favorite },
  { name: 'Star', value: 'Star', Icon: Star },
  { name: 'Grade', value: 'Grade', Icon: Grade },
  { name: 'Stars', value: 'Stars', Icon: Stars },
  { name: 'Flag', value: 'Flag', Icon: Flag },
  { name: 'Bookmark', value: 'Bookmark', Icon: Bookmark },
  { name: 'Label', value: 'Label', Icon: Label },
  // Time & Schedule
  { name: 'Timer', value: 'Timer', Icon: Timer },
  { name: 'Schedule', value: 'Schedule', Icon: Schedule },
  { name: 'Calendar', value: 'CalendarToday', Icon: CalendarToday },
  { name: 'Event', value: 'Event', Icon: Event },
  // View & Display
  { name: 'Zoom In', value: 'ZoomIn', Icon: ZoomIn },
  { name: 'Zoom Out', value: 'ZoomOut', Icon: ZoomOut },
  { name: 'Fullscreen', value: 'Fullscreen', Icon: Fullscreen },
  { name: 'Fullscreen Exit', value: 'FullscreenExit', Icon: FullscreenExit },
  { name: 'View List', value: 'ViewList', Icon: ViewList },
  { name: 'View Module', value: 'ViewModule', Icon: ViewModule },
  { name: 'View Quilt', value: 'ViewQuilt', Icon: ViewQuilt },
  { name: 'Grid View', value: 'GridView', Icon: GridView },
  // Tools
  { name: 'Search', value: 'Search', Icon: Search },
  { name: 'Filter List', value: 'FilterList', Icon: FilterList },
  { name: 'Sort', value: 'Sort', Icon: Sort }
];

interface WidgetConfigDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (type: WidgetType, config: WidgetConfig) => void;
  initialType?: WidgetType;
  initialConfig?: WidgetConfig;
  mode: 'add' | 'edit';
}

export default function WidgetConfigDialog({
  open,
  onClose,
  onSave,
  initialType,
  initialConfig,
  mode
}: WidgetConfigDialogProps) {
  const { state } = useDeviceMon();
  const { getActiveProfile } = useSettings();
  const [widgetType, setWidgetType] = useState<WidgetType>(initialType || 'button');
  const [config, setConfig] = useState<Partial<WidgetConfig>>({});

  // Get available registers and parameters from the map (not from state)
  const activeProfile = getActiveProfile();
  const registerMapEntries = activeProfile ? parseMapFile(activeProfile.registersMap, true).entries : [];
  const parameterMapEntries = activeProfile ? parseMapFile(activeProfile.parametersMap, false).entries : [];

  // Convert MapEntry to a compatible format
  const registers = registerMapEntries.map(entry => ({
    address: entry.address,
    name: entry.name,
    type: entry.type,
    isReadOnly: entry.accessPermit === 'READ_ONLY'
  }));

  const parameters = parameterMapEntries.map(entry => ({
    address: entry.address,
    name: entry.name,
    type: entry.type
  }));

  // Update widget type and config when dialog opens or props change
  useEffect(() => {
    if (!open) return;

    // Update widget type if provided
    const typeToUse = initialType || 'button';
    setWidgetType(typeToUse);

    // Update config
    if (initialConfig) {
      setConfig(initialConfig);
    } else {
      // Set default config based on widget type
      resetConfig(typeToUse);
    }
  }, [initialConfig, initialType, open]);

  const resetConfig = (type: WidgetType) => {
    switch (type) {
      case 'button':
        setConfig({
          label: 'Button',
          target: 'register',
          address: 0,
          valueToWrite: 0,
          confirmationRequired: false
        } as ButtonWidgetConfig);
        break;
      case 'valueRead':
        setConfig({
          label: 'Value',
          source: 'register',
          address: 0,
          displayFormat: 'decimal',
          refreshInterval: 1000,
          showTimestamp: false
        } as ValueReadWidgetConfig);
        break;
      case 'valueWrite':
        setConfig({
          label: 'Write Value',
          target: 'register',
          address: 0,
          inputType: 'number',
          confirmationRequired: false
        } as ValueWriteWidgetConfig);
        break;
      case 'miniPlot':
        setConfig({
          label: 'Mini Plot',
          source: 'register',
          address: 0,
          timeWindow: 60,
          pollInterval: 250,
          showLegend: false
        } as MiniPlotWidgetConfig);
        break;
      case 'dropdown':
        setConfig({
          label: 'Dropdown',
          target: 'register',
          address: 0,
          options: [{ label: 'Option 1', value: 0 }],
          confirmationRequired: false
        } as DropdownWidgetConfig);
        break;
    }
  };

  const handleSave = () => {
    onSave(widgetType, config as WidgetConfig);
    onClose();
  };

  // Helper to render address selector with mapped items
  const renderAddressSelector = (
    dataSource: DataSource,
    currentAddress: number | undefined,
    onChange: (address: number) => void,
    label: string = 'Address'
  ) => {
    const items = dataSource === 'register' ? registers : parameters;
    const selectedItem = items.find(item => item.address === currentAddress);

    return (
      <Autocomplete
        fullWidth
        options={items}
        getOptionLabel={(option) => `${option.address} - ${option.name}`}
        value={selectedItem || null}
        onChange={(_, newValue) => {
          if (newValue) {
            onChange(newValue.address);
          }
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            margin="normal"
            helperText={items.length === 0 ? `No ${dataSource}s mapped` : ''}
          />
        )}
        renderOption={(props, option) => (
          <li {...props} key={option.address}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="body2">
                <strong>{option.address}</strong> - {option.name}
              </Typography>
              {option.type && (
                <Typography variant="caption" color="text.secondary">
                  {option.type}
                  {(option as any).isReadOnly !== undefined && ` (${(option as any).isReadOnly ? 'Read-Only' : 'Read/Write'})`}
                </Typography>
              )}
            </Box>
          </li>
        )}
        isOptionEqualToValue={(option, value) => option.address === value.address}
      />
    );
  };

  const renderConfigFields = () => {
    switch (widgetType) {
      case 'button':
        return renderButtonConfig();
      case 'valueRead':
        return renderValueReadConfig();
      case 'valueWrite':
        return renderValueWriteConfig();
      case 'miniPlot':
        return renderMiniPlotConfig();
      case 'dropdown':
        return renderDropdownConfig();
    }
  };

  const renderButtonConfig = () => {
    const buttonConfig = config as Partial<ButtonWidgetConfig>;
    const selectedIconObj = AVAILABLE_ICONS.find(icon => icon.value === (buttonConfig.icon || ''));

    return (
      <>
        <TextField
          fullWidth
          label="Button Label"
          value={buttonConfig.label || ''}
          onChange={(e) => setConfig({ ...config, label: e.target.value })}
          margin="normal"
        />
        <FormControl fullWidth margin="normal">
          <InputLabel>Icon (optional)</InputLabel>
          <Select
            value={buttonConfig.icon || ''}
            onChange={(e) => setConfig({ ...config, icon: e.target.value })}
            label="Icon (optional)"
            renderValue={(value) => {
              const icon = AVAILABLE_ICONS.find(i => i.value === value);
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {icon?.Icon && <icon.Icon fontSize="small" />}
                  <span>{icon?.name || 'None'}</span>
                </Box>
              );
            }}
          >
            {AVAILABLE_ICONS.map((icon) => (
              <MenuItem key={icon.value} value={icon.value}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {icon.Icon && <icon.Icon fontSize="small" />}
                  <span>{icon.name}</span>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth margin="normal">
          <InputLabel>Target</InputLabel>
          <Select
            value={buttonConfig.target || 'register'}
            onChange={(e) => setConfig({ ...config, target: e.target.value as DataSource })}
            label="Target"
          >
            <MenuItem value="register">Register</MenuItem>
            <MenuItem value="parameter">Parameter</MenuItem>
            <MenuItem value="sysCommand">SYS_COMMAND</MenuItem>
          </Select>
        </FormControl>
        {buttonConfig.target === 'sysCommand' ? (
          <TextField
            fullWidth
            type="number"
            label="Command Code"
            value={buttonConfig.address ?? 0}
            onChange={(e) => setConfig({ ...config, address: parseInt(e.target.value) })}
            margin="normal"
            helperText="System command code (e.g., 200 for ENABLE_ALL_MOTORS)"
          />
        ) : (
          renderAddressSelector(
            buttonConfig.target || 'register',
            buttonConfig.address,
            (address) => setConfig({ ...config, address }),
            `${buttonConfig.target === 'parameter' ? 'Parameter' : 'Register'} Address`
          )
        )}
        <TextField
          fullWidth
          type="number"
          label={buttonConfig.target === 'sysCommand' ? 'Command Value (Optional)' : 'Value to Write'}
          value={buttonConfig.valueToWrite ?? 0}
          onChange={(e) => setConfig({ ...config, valueToWrite: parseInt(e.target.value) })}
          margin="normal"
          helperText={buttonConfig.target === 'sysCommand' ? 'Optional value parameter for the command' : undefined}
        />
        <TextField
          fullWidth
          label="Button Color (optional)"
          value={buttonConfig.color || ''}
          onChange={(e) => setConfig({ ...config, color: e.target.value })}
          margin="normal"
          placeholder="#FF5722"
        />
        <FormControlLabel
          control={
            <Switch
              checked={buttonConfig.confirmationRequired || false}
              onChange={(e) => setConfig({ ...config, confirmationRequired: e.target.checked })}
            />
          }
          label="Require Confirmation"
        />
      </>
    );
  };

  const renderValueReadConfig = () => {
    const readConfig = config as Partial<ValueReadWidgetConfig>;
    return (
      <>
        <TextField
          fullWidth
          label="Label"
          value={readConfig.label || ''}
          onChange={(e) => setConfig({ ...config, label: e.target.value })}
          margin="normal"
        />
        <FormControl fullWidth margin="normal">
          <InputLabel>Source</InputLabel>
          <Select
            value={readConfig.source || 'register'}
            onChange={(e) => setConfig({ ...config, source: e.target.value as DataSource })}
            label="Source"
          >
            <MenuItem value="register">Register</MenuItem>
            <MenuItem value="parameter">Parameter</MenuItem>
          </Select>
        </FormControl>
        {renderAddressSelector(
          readConfig.source || 'register',
          readConfig.address,
          (address) => setConfig({ ...config, address }),
          `${readConfig.source === 'parameter' ? 'Parameter' : 'Register'} Address`
        )}
        <FormControl fullWidth margin="normal">
          <InputLabel>Display Format</InputLabel>
          <Select
            value={readConfig.displayFormat || 'decimal'}
            onChange={(e) => setConfig({ ...config, displayFormat: e.target.value as DisplayFormat })}
            label="Display Format"
          >
            <MenuItem value="decimal">Decimal</MenuItem>
            <MenuItem value="hex">Hexadecimal</MenuItem>
            <MenuItem value="binary">Binary</MenuItem>
          </Select>
        </FormControl>
        <TextField
          fullWidth
          type="number"
          label="Refresh Interval (ms)"
          value={readConfig.refreshInterval ?? 1000}
          onChange={(e) => setConfig({ ...config, refreshInterval: parseInt(e.target.value) })}
          margin="normal"
        />
        <TextField
          fullWidth
          label="Unit (optional)"
          value={readConfig.unit || ''}
          onChange={(e) => setConfig({ ...config, unit: e.target.value })}
          margin="normal"
          placeholder="°C, V, A, etc."
        />
        <FormControlLabel
          control={
            <Switch
              checked={readConfig.showTimestamp || false}
              onChange={(e) => setConfig({ ...config, showTimestamp: e.target.checked })}
            />
          }
          label="Show Timestamp"
        />
      </>
    );
  };

  const renderValueWriteConfig = () => {
    const writeConfig = config as Partial<ValueWriteWidgetConfig>;
    return (
      <>
        <TextField
          fullWidth
          label="Label"
          value={writeConfig.label || ''}
          onChange={(e) => setConfig({ ...config, label: e.target.value })}
          margin="normal"
        />
        <FormControl fullWidth margin="normal">
          <InputLabel>Target</InputLabel>
          <Select
            value={writeConfig.target || 'register'}
            onChange={(e) => setConfig({ ...config, target: e.target.value as DataSource })}
            label="Target"
          >
            <MenuItem value="register">Register</MenuItem>
            <MenuItem value="parameter">Parameter</MenuItem>
          </Select>
        </FormControl>
        {renderAddressSelector(
          writeConfig.target || 'register',
          writeConfig.address,
          (address) => setConfig({ ...config, address }),
          `${writeConfig.target === 'parameter' ? 'Parameter' : 'Register'} Address`
        )}
        <TextField
          fullWidth
          type="number"
          label="Minimum Value (optional)"
          value={writeConfig.min ?? ''}
          onChange={(e) => setConfig({ ...config, min: e.target.value ? parseInt(e.target.value) : undefined })}
          margin="normal"
        />
        <TextField
          fullWidth
          type="number"
          label="Maximum Value (optional)"
          value={writeConfig.max ?? ''}
          onChange={(e) => setConfig({ ...config, max: e.target.value ? parseInt(e.target.value) : undefined })}
          margin="normal"
        />
        <FormControlLabel
          control={
            <Switch
              checked={writeConfig.confirmationRequired || false}
              onChange={(e) => setConfig({ ...config, confirmationRequired: e.target.checked })}
            />
          }
          label="Require Confirmation"
        />
      </>
    );
  };

  const renderMiniPlotConfig = () => {
    const plotConfig = config as Partial<MiniPlotWidgetConfig>;
    return (
      <>
        <TextField
          fullWidth
          label="Label"
          value={plotConfig.label || ''}
          onChange={(e) => setConfig({ ...config, label: e.target.value })}
          margin="normal"
        />
        <FormControl fullWidth margin="normal">
          <InputLabel>Source</InputLabel>
          <Select
            value={plotConfig.source || 'register'}
            onChange={(e) => setConfig({ ...config, source: e.target.value as DataSource })}
            label="Source"
          >
            <MenuItem value="register">Register</MenuItem>
            <MenuItem value="parameter">Parameter</MenuItem>
          </Select>
        </FormControl>
        {renderAddressSelector(
          plotConfig.source || 'register',
          plotConfig.address,
          (address) => setConfig({ ...config, address }),
          `${plotConfig.source === 'parameter' ? 'Parameter' : 'Register'} Address`
        )}
        <TextField
          fullWidth
          type="number"
          label="Time Window (seconds)"
          value={plotConfig.timeWindow ?? 60}
          onChange={(e) => setConfig({ ...config, timeWindow: parseInt(e.target.value) })}
          margin="normal"
        />
        <TextField
          fullWidth
          type="number"
          label="Poll Interval (ms)"
          value={plotConfig.pollInterval ?? 250}
          onChange={(e) => setConfig({ ...config, pollInterval: parseInt(e.target.value) })}
          margin="normal"
        />
        <TextField
          fullWidth
          label="Line Color (optional)"
          value={plotConfig.color || ''}
          onChange={(e) => setConfig({ ...config, color: e.target.value })}
          margin="normal"
          placeholder="#4A9EFF"
        />
        <FormControlLabel
          control={
            <Switch
              checked={plotConfig.showLegend || false}
              onChange={(e) => setConfig({ ...config, showLegend: e.target.checked })}
            />
          }
          label="Show Legend"
        />
      </>
    );
  };

  const renderDropdownConfig = () => {
    const dropdownConfig = config as Partial<DropdownWidgetConfig>;
    const options = dropdownConfig.options || [];

    const addOption = () => {
      setConfig({
        ...config,
        options: [...options, { label: `Option ${options.length + 1}`, value: 0 }]
      });
    };

    const updateOption = (index: number, field: 'label' | 'value', value: string | number) => {
      const newOptions = [...options];
      newOptions[index] = { ...newOptions[index], [field]: value };
      setConfig({ ...config, options: newOptions });
    };

    const removeOption = (index: number) => {
      setConfig({
        ...config,
        options: options.filter((_, i) => i !== index)
      });
    };

    return (
      <>
        <TextField
          fullWidth
          label="Label"
          value={dropdownConfig.label || ''}
          onChange={(e) => setConfig({ ...config, label: e.target.value })}
          margin="normal"
        />
        <FormControl fullWidth margin="normal">
          <InputLabel>Target</InputLabel>
          <Select
            value={dropdownConfig.target || 'register'}
            onChange={(e) => setConfig({ ...config, target: e.target.value as DataSource })}
            label="Target"
          >
            <MenuItem value="register">Register</MenuItem>
            <MenuItem value="parameter">Parameter</MenuItem>
          </Select>
        </FormControl>
        {renderAddressSelector(
          dropdownConfig.target || 'register',
          dropdownConfig.address,
          (address) => setConfig({ ...config, address }),
          `${dropdownConfig.target === 'parameter' ? 'Parameter' : 'Register'} Address`
        )}

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle2">Options</Typography>
          <Button startIcon={<AddIcon />} onClick={addOption} size="small">
            Add Option
          </Button>
        </Box>

        {options.map((option, index) => (
          <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              label="Label"
              value={option.label}
              onChange={(e) => updateOption(index, 'label', e.target.value)}
              size="small"
              sx={{ flex: 1 }}
            />
            <TextField
              label="Value"
              type="number"
              value={option.value}
              onChange={(e) => updateOption(index, 'value', parseInt(e.target.value))}
              size="small"
              sx={{ width: 100 }}
            />
            <IconButton onClick={() => removeOption(index)} size="small" color="error">
              <DeleteIcon />
            </IconButton>
          </Box>
        ))}

        <FormControlLabel
          control={
            <Switch
              checked={dropdownConfig.confirmationRequired || false}
              onChange={(e) => setConfig({ ...config, confirmationRequired: e.target.checked })}
            />
          }
          label="Require Confirmation"
          sx={{ mt: 2 }}
        />
      </>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{mode === 'add' ? 'Add Widget' : 'Edit Widget'}</DialogTitle>
      <DialogContent>
        {mode === 'add' && (
          <FormControl fullWidth margin="normal">
            <InputLabel>Widget Type</InputLabel>
            <Select
              value={widgetType}
              onChange={(e) => {
                const newType = e.target.value as WidgetType;
                setWidgetType(newType);
                resetConfig(newType);
              }}
              label="Widget Type"
            >
              <MenuItem value="button">Button</MenuItem>
              <MenuItem value="valueRead">Value Read</MenuItem>
              <MenuItem value="valueWrite">Value Write</MenuItem>
              <MenuItem value="miniPlot">Mini Plot</MenuItem>
              <MenuItem value="dropdown">Dropdown</MenuItem>
            </Select>
          </FormControl>
        )}

        {renderConfigFields()}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          {mode === 'add' ? 'Add' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
