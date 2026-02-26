import type { DashboardLayout, DashboardWidget, AlarmRule } from '../types/dashboard';
import type { SysCommand } from '../types/settings';

const CNC_TAB_ID = 'cnc-demo-tab';
const CNC_MONITORING_TAB_ID = 'cnc-monitoring-tab';

// ──────────────────────────────────────────────────────────────
// Grid layout (12 cols × 11 rows):
//
//        0    1    2    3    4    5    6    7    8    9   10   11
//   0:  [-- StateLED --][---- SystemInfo ------][RstES][ E-STOP ]
//   1:  [- ClearErrs --][---- SystemInfo ------][HomAl][ E-STOP ]
//   2:  [- X Encoder --][- Y Encoder --][- Z Encoder --][HX][HY][HZ]
//   3:  [- X Encoder --][- Y Encoder --][- Z Encoder --][         ]
//   4:  [-- XY Jog ----][Z+   ][-- Gauge RPM -][SpLED][EnSpdl   ]
//   5:  [-- XY Jog ----][Z-   ][-- Gauge RPM -][SpSpd][DiSpdl   ]
//   6:  [-- XY Jog ----][JgDst][-- Gauge RPM -][SpSpd][         ]
//   7:  [      ][JgDst][------- Spindle Load Bar --------------- ]
//   8:  [-------- MiniPlot --------][MtX ][eX][dX][ All On ]
//   9:  [-------- MiniPlot --------][MtY ][eY][dY][ AllOff ]
//  10:  [-------- MiniPlot --------][MtZ ][eZ][dZ][         ]
// ──────────────────────────────────────────────────────────────

