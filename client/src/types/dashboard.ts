import { Layout } from 'react-grid-layout';

// Widget types
export type WidgetType =
  | 'button'
  | 'valueRead'
  | 'valueWrite'
  | 'miniPlot'
  | 'dropdown'
  | 'stateLED'
  | 'gauge'
  | 'progressBar'
  | 'encoderDisplay'
  | 'ledIndicator'
  | 'directionalControl'
  | 'systemInfo'
  | 'dataTable'
  | 'alarmList'
  | 'statusMatrix';

// Data source types
export type DataSource = 'register' | 'parameter' | 'sysCommand';

// Display format for values
export type DisplayFormat = 'decimal' | 'hex' | 'binary';

// Button widget configuration
export interface ButtonWidgetConfig {
  label: string;
  target: DataSource;
  address: number; // For register/parameter: address; For sysCommand: command code
  valueToWrite: number; // For register/parameter: value; For sysCommand: command value
  color?: string;
  icon?: string; // Optional icon name
  confirmationRequired?: boolean;
  fontSize?: number; // Font size in rem (e.g., 0.7 for compact, 1.3 for emphasis)
}

// Value read widget configuration
export interface ValueReadWidgetConfig {
  label: string;
  source: DataSource;
  address: number;
  displayFormat: DisplayFormat;
  refreshInterval: number; // in milliseconds
  showTimestamp?: boolean;
  unit?: string;
  valueFontSize?: number; // Main value display size in rem
}

// Value write widget configuration
export interface ValueWriteWidgetConfig {
  label: string;
  target: DataSource;
  address: number;
  format: 'decimal' | 'hex' | 'binary';
  min?: number;
  max?: number;
  step?: number;
  confirmationRequired?: boolean;
  valueFontSize?: number; // Input text size in rem
}

// Mini plot widget configuration
export interface MiniPlotWidgetConfig {
  label: string;
  source: DataSource;
  address: number;
  timeWindow: number; // in seconds
  pollInterval: number; // in milliseconds
  showLegend?: boolean;
  color?: string;
}

// Dropdown widget configuration
export interface DropdownWidgetConfig {
  label: string;
  target: DataSource;
  address: number;
  options: Array<{
    label: string;
    value: number;
  }>;
  confirmationRequired?: boolean;
  valueFontSize?: number; // Select text size in rem
}

// State LED widget configuration - shows register value as colored LED with state labels
export interface StateLEDWidgetConfig {
  label: string;
  source: DataSource;
  address: number;
  refreshInterval: number; // in milliseconds
  states: Array<{
    value: number;
    label: string;
    color: string; // hex color
  }>;
  showLabel?: boolean; // Show state label next to LED
  pulseAnimation?: boolean; // Pulse effect for specific states
  pulseStates?: number[]; // Which state values should pulse
  fontSize?: number; // State label text size in rem
}

// Gauge widget configuration - circular gauge for numeric values
export interface GaugeWidgetConfig {
  label: string;
  source: DataSource;
  address: number;
  refreshInterval: number; // in milliseconds
  min: number;
  max: number;
  unit?: string;
  decimals?: number;
  colorRanges?: Array<{
    from: number;
    to: number;
    color: string;
  }>;
  showValue?: boolean;
  valueFontSize?: number; // Value display size inside the gauge in rem
}

// Progress bar widget configuration - horizontal/vertical progress indicator
export interface ProgressBarWidgetConfig {
  label: string;
  source: DataSource;
  address: number;
  refreshInterval: number; // in milliseconds
  min: number;
  max: number;
  unit?: string;
  orientation?: 'horizontal' | 'vertical';
  colorRanges?: Array<{
    from: number;
    to: number;
    color: string;
  }>;
  showPercentage?: boolean;
  showValue?: boolean;
  valueFontSize?: number; // Value/percentage text size in rem
}

