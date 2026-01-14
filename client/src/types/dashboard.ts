import { Layout } from 'react-grid-layout';

// Widget types
export type WidgetType = 'button' | 'valueRead' | 'valueWrite' | 'miniPlot' | 'dropdown';

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
}

// Value write widget configuration
export interface ValueWriteWidgetConfig {
  label: string;
  target: DataSource;
  address: number;
  inputType: 'number' | 'text';
  min?: number;
  max?: number;
  step?: number;
  confirmationRequired?: boolean;
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
}

// Union type for all widget configurations
export type WidgetConfig =
  | ButtonWidgetConfig
  | ValueReadWidgetConfig
  | ValueWriteWidgetConfig
  | MiniPlotWidgetConfig
  | DropdownWidgetConfig;

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
  dropdown: { w: 3, h: 2, minW: 2, minH: 1 }
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