const CNC_WIDGETS: DashboardWidget[] = [
  // ── ZONE A: Status + Emergency (rows 0-1) ──────────────────

  // 0 — Machine State LED
  {
    id: 'modern-cnc-0',
    type: 'stateLED',
    config: {
      label: 'Machine State',
      source: 'register',
      address: 4,
      refreshInterval: 100,
      states: [
        { value: 0, label: 'IDLE', color: '#6B7280' },
        { value: 1, label: 'HOMING', color: '#FACC15' },
        { value: 2, label: 'READY', color: '#4ADE80' },
        { value: 3, label: 'RUNNING', color: '#00F2FF' },
        { value: 4, label: 'PAUSED', color: '#FACC15' },
        { value: 5, label: 'ERROR', color: '#FF3B30' },
        { value: 6, label: 'E-STOP', color: '#FF3B30' },
      ],
      showLabel: true,
      pulseAnimation: true,
      pulseStates: [1, 3],
      fontSize: 1.1,
    },
    layout: { w: 3, h: 1, x: 0, y: 0, i: 'modern-cnc-0', moved: false, static: false },
  },

  // 1 — System Status (Uptime / Packets / Errors)
  {
    id: 'modern-cnc-1',
    type: 'systemInfo',
    config: {
      label: 'System Status',
      items: [
        { label: 'Uptime', source: 'register', address: 3, format: 'time', color: '#00F2FF' },
        { label: 'Packets', source: 'register', address: 0, format: 'decimal', color: '#4ADE80' },
        { label: 'Errors', source: 'register', address: 1, format: 'decimal', color: '#FF3B30' },
      ],
      refreshInterval: 1000,
      layout: 'horizontal',
      compact: true,
      valueFontSize: 1,
    },
    layout: { w: 5, h: 2, x: 3, y: 0, i: 'modern-cnc-1', moved: false, static: false },
  },

  // 2 — Reset E-Stop
  {
    id: 'modern-cnc-2',
    type: 'button',
    config: { label: 'Reset E-Stop', target: 'sysCommand', address: 215, valueToWrite: 0, color: '#FACC15', icon: 'RestartAlt', fontSize: 0.7 },
    layout: { w: 2, h: 1, x: 8, y: 0, i: 'modern-cnc-2', moved: false, static: false },
  },

  // 3 — E-STOP (prominent)
  {
    id: 'modern-cnc-3',
    type: 'button',
    config: {
      label: 'E-STOP',
      target: 'sysCommand',
      address: 214,
      valueToWrite: 0,
      color: '#FF3B30',
      confirmationRequired: true,
      fontSize: 1.3,
    },
    layout: { w: 2, h: 2, x: 10, y: 0, i: 'modern-cnc-3', moved: false, static: false },
  },

  // 4 — Clear Errors
  {
    id: 'modern-cnc-4',
    type: 'button',
    config: { label: 'Clear Errors', target: 'sysCommand', address: 216, valueToWrite: 0, color: '#6B7280', icon: 'RestartAlt', fontSize: 0.7 },
    layout: { w: 3, h: 1, x: 0, y: 1, i: 'modern-cnc-4', moved: false, static: false },
  },

  // 5 — Home All Axes
  {
    id: 'modern-cnc-5',
    type: 'button',
    config: { label: 'Home All', target: 'sysCommand', address: 210, valueToWrite: 0, color: '#2196F3', icon: 'Home', fontSize: 0.7 },
    layout: { w: 2, h: 1, x: 8, y: 1, i: 'modern-cnc-5', moved: false, static: false },
  },

  // ── ZONE B: Position Displays + Homing (rows 2-3) ─────────

  // 6 — X Position Encoder
  {
    id: 'modern-cnc-6',
    type: 'encoderDisplay',
    config: {
      label: 'X Position', source: 'register', address: 5, refreshInterval: 50,
      conversionSource: 'constant', conversionFactor: 1000,
      primaryUnit: 'mm', secondaryUnit: 'steps', showRawValue: true, decimals: 3,
      color: '#00F2FF', valueFontSize: 1.8,
    },
    layout: { w: 3, h: 2, x: 0, y: 2, i: 'modern-cnc-6', moved: false, static: false },
  },

  // 7 — Y Position Encoder
  {
    id: 'modern-cnc-7',
    type: 'encoderDisplay',
    config: {
      label: 'Y Position', source: 'register', address: 6, refreshInterval: 50,
      conversionSource: 'constant', conversionFactor: 1000,
      primaryUnit: 'mm', secondaryUnit: 'steps', showRawValue: true, decimals: 3,
      color: '#4ADE80', valueFontSize: 1.8,
    },
    layout: { w: 3, h: 2, x: 3, y: 2, i: 'modern-cnc-7', moved: false, static: false },
  },

  // 8 — Z Position Encoder
  {
    id: 'modern-cnc-8',
    type: 'encoderDisplay',
    config: {
      label: 'Z Position', source: 'register', address: 7, refreshInterval: 50,
      conversionSource: 'constant', conversionFactor: 1000,
      primaryUnit: 'mm', secondaryUnit: 'steps', showRawValue: true, decimals: 3,
      color: '#FF8C42', valueFontSize: 1.8,
    },
    layout: { w: 3, h: 2, x: 6, y: 2, i: 'modern-cnc-8', moved: false, static: false },
  },

  // 9 — Home X (icon-only, color-coded)
  {
    id: 'modern-cnc-9',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 211, valueToWrite: 0, color: '#00F2FF', icon: 'Home' },
    layout: { w: 1, h: 1, x: 9, y: 2, i: 'modern-cnc-9', moved: false, static: false },
  },

  // 10 — Home Y (icon-only, color-coded)
  {
    id: 'modern-cnc-10',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 212, valueToWrite: 0, color: '#4ADE80', icon: 'Home' },
    layout: { w: 1, h: 1, x: 10, y: 2, i: 'modern-cnc-10', moved: false, static: false },
  },

  // 11 — Home Z (icon-only, color-coded)
  {
    id: 'modern-cnc-11',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 213, valueToWrite: 0, color: '#FF8C42', icon: 'Home' },
    layout: { w: 1, h: 1, x: 11, y: 2, i: 'modern-cnc-11', moved: false, static: false },
  },

  // ── ZONE C: Jogging + Spindle (rows 4-7) ──────────────────

  // 12 — XY Jog Directional Control
  {
    id: 'modern-cnc-12',
    type: 'directionalControl',
    config: {
      label: 'XY Jog Control', layout: '4way',
      directions: [
        { direction: 'up', command: 222 },
        { direction: 'down', command: 223 },
        { direction: 'left', command: 221 },
        { direction: 'right', command: 220 },
      ],
      buttonSize: 40, color: '#00F2FF',
    },
    layout: { w: 3, h: 3, x: 0, y: 4, i: 'modern-cnc-12', moved: false, static: false },
  },

  // 13 — Z+ Jog
  {
    id: 'modern-cnc-13',
    type: 'button',
    config: { label: 'Z+', target: 'sysCommand', address: 224, valueToWrite: 0, color: '#FF8C42', icon: 'ArrowUpward', fontSize: 1.1 },
    layout: { w: 2, h: 1, x: 3, y: 4, i: 'modern-cnc-13', moved: false, static: false },
  },

  // 14 — Z- Jog
  {
    id: 'modern-cnc-14',
    type: 'button',
    config: { label: 'Z-', target: 'sysCommand', address: 225, valueToWrite: 0, color: '#FF8C42', icon: 'ArrowDownward', fontSize: 1.1 },
    layout: { w: 2, h: 1, x: 3, y: 5, i: 'modern-cnc-14', moved: false, static: false },
  },

  // 15 — Jog Distance Selector
  {
    id: 'modern-cnc-15',
    type: 'dropdown',
    config: {
      label: 'Jog Distance',
      target: 'register',
      address: 18,
      options: [
        { label: '1 step', value: 1 },
        { label: '10 steps', value: 10 },
        { label: '50 steps', value: 50 },
        { label: '100 steps', value: 100 },
        { label: '500 steps', value: 500 },
      ],
    },
    layout: { w: 2, h: 2, x: 3, y: 6, i: 'modern-cnc-15', moved: false, static: false },
  },

  // 16 — Spindle RPM Gauge
  {
    id: 'modern-cnc-16',
    type: 'gauge',
    config: {
      label: 'Spindle RPM', source: 'register', address: 8, refreshInterval: 100,
      min: 0, max: 10000, unit: 'RPM', decimals: 0, showValue: true, valueFontSize: 1.8,
      colorRanges: [
        { from: 0, to: 3000, color: '#4ADE80' },
        { from: 3000, to: 7000, color: '#FACC15' },
        { from: 7000, to: 10000, color: '#FF3B30' },
      ],
    },
    layout: { w: 3, h: 3, x: 5, y: 4, i: 'modern-cnc-16', moved: false, static: false },
  },

  // 17 — Spindle Status LED
  {
    id: 'modern-cnc-17',
    type: 'ledIndicator',
    config: {
      label: 'Spindle', source: 'register', address: 13, refreshInterval: 100,
      onValue: 1, offValue: 0, onColor: '#00F2FF', offColor: '#6B7280',
      onLabel: 'RUNNING', offLabel: 'STOPPED', pulseWhenOn: true,
    },
    layout: { w: 2, h: 1, x: 8, y: 4, i: 'modern-cnc-17', moved: false, static: false },
  },

  // 18 — Enable Spindle (icon-only)
  {
    id: 'modern-cnc-18',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 208, valueToWrite: 0, color: '#4ADE80', icon: 'Power' },
    layout: { w: 2, h: 1, x: 10, y: 4, i: 'modern-cnc-18', moved: false, static: false },
  },

  // 19 — Disable Spindle (icon-only)
  {
    id: 'modern-cnc-19',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 209, valueToWrite: 0, color: '#FF3B30', icon: 'PowerOff' },
    layout: { w: 2, h: 1, x: 10, y: 5, i: 'modern-cnc-19', moved: false, static: false },
  },

  // 20 — Spindle Speed Setpoint (NEW)
  {
    id: 'modern-cnc-20',
    type: 'valueWrite',
    config: {
      label: 'Spindle Speed',
      target: 'register',
      address: 17,
      format: 'decimal',
      min: 0,
      max: 10000,
      step: 100,
    },
    layout: { w: 2, h: 2, x: 8, y: 5, i: 'modern-cnc-20', moved: false, static: false },
  },

  // 21 — Spindle Load Progress Bar
  {
    id: 'modern-cnc-21',
    type: 'progressBar',
    config: {
      label: 'Spindle Load', source: 'register', address: 9, refreshInterval: 100,
      min: 0, max: 100, unit: '%', orientation: 'horizontal', showPercentage: true, showValue: true,
      colorRanges: [
        { from: 0, to: 50, color: '#4ADE80' },
        { from: 50, to: 80, color: '#FACC15' },
        { from: 80, to: 100, color: '#FF3B30' },
      ],
    },
    layout: { w: 7, h: 1, x: 5, y: 7, i: 'modern-cnc-21', moved: false, static: false },
  },

  // ── ZONE D: MiniPlot + Motor Status (rows 8-10) ───────────

  // 22 — Spindle RPM Trend (NEW)
  {
    id: 'modern-cnc-22',
    type: 'miniPlot',
    config: {
      label: 'Spindle RPM Trend',
      source: 'register',
      address: 8,
      timeWindow: 60,
      pollInterval: 500,
      showLegend: false,
      color: '#00F2FF',
    },
    layout: { w: 6, h: 3, x: 0, y: 8, i: 'modern-cnc-22', moved: false, static: false },
  },

  // 23 — Motor X LED
  {
    id: 'modern-cnc-23',
    type: 'ledIndicator',
    config: { label: 'Motor X', source: 'register', address: 10, refreshInterval: 100, onValue: 1, offValue: 0, onColor: '#00F2FF', offColor: '#6B7280', onLabel: 'ON', offLabel: 'OFF', pulseWhenOn: false },
    layout: { w: 2, h: 1, x: 6, y: 8, i: 'modern-cnc-23', moved: false, static: false },
  },

  // 24 — Enable Motor X
  {
    id: 'modern-cnc-24',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 202, valueToWrite: 0, color: '#4ADE80', icon: 'Power' },
    layout: { w: 1, h: 1, x: 8, y: 8, i: 'modern-cnc-24', moved: false, static: false },
  },

  // 25 — Disable Motor X
  {
    id: 'modern-cnc-25',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 205, valueToWrite: 0, color: '#FF9800', icon: 'PowerOff' },
    layout: { w: 1, h: 1, x: 9, y: 8, i: 'modern-cnc-25', moved: false, static: false },
  },

  // 26 — Motor Y LED
  {
    id: 'modern-cnc-26',
    type: 'ledIndicator',
    config: { label: 'Motor Y', source: 'register', address: 11, refreshInterval: 100, onValue: 1, offValue: 0, onColor: '#4ADE80', offColor: '#6B7280', onLabel: 'ON', offLabel: 'OFF', pulseWhenOn: false },
    layout: { w: 2, h: 1, x: 6, y: 9, i: 'modern-cnc-26', moved: false, static: false },
  },

  // 27 — Enable Motor Y
  {
    id: 'modern-cnc-27',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 203, valueToWrite: 0, color: '#4ADE80', icon: 'Power' },
    layout: { w: 1, h: 1, x: 8, y: 9, i: 'modern-cnc-27', moved: false, static: false },
  },

  // 28 — Disable Motor Y
  {
    id: 'modern-cnc-28',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 206, valueToWrite: 0, color: '#FF9800', icon: 'PowerOff' },
    layout: { w: 1, h: 1, x: 9, y: 9, i: 'modern-cnc-28', moved: false, static: false },
  },

  // 29 — Motor Z LED
  {
    id: 'modern-cnc-29',
    type: 'ledIndicator',
    config: { label: 'Motor Z', source: 'register', address: 12, refreshInterval: 100, onValue: 1, offValue: 0, onColor: '#FF8C42', offColor: '#6B7280', onLabel: 'ON', offLabel: 'OFF', pulseWhenOn: false },
    layout: { w: 2, h: 1, x: 6, y: 10, i: 'modern-cnc-29', moved: false, static: false },
  },

  // 30 — Enable Motor Z (NEW — was missing)
  {
    id: 'modern-cnc-30',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 204, valueToWrite: 0, color: '#4ADE80', icon: 'Power' },
    layout: { w: 1, h: 1, x: 8, y: 10, i: 'modern-cnc-30', moved: false, static: false },
  },

  // 31 — Disable Motor Z (NEW — was missing)
  {
    id: 'modern-cnc-31',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 207, valueToWrite: 0, color: '#FF9800', icon: 'PowerOff' },
    layout: { w: 1, h: 1, x: 9, y: 10, i: 'modern-cnc-31', moved: false, static: false },
  },

  // 32 — Enable All Motors
  {
    id: 'modern-cnc-32',
    type: 'button',
    config: { label: 'All On', target: 'sysCommand', address: 200, valueToWrite: 0, color: '#4ADE80', icon: 'Power', fontSize: 0.7 },
    layout: { w: 2, h: 1, x: 10, y: 8, i: 'modern-cnc-32', moved: false, static: false },
  },

  // 33 — Disable All Motors
  {
    id: 'modern-cnc-33',
    type: 'button',
    config: { label: 'All Off', target: 'sysCommand', address: 201, valueToWrite: 0, color: '#FF9800', icon: 'PowerOff', fontSize: 0.7 },
    layout: { w: 2, h: 1, x: 10, y: 9, i: 'modern-cnc-33', moved: false, static: false },
  },
];