// Encoder display widget configuration - numeric value with unit conversion
export interface EncoderDisplayWidgetConfig {
  label: string;
  source: DataSource;
  address: number;
  refreshInterval: number; // in milliseconds
  conversionFactor?: number; // Multiplier to convert raw value (e.g., steps_per_mm)
  conversionSource?: 'parameter' | 'constant'; // Read from parameter or use constant
  conversionAddress?: number; // Parameter address for conversion factor
  primaryUnit?: string; // Unit for converted value (e.g., "mm")
  secondaryUnit?: string; // Unit for raw value (e.g., "steps")
  showRawValue?: boolean; // Show both converted and raw values
  decimals?: number;
  color?: string;
  valueFontSize?: number; // Primary converted value size in rem
}

// LED indicator widget configuration - simple on/off LED
export interface LEDIndicatorWidgetConfig {
  label: string;
  source: DataSource;
  address: number;
  refreshInterval: number; // in milliseconds
  onValue?: number; // Value considered "on" (default: 1)
  offValue?: number; // Value considered "off" (default: 0)
  onColor?: string; // Color when on
  offColor?: string; // Color when off
  onLabel?: string; // Label when on
  offLabel?: string; // Label when off
  pulseWhenOn?: boolean; // Pulse animation when on
  fontSize?: number; // Status label text size in rem
}

// Directional control widget configuration - multi-directional control pad
export interface DirectionalControlWidgetConfig {
  label: string;
  directions: Array<{
    direction: 'up' | 'down' | 'left' | 'right' | 'upLeft' | 'upRight' | 'downLeft' | 'downRight';
    command: number; // SysCommand code
    label?: string;
    icon?: string;
  }>;
  layout?: '4way' | '8way'; // 4-way (up/down/left/right) or 8-way (includes diagonals)
  buttonSize?: number; // Size of buttons in pixels
  color?: string;
  confirmationRequired?: boolean;
}

// System info widget configuration - displays multiple registers in compact format
export interface SystemInfoWidgetConfig {
  label: string;
  items: Array<{
    label: string;
    source: DataSource;
    address: number;
    format?: 'decimal' | 'hex' | 'binary' | 'time'; // 'time' formats as HH:MM:SS
    unit?: string;
    color?: string;
  }>;
  refreshInterval: number; // in milliseconds
  layout?: 'vertical' | 'horizontal' | 'grid';
  valueFontSize?: number; // Item value text size in rem
  compact?: boolean; // Reduce internal padding for dense layouts
}

// Data table widget configuration - tabular display of multiple register/parameter values
export interface DataTableWidgetConfig {
  label: string;
  items: Array<{
    label: string;
    source: DataSource;
    address: number;
    format?: 'decimal' | 'hex' | 'binary';
    unit?: string;
    decimals?: number;
    min?: number; // Validation for writable rows
    max?: number;
    step?: number;
  }>;
  refreshInterval: number; // in milliseconds
  compact?: boolean; // Reduce padding for dense layouts
  valueFontSize?: number; // Value text size in rem
  striped?: boolean; // Alternating row backgrounds
  confirmWrites?: boolean; // Show confirmation dialog before writing
}

// Alarm rule for alarm list widget
export interface AlarmRule {
  label: string;
  source: DataSource;
  address: number;
  type: 'threshold' | 'state';
  // Threshold mode: value outside [min, max] triggers alarm
  min?: number;
  max?: number;
  // State mode: specific values that trigger the alarm
  triggerValues?: number[];
  severity: 'warning' | 'critical';
}

// Alarm list widget configuration - monitors addresses and shows active alarms
export interface AlarmListWidgetConfig {
  label: string;
  refreshInterval: number; // in milliseconds
  alarms: AlarmRule[];
  showInactive?: boolean; // Show all alarms including OK ones
  compact?: boolean;
}

// Status matrix widget configuration - grid of LED status dots
export interface StatusMatrixWidgetConfig {
  label: string;
  refreshInterval: number; // in milliseconds
  items: Array<{
    label: string;
    source: DataSource;
    address: number;
    onValue?: number; // Value considered "on" (default: 1)
    onColor?: string; // Color when on (default: #4ADE80)
    offColor?: string; // Color when off (default: #6B7280)
  }>;
  showLabels?: boolean; // Show text labels under each LED (default: true)
  dotSize?: number; // LED dot size in pixels (default: 12)
  compact?: boolean;
}

// Union type for all widget configurations
export type WidgetConfig =
  | ButtonWidgetConfig
  | ValueReadWidgetConfig
  | ValueWriteWidgetConfig
  | MiniPlotWidgetConfig
  | DropdownWidgetConfig
  | StateLEDWidgetConfig
  | GaugeWidgetConfig
  | ProgressBarWidgetConfig
  | EncoderDisplayWidgetConfig
  | LEDIndicatorWidgetConfig
  | DirectionalControlWidgetConfig
  | SystemInfoWidgetConfig
  | DataTableWidgetConfig
  | AlarmListWidgetConfig
  | StatusMatrixWidgetConfig;

// Widget instance
export interface DashboardWidget {
  id: string; // unique identifier
  type: WidgetType;
  config: WidgetConfig;
  layout: Layout; // from react-grid-layout
}

// Dashboard tab
export interface DashboardTab {
  id: string;
  name: string;
  widgets: DashboardWidget[];
}

// Dashboard layout for a profile
export interface DashboardLayout {
  tabs: DashboardTab[];
  activeTabId: string;
}

// Grid configuration
export interface GridConfig {
  cols: number;
  rowHeight: number;
  width: number;
}

// Default grid configuration
export const DEFAULT_GRID_CONFIG: GridConfig = {
  cols: 12,
  rowHeight: 60,
  width: 1200
};

// Default widget sizes (in grid units)
export const DEFAULT_WIDGET_SIZES: Record<WidgetType, { w: number; h: number; minW: number; minH: number }> = {
  button: { w: 2, h: 1, minW: 1, minH: 1 },
  valueRead: { w: 3, h: 2, minW: 2, minH: 1 },
  valueWrite: { w: 3, h: 2, minW: 2, minH: 1 },
  miniPlot: { w: 4, h: 3, minW: 3, minH: 2 },
  dropdown: { w: 3, h: 2, minW: 2, minH: 1 },
  stateLED: { w: 2, h: 1, minW: 2, minH: 1 },
  gauge: { w: 3, h: 3, minW: 2, minH: 2 },
  progressBar: { w: 4, h: 1, minW: 2, minH: 1 },
  encoderDisplay: { w: 3, h: 2, minW: 2, minH: 1 },
  ledIndicator: { w: 2, h: 1, minW: 1, minH: 1 },
  directionalControl: { w: 3, h: 3, minW: 2, minH: 2 },
  systemInfo: { w: 4, h: 3, minW: 3, minH: 2 },
  dataTable: { w: 5, h: 4, minW: 3, minH: 2 },
  alarmList: { w: 4, h: 4, minW: 3, minH: 2 },
  statusMatrix: { w: 4, h: 3, minW: 2, minH: 2 },
};

// Helper function to create empty dashboard
export function createEmptyDashboard(): DashboardLayout {
  return {
    tabs: [
      {
        id: 'tab-1',
        name: 'Dashboard 1',
        widgets: []
      }
    ],
    activeTabId: 'tab-1'
  };
}

// Helper function to create new tab
export function createNewTab(index: number): DashboardTab {
  return {
    id: `tab-${Date.now()}`,
    name: `Dashboard ${index}`,
    widgets: []
  };
}

// Helper function to generate unique widget ID
export function generateWidgetId(): string {
  return `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper function to find next available position in grid
export function findNextAvailablePosition(
  existingLayouts: Layout[],
  widgetSize: { w: number; h: number },
  gridCols: number
): { x: number; y: number } {
  // Try to find an empty spot row by row
  let y = 0;
  let x = 0;

  while (true) {
    // Check if this position is available
    const isAvailable = !existingLayouts.some(layout => {
      return (
        x < layout.x + layout.w &&
        x + widgetSize.w > layout.x &&
        y < layout.y + layout.h &&
        y + widgetSize.h > layout.y
      );
    });

    if (isAvailable) {
      return { x, y };
    }

    // Move to next position
    x += widgetSize.w;
    if (x + widgetSize.w > gridCols) {
      x = 0;
      y += 1;
    }
  }
}