// ──────────────────────────────────────────────────────────────
// Tab 2: Monitoring — Data Table, Alarm List, Status Matrix
//
// Grid layout (12 cols × 8 rows):
//
//        0    1    2    3    4    5    6    7    8    9   10   11
//   0:  [--------- Data Table ---------][------- Alarm List -------]
//   1:  [--------- Data Table ---------][------- Alarm List -------]
//   2:  [--------- Data Table ---------][------- Alarm List -------]
//   3:  [--------- Data Table ---------][------- Alarm List -------]
//   4:  [--------- Data Table ---------][------- Alarm List -------]
//   5:  [-- Status Matrix ---][-------- Axis Control ---------------]
//   6:  [-- Status Matrix ---][-------- Axis Control ---------------]
//   7:  [-- Status Matrix ---][-------- Axis Control ---------------]
//   8:  [                    ][-------- Axis Control ---------------]
// ──────────────────────────────────────────────────────────────

const CNC_MONITORING_WIDGETS: DashboardWidget[] = [
  // 0 — Axis Positions & Spindle Data Table
  {
    id: 'cnc-mon-0',
    type: 'dataTable',
    config: {
      label: 'Live Readings',
      items: [
        { label: 'X Position', source: 'register' as const, address: 5, format: 'decimal' as const, unit: 'steps' },
        { label: 'Y Position', source: 'register' as const, address: 6, format: 'decimal' as const, unit: 'steps' },
        { label: 'Z Position', source: 'register' as const, address: 7, format: 'decimal' as const, unit: 'steps' },
        { label: 'Spindle RPM', source: 'register' as const, address: 8, format: 'decimal' as const, unit: 'RPM' },
        { label: 'Spindle Load', source: 'register' as const, address: 9, format: 'decimal' as const, unit: '%' },
        { label: 'Uptime', source: 'register' as const, address: 3, format: 'decimal' as const, unit: 's' },
        { label: 'Packets', source: 'register' as const, address: 0, format: 'decimal' as const },
        { label: 'Errors', source: 'register' as const, address: 1, format: 'decimal' as const },
      ],
      refreshInterval: 200,
      compact: false,
      striped: true,
      valueFontSize: 0.75,
    },
    layout: { w: 6, h: 6, x: 0, y: 0, i: 'cnc-mon-0', moved: false, static: false },
  },

  // 1 — CNC Alarm List
  {
    id: 'cnc-mon-1',
    type: 'alarmList',
    config: {
      label: 'CNC Alarms',
      refreshInterval: 100,
      alarms: [
        {
          label: 'Machine Error',
          source: 'register' as const,
          address: 4,
          type: 'state' as const,
          triggerValues: [5],
          severity: 'critical' as const,
        },
        {
          label: 'E-Stop Active',
          source: 'register' as const,
          address: 4,
          type: 'state' as const,
          triggerValues: [6],
          severity: 'critical' as const,
        },
        {
          label: 'Spindle Overload',
          source: 'register' as const,
          address: 9,
          type: 'threshold' as const,
          max: 85,
          severity: 'critical' as const,
        },
        {
          label: 'Spindle Load High',
          source: 'register' as const,
          address: 9,
          type: 'threshold' as const,
          max: 70,
          severity: 'warning' as const,
        },
        {
          label: 'Spindle Overspeed',
          source: 'register' as const,
          address: 8,
          type: 'threshold' as const,
          max: 9000,
          severity: 'warning' as const,
        },
        {
          label: 'Comm Errors',
          source: 'register' as const,
          address: 1,
          type: 'threshold' as const,
          max: 10,
          severity: 'warning' as const,
        },
      ] satisfies AlarmRule[],
      showInactive: true,
      compact: false,
    },
    layout: { w: 6, h: 6, x: 6, y: 0, i: 'cnc-mon-1', moved: false, static: false },
  },

  // 2 — I/O Status Matrix
  {
    id: 'cnc-mon-2',
    type: 'statusMatrix',
    config: {
      label: 'I/O Status',
      refreshInterval: 100,
      items: [
        { label: 'Motor X', source: 'register' as const, address: 10, onValue: 1, onColor: '#00F2FF', offColor: '#6B7280' },
        { label: 'Motor Y', source: 'register' as const, address: 11, onValue: 1, onColor: '#4ADE80', offColor: '#6B7280' },
        { label: 'Motor Z', source: 'register' as const, address: 12, onValue: 1, onColor: '#FF8C42', offColor: '#6B7280' },
        { label: 'Spindle', source: 'register' as const, address: 13, onValue: 1, onColor: '#00F2FF', offColor: '#6B7280' },
      ],
      showLabels: true,
      dotSize: 14,
      compact: false,
    },
    layout: { w: 4, h: 3, x: 0, y: 6, i: 'cnc-mon-2', moved: false, static: false },
  },

  // 3 — Axis Control Table (read-only positions + writable setpoints)
  {
    id: 'cnc-mon-3',
    type: 'dataTable',
    config: {
      label: 'Axis Control',
      items: [
        { label: 'X Position', source: 'register' as const, address: 5, unit: 'steps' },
        { label: 'X Setpoint', source: 'register' as const, address: 14, unit: 'steps' },
        { label: 'Y Position', source: 'register' as const, address: 6, unit: 'steps' },
        { label: 'Y Setpoint', source: 'register' as const, address: 15, unit: 'steps' },
        { label: 'Z Position', source: 'register' as const, address: 7, unit: 'steps' },
        { label: 'Z Setpoint', source: 'register' as const, address: 16, unit: 'steps' },
        { label: 'Spindle RPM', source: 'register' as const, address: 8, unit: 'RPM' },
        { label: 'Spindle Target', source: 'register' as const, address: 17, unit: 'RPM', min: 0, max: 10000, step: 100 },
        { label: 'Jog Distance', source: 'register' as const, address: 18, unit: 'steps', min: 1, max: 1000, step: 10 },
      ],
      refreshInterval: 200,
      compact: false,
      confirmWrites: false,
      valueFontSize: 0.75,
      striped: true,
    },
    layout: { w: 8, h: 4, x: 4, y: 6, i: 'cnc-mon-3', moved: false, static: false },
  },
];

/** CNC system commands for the emulator */
export const CNC_SYS_COMMANDS: SysCommand[] = [
  { code: 200, name: 'ENABLE_ALL_MOTORS', description: 'Enable all motor axes' },
  { code: 201, name: 'DISABLE_ALL_MOTORS', description: 'Disable all motor axes' },
  { code: 202, name: 'ENABLE_MOTOR_X', description: 'Enable X-axis motor' },
  { code: 203, name: 'ENABLE_MOTOR_Y', description: 'Enable Y-axis motor' },
  { code: 204, name: 'ENABLE_MOTOR_Z', description: 'Enable Z-axis motor' },
  { code: 205, name: 'DISABLE_MOTOR_X', description: 'Disable X-axis motor' },
  { code: 206, name: 'DISABLE_MOTOR_Y', description: 'Disable Y-axis motor' },
  { code: 207, name: 'DISABLE_MOTOR_Z', description: 'Disable Z-axis motor' },
  { code: 208, name: 'ENABLE_SPINDLE', description: 'Enable spindle motor' },
  { code: 209, name: 'DISABLE_SPINDLE', description: 'Disable spindle motor' },
  { code: 210, name: 'HOME_ALL', description: 'Home all axes' },
  { code: 211, name: 'HOME_X', description: 'Home X-axis' },
  { code: 212, name: 'HOME_Y', description: 'Home Y-axis' },
  { code: 213, name: 'HOME_Z', description: 'Home Z-axis' },
  { code: 214, name: 'E_STOP', description: 'Emergency stop' },
  { code: 215, name: 'RESET_E_STOP', description: 'Reset emergency stop' },
  { code: 216, name: 'CLEAR_ERRORS', description: 'Clear error state' },
  { code: 220, name: 'JOG_X_POSITIVE', description: 'Jog X-axis positive' },
  { code: 221, name: 'JOG_X_NEGATIVE', description: 'Jog X-axis negative' },
  { code: 222, name: 'JOG_Y_POSITIVE', description: 'Jog Y-axis positive' },
  { code: 223, name: 'JOG_Y_NEGATIVE', description: 'Jog Y-axis negative' },
  { code: 224, name: 'JOG_Z_POSITIVE', description: 'Jog Z-axis positive' },
  { code: 225, name: 'JOG_Z_NEGATIVE', description: 'Jog Z-axis negative' },
];

/** Creates the CNC demo dashboard layout */
export function createModernCNCDashboard(): DashboardLayout {
  return {
    tabs: [
      {
        id: CNC_TAB_ID,
        name: 'CNC Control',
        widgets: CNC_WIDGETS,
      },
      {
        id: CNC_MONITORING_TAB_ID,
        name: 'Monitoring',
        widgets: CNC_MONITORING_WIDGETS,
      },
    ],
    activeTabId: CNC_TAB_ID,
  };
}
