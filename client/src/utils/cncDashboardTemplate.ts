import type { DashboardLayout, DashboardWidget, AlarmRule } from '../types/dashboard';
import type { SysCommand, EntryMetadata } from '../types/settings';

const CNC_TAB_ID = 'cnc-demo-tab';
const CNC_MONITORING_TAB_ID = 'cnc-monitoring-tab';

/** Bump this when the template changes so existing stored layouts are regenerated. */
export const CNC_DASHBOARD_VERSION = 5;

// ──────────────────────────────────────────────────────────────
// Grid layout (12 cols × 11 rows):
//
//        0    1    2    3    4    5    6    7    8    9   10   11
//   0:  [──────── Machine Status container ──────────][E-STOP]
//   1:  [──────── Machine Status container ──────────][E-STOP]
//   2:  [──── Axis Positions container ───────────][Homing──]
//   3:  [──── Axis Positions container ───────────][Homing──]
//   4:  [─── Jog ──][──────── Spindle container ───────────]
//   5:  [─── Jog ──][──────── Spindle container ───────────]
//   6:  [─── Jog ──][──────── Spindle container ───────────]
//   7:  [─── Jog ──][──────── Spindle container ───────────]
//   8:  [── MiniPlot ───────][── Motors container ─────────]
//   9:  [── MiniPlot ───────][── Motors container ─────────]
//  10:  [── MiniPlot ───────][── Motors container ─────────]
// ──────────────────────────────────────────────────────────────

const CNC_WIDGETS: DashboardWidget[] = [

  // ── STANDALONE: E-STOP ──────────────────────────────────────
  {
    id: 'modern-cnc-3',
    type: 'button',
    config: {
      label: 'E-STOP',
      target: 'sysCommand',
      address: 14,
      valueToWrite: 0,
      color: '#FF3B30',
      confirmationRequired: true,
      fontSize: 1.3,
    },
    layout: { i: 'modern-cnc-3', x: 10, y: 0, w: 2, h: 2, minW: 1, minH: 1, moved: false, static: false },
  },

  // ── STANDALONE: Spindle RPM Trend ───────────────────────────
  {
    id: 'modern-cnc-22',
    type: 'miniPlot',
    config: {
      label: 'Spindle RPM Trend',
      source: 'register',
      address: 4,
      timeWindow: 60,
      pollInterval: 500,
      showLegend: false,
      color: '#00F2FF',
    },
    layout: { i: 'modern-cnc-22', x: 0, y: 8, w: 6, h: 3, minW: 3, minH: 2, moved: false, static: false },
  },

  // ── CONTAINER: Machine Status (rows 0-1, cols 0-9) ──────────
  //
  //   Internal 12 cols:
  //   Row 0: [MachineState (4)][SystemStatus (5)][ResetEStop (3)]
  //   Row 1: [ClearErrors (4)][SystemStatus    ][HomeAll    (3)]
  //
  {
    id: 'cnc-container-status',
    type: 'container',
    config: {
      backgroundColor: '#0f1628',
      padding: 6,
      spacing: 4,
      childWidgets: [
        {
          id: 'cnc-c-state',
          type: 'stateLED',
          config: {
            label: 'Machine State',
            source: 'register',
            address: 0,
            refreshInterval: 200,
            states: [
              { value: 0, label: 'IDLE',    color: '#6B7280' },
              { value: 1, label: 'HOMING',  color: '#FACC15' },
              { value: 2, label: 'READY',   color: '#4ADE80' },
              { value: 3, label: 'RUNNING', color: '#00F2FF' },
              { value: 4, label: 'PAUSED',  color: '#FACC15' },
              { value: 5, label: 'ERROR',   color: '#FF3B30' },
              { value: 6, label: 'E-STOP',  color: '#FF3B30' },
            ],
            showLabel: true,
            pulseAnimation: true,
            pulseStates: [1, 3],
            fontSize: 1.1,
          },
          layout: { i: 'cnc-c-state', x: 0, y: 0, w: 4, h: 1, minW: 2, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-sysinfo',
          type: 'systemInfo',
          config: {
            label: 'System Status',
            items: [
              { label: 'Uptime',  source: 'sysRegister', address: 3, format: 'time',    color: '#00F2FF' },
              { label: 'Packets', source: 'sysRegister', address: 0, format: 'decimal', color: '#4ADE80' },
              { label: 'Errors',  source: 'sysRegister', address: 1, format: 'decimal', color: '#FF3B30' },
            ],
            refreshInterval: 1000,
            layout: 'horizontal',
            compact: true,
            valueFontSize: 1,
          },
          layout: { i: 'cnc-c-sysinfo', x: 4, y: 0, w: 5, h: 2, minW: 3, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-reset-estop',
          type: 'button',
          config: { label: 'Reset E-Stop', target: 'sysCommand', address: 15, valueToWrite: 0, color: '#FACC15', icon: 'RestartAlt', fontSize: 0.7 },
          layout: { i: 'cnc-c-reset-estop', x: 9, y: 0, w: 3, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-clear-errors',
          type: 'button',
          config: { label: 'Clear Errors', target: 'sysCommand', address: 16, valueToWrite: 0, color: '#6B7280', icon: 'RestartAlt', fontSize: 0.7 },
          layout: { i: 'cnc-c-clear-errors', x: 0, y: 1, w: 4, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-home-all',
          type: 'button',
          config: { label: 'Home All', target: 'sysCommand', address: 10, valueToWrite: 0, color: '#2196F3', icon: 'Home', fontSize: 0.7 },
          layout: { i: 'cnc-c-home-all', x: 9, y: 1, w: 3, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
      ],
    },
    layout: { i: 'cnc-container-status', x: 0, y: 0, w: 10, h: 2, minW: 4, minH: 2, moved: false, static: false },
  },

  // ── CONTAINER: Axis Positions (rows 2-3, cols 0-8) ──────────
  //
  //   Internal 12 cols:
  //   [── X Position (4) ──][── Y Position (4) ──][── Z Position (4) ──]
  //
  {
    id: 'cnc-container-axes',
    type: 'container',
    config: {
      backgroundColor: '#0f1628',
      padding: 4,
      spacing: 4,
      childWidgets: [
        {
          id: 'cnc-c-xpos',
          type: 'encoderDisplay',
          config: {
            label: 'X Position', source: 'register', address: 1, refreshInterval: 200,
            conversionSource: 'constant', conversionFactor: 1000,
            primaryUnit: 'mm', secondaryUnit: 'steps', showRawValue: true, decimals: 3,
            color: '#00F2FF', valueFontSize: 1.8,
          },
          layout: { i: 'cnc-c-xpos', x: 0, y: 0, w: 4, h: 2, minW: 2, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-ypos',
          type: 'encoderDisplay',
          config: {
            label: 'Y Position', source: 'register', address: 2, refreshInterval: 200,
            conversionSource: 'constant', conversionFactor: 1000,
            primaryUnit: 'mm', secondaryUnit: 'steps', showRawValue: true, decimals: 3,
            color: '#4ADE80', valueFontSize: 1.8,
          },
          layout: { i: 'cnc-c-ypos', x: 4, y: 0, w: 4, h: 2, minW: 2, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-zpos',
          type: 'encoderDisplay',
          config: {
            label: 'Z Position', source: 'register', address: 3, refreshInterval: 200,
            conversionSource: 'constant', conversionFactor: 1000,
            primaryUnit: 'mm', secondaryUnit: 'steps', showRawValue: true, decimals: 3,
            color: '#FF8C42', valueFontSize: 1.8,
          },
          layout: { i: 'cnc-c-zpos', x: 8, y: 0, w: 4, h: 2, minW: 2, minH: 1, moved: false, static: false },
        },
      ],
    },
    layout: { i: 'cnc-container-axes', x: 0, y: 2, w: 9, h: 2, minW: 3, minH: 2, moved: false, static: false },
  },

  // ── CONTAINER: Homing (rows 2-3, cols 9-11) ─────────────────
  //
  //   Internal 12 cols:
  //   [─ Home X (4) ─][─ Home Y (4) ─][─ Home Z (4) ─]
  //   (buttons fill full height 2)
  //
  {
    id: 'cnc-container-homing',
    type: 'container',
    config: {
      backgroundColor: '#0f1628',
      padding: 4,
      spacing: 4,
      childWidgets: [
        {
          id: 'cnc-c-hx',
          type: 'button',
          config: { label: 'Home X', target: 'sysCommand', address: 11, valueToWrite: 0, color: '#00F2FF', icon: 'Home', fontSize: 0.7 },
          layout: { i: 'cnc-c-hx', x: 0, y: 0, w: 4, h: 2, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-hy',
          type: 'button',
          config: { label: 'Home Y', target: 'sysCommand', address: 12, valueToWrite: 0, color: '#4ADE80', icon: 'Home', fontSize: 0.7 },
          layout: { i: 'cnc-c-hy', x: 4, y: 0, w: 4, h: 2, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-hz',
          type: 'button',
          config: { label: 'Home Z', target: 'sysCommand', address: 13, valueToWrite: 0, color: '#FF8C42', icon: 'Home', fontSize: 0.7 },
          layout: { i: 'cnc-c-hz', x: 8, y: 0, w: 4, h: 2, minW: 1, minH: 1, moved: false, static: false },
        },
      ],
    },
    layout: { i: 'cnc-container-homing', x: 9, y: 2, w: 3, h: 2, minW: 2, minH: 2, moved: false, static: false },
  },

  // ── CONTAINER: Jog Control (rows 4-7, cols 0-4) ─────────────
  //
  //   Internal 12 cols × 4 rows:
  //   [── XY Jog pad (7) ──────][Z+ (5)      ]
  //   [── XY Jog pad ──────────][Z- (5)      ]
  //   [── XY Jog pad ──────────][JogDist (5) ]
  //   [                        ][JogDist     ]
  //
  {
    id: 'cnc-container-jog',
    type: 'container',
    config: {
      backgroundColor: '#0f1628',
      padding: 6,
      spacing: 4,
      childWidgets: [
        {
          id: 'cnc-c-jog-xy',
          type: 'directionalControl',
          config: {
            label: 'XY Jog', layout: '4way',
            directions: [
              { direction: 'up',    command: 22 },
              { direction: 'down',  command: 23 },
              { direction: 'left',  command: 21 },
              { direction: 'right', command: 20 },
            ],
            buttonSize: 40, color: '#00F2FF',
          },
          layout: { i: 'cnc-c-jog-xy', x: 0, y: 0, w: 7, h: 3, minW: 2, minH: 2, moved: false, static: false },
        },
        {
          id: 'cnc-c-zplus',
          type: 'button',
          config: { label: 'Z+', target: 'sysCommand', address: 24, valueToWrite: 0, color: '#FF8C42', icon: 'ArrowUpward', fontSize: 1.1 },
          layout: { i: 'cnc-c-zplus', x: 7, y: 0, w: 5, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-zminus',
          type: 'button',
          config: { label: 'Z-', target: 'sysCommand', address: 25, valueToWrite: 0, color: '#FF8C42', icon: 'ArrowDownward', fontSize: 1.1 },
          layout: { i: 'cnc-c-zminus', x: 7, y: 1, w: 5, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-jogdist',
          type: 'dropdown',
          config: {
            label: 'Jog Distance',
            target: 'register',
            address: 14,
            options: [
              { label: '1 step',   value: 1 },
              { label: '10 steps', value: 10 },
              { label: '50 steps', value: 50 },
              { label: '100 steps', value: 100 },
              { label: '500 steps', value: 500 },
            ],
          },
          layout: { i: 'cnc-c-jogdist', x: 7, y: 2, w: 5, h: 2, minW: 2, minH: 1, moved: false, static: false },
        },
      ],
    },
    layout: { i: 'cnc-container-jog', x: 0, y: 4, w: 5, h: 4, minW: 3, minH: 3, moved: false, static: false },
  },

  // ── CONTAINER: Spindle (rows 4-7, cols 5-11) ────────────────
  //
  //   Internal 12 cols × 4 rows:
  //   [─ Gauge (4) ─][─ Spindle LED (4) ─][─ Enable  (4) ─]
  //   [─ Gauge      ][─ Spd Setpoint (4) ─][─ Disable (4) ─]
  //   [─ Gauge      ][─ Spd Setpoint      ][               ]
  //   [─────────── Spindle Load Bar (12) ─────────────────]
  //
  {
    id: 'cnc-container-spindle',
    type: 'container',
    config: {
      backgroundColor: '#0f1628',
      padding: 6,
      spacing: 4,
      childWidgets: [
        {
          id: 'cnc-c-rpm-gauge',
          type: 'gauge',
          config: {
            label: 'Spindle RPM', source: 'register', address: 4, refreshInterval: 200,
            min: 0, max: 10000, unit: 'RPM', decimals: 0, showValue: true, valueFontSize: 1.8,
            colorRanges: [
              { from: 0,    to: 3000,  color: '#4ADE80' },
              { from: 3000, to: 7000,  color: '#FACC15' },
              { from: 7000, to: 10000, color: '#FF3B30' },
            ],
          },
          layout: { i: 'cnc-c-rpm-gauge', x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2, moved: false, static: false },
        },
        {
          id: 'cnc-c-spindle-led',
          type: 'ledIndicator',
          config: {
            label: 'Spindle', source: 'register', address: 9, refreshInterval: 200,
            onValue: 1, offValue: 0, onColor: '#00F2FF', offColor: '#6B7280',
            onLabel: 'RUNNING', offLabel: 'STOPPED', pulseWhenOn: true,
          },
          layout: { i: 'cnc-c-spindle-led', x: 4, y: 0, w: 4, h: 1, minW: 2, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-spd-set',
          type: 'valueWrite',
          config: {
            label: 'Spindle Speed',
            target: 'register',
            address: 13,
            format: 'decimal',
            min: 0,
            max: 10000,
            step: 100,
          },
          layout: { i: 'cnc-c-spd-set', x: 4, y: 1, w: 4, h: 2, minW: 2, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-en-spindle',
          type: 'button',
          config: { label: 'Enable', target: 'sysCommand', address: 8, valueToWrite: 0, color: '#4ADE80', icon: 'Power', fontSize: 0.7 },
          layout: { i: 'cnc-c-en-spindle', x: 8, y: 0, w: 4, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-dis-spindle',
          type: 'button',
          config: { label: 'Disable', target: 'sysCommand', address: 9, valueToWrite: 0, color: '#FF3B30', icon: 'PowerOff', fontSize: 0.7 },
          layout: { i: 'cnc-c-dis-spindle', x: 8, y: 1, w: 4, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-load-bar',
          type: 'progressBar',
          config: {
            label: 'Spindle Load', source: 'register', address: 5, refreshInterval: 200,
            min: 0, max: 100, unit: '%', orientation: 'horizontal', showPercentage: true, showValue: true,
            colorRanges: [
              { from: 0,  to: 50,  color: '#4ADE80' },
              { from: 50, to: 80,  color: '#FACC15' },
              { from: 80, to: 100, color: '#FF3B30' },
            ],
          },
          layout: { i: 'cnc-c-load-bar', x: 0, y: 3, w: 12, h: 1, minW: 4, minH: 1, moved: false, static: false },
        },
      ],
    },
    layout: { i: 'cnc-container-spindle', x: 5, y: 4, w: 7, h: 4, minW: 4, minH: 3, moved: false, static: false },
  },

  // ── CONTAINER: Motors (rows 8-10, cols 6-11) ────────────────
  //
  //   Internal 12 cols × 3 rows:
  //   [── Motor X LED (5) ──][─ En X (3) ─][─ Dis X (2) ─][All On (2)]
  //   [── Motor Y LED (5) ──][─ En Y (3) ─][─ Dis Y (2) ─][AllOff (2)]
  //   [── Motor Z LED (5) ──][─ En Z (3) ─][── Disable Z (4) ─────────]
  //
  {
    id: 'cnc-container-motors',
    type: 'container',
    config: {
      backgroundColor: '#0f1628',
      padding: 6,
      spacing: 4,
      childWidgets: [
        {
          id: 'cnc-c-mot-x',
          type: 'ledIndicator',
          config: { label: 'Motor X', source: 'register', address: 6, refreshInterval: 200, onValue: 1, offValue: 0, onColor: '#00F2FF', offColor: '#6B7280', onLabel: 'ON', offLabel: 'OFF', pulseWhenOn: false },
          layout: { i: 'cnc-c-mot-x', x: 0, y: 0, w: 5, h: 1, minW: 2, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-en-x',
          type: 'button',
          config: { label: 'Enable', target: 'sysCommand', address: 2, valueToWrite: 0, color: '#4ADE80', icon: 'Power', fontSize: 0.7 },
          layout: { i: 'cnc-c-en-x', x: 5, y: 0, w: 3, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-dis-x',
          type: 'button',
          config: { label: 'Disable', target: 'sysCommand', address: 5, valueToWrite: 0, color: '#FF9800', icon: 'PowerOff', fontSize: 0.7 },
          layout: { i: 'cnc-c-dis-x', x: 8, y: 0, w: 2, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-all-on',
          type: 'button',
          config: { label: 'All On', target: 'sysCommand', address: 0, valueToWrite: 0, color: '#4ADE80', icon: 'Power', fontSize: 0.7 },
          layout: { i: 'cnc-c-all-on', x: 10, y: 0, w: 2, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-mot-y',
          type: 'ledIndicator',
          config: { label: 'Motor Y', source: 'register', address: 7, refreshInterval: 200, onValue: 1, offValue: 0, onColor: '#4ADE80', offColor: '#6B7280', onLabel: 'ON', offLabel: 'OFF', pulseWhenOn: false },
          layout: { i: 'cnc-c-mot-y', x: 0, y: 1, w: 5, h: 1, minW: 2, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-en-y',
          type: 'button',
          config: { label: 'Enable', target: 'sysCommand', address: 3, valueToWrite: 0, color: '#4ADE80', icon: 'Power', fontSize: 0.7 },
          layout: { i: 'cnc-c-en-y', x: 5, y: 1, w: 3, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-dis-y',
          type: 'button',
          config: { label: 'Disable', target: 'sysCommand', address: 6, valueToWrite: 0, color: '#FF9800', icon: 'PowerOff', fontSize: 0.7 },
          layout: { i: 'cnc-c-dis-y', x: 8, y: 1, w: 2, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-all-off',
          type: 'button',
          config: { label: 'All Off', target: 'sysCommand', address: 1, valueToWrite: 0, color: '#FF9800', icon: 'PowerOff', fontSize: 0.7 },
          layout: { i: 'cnc-c-all-off', x: 10, y: 1, w: 2, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-mot-z',
          type: 'ledIndicator',
          config: { label: 'Motor Z', source: 'register', address: 8, refreshInterval: 200, onValue: 1, offValue: 0, onColor: '#FF8C42', offColor: '#6B7280', onLabel: 'ON', offLabel: 'OFF', pulseWhenOn: false },
          layout: { i: 'cnc-c-mot-z', x: 0, y: 2, w: 5, h: 1, minW: 2, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-en-z',
          type: 'button',
          config: { label: 'Enable', target: 'sysCommand', address: 4, valueToWrite: 0, color: '#4ADE80', icon: 'Power', fontSize: 0.7 },
          layout: { i: 'cnc-c-en-z', x: 5, y: 2, w: 3, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
        {
          id: 'cnc-c-dis-z',
          type: 'button',
          config: { label: 'Disable', target: 'sysCommand', address: 7, valueToWrite: 0, color: '#FF9800', icon: 'PowerOff', fontSize: 0.7 },
          layout: { i: 'cnc-c-dis-z', x: 8, y: 2, w: 4, h: 1, minW: 1, minH: 1, moved: false, static: false },
        },
      ],
    },
    layout: { i: 'cnc-container-motors', x: 6, y: 8, w: 6, h: 3, minW: 3, minH: 3, moved: false, static: false },
  },
];

// ──────────────────────────────────────────────────────────────
// Tab 2: Monitoring — Data Table, Alarm List, Status Matrix
//
// Grid layout (12 cols × 9 rows):
//
//        0    1    2    3    4    5    6    7    8    9   10   11
//   0:  [--------- Data Table ---------][------- Alarm List -------]
//   1:  [--------- Data Table ---------][------- Alarm List -------]
//   2:  [--------- Data Table ---------][------- Alarm List -------]
//   3:  [--------- Data Table ---------][------- Alarm List -------]
//   4:  [--------- Data Table ---------][------- Alarm List -------]
//   5:  [--------- Data Table ---------][------- Alarm List -------]
//   6:  [--------- Data Table ---------][------- Alarm List -------]
//   7:  [--------- Data Table ---------][-- Status Matrix ---------]
//   8:  [--------- Data Table ---------][-- Status Matrix ---------]
// ──────────────────────────────────────────────────────────────

const CNC_MONITORING_WIDGETS: DashboardWidget[] = [
  {
    id: 'cnc-mon-0',
    type: 'dataTable',
    config: {
      label: 'Live Readings & Control',
      items: [
        { label: 'X Position',    source: 'register' as const, address: 1,  format: 'decimal' as const, unit: 'steps' },
        { label: 'X Setpoint',    source: 'register' as const, address: 10, unit: 'steps' },
        { label: 'Y Position',    source: 'register' as const, address: 2,  format: 'decimal' as const, unit: 'steps' },
        { label: 'Y Setpoint',    source: 'register' as const, address: 11, unit: 'steps' },
        { label: 'Z Position',    source: 'register' as const, address: 3,  format: 'decimal' as const, unit: 'steps' },
        { label: 'Z Setpoint',    source: 'register' as const, address: 12, unit: 'steps' },
        { label: 'Spindle RPM',   source: 'register' as const, address: 4,  format: 'decimal' as const, unit: 'RPM' },
        { label: 'Spindle Target',source: 'register' as const, address: 13, unit: 'RPM', min: 0, max: 10000, step: 100 },
        { label: 'Spindle Load',  source: 'register' as const, address: 5,  format: 'decimal' as const, unit: '%' },
        { label: 'Jog Distance',  source: 'register' as const, address: 14, unit: 'steps', min: 1, max: 1000, step: 10 },
        { label: 'Uptime',        source: 'sysRegister' as const, address: 3, format: 'decimal' as const, unit: 's' },
        { label: 'Packets',       source: 'sysRegister' as const, address: 0, format: 'decimal' as const },
        { label: 'Errors',        source: 'sysRegister' as const, address: 1, format: 'decimal' as const },
      ],
      refreshInterval: 200,
      compact: false,
      confirmWrites: false,
      striped: true,
      valueFontSize: 0.75,
    },
    layout: { w: 6, h: 9, x: 0, y: 0, i: 'cnc-mon-0', moved: false, static: false },
  },
  {
    id: 'cnc-mon-1',
    type: 'alarmList',
    config: {
      label: 'CNC Alarms',
      refreshInterval: 200,
      alarms: [
        {
          label: 'Machine Error',
          source: 'register' as const,
          address: 0,
          type: 'state' as const,
          triggerValues: [5],
          severity: 'critical' as const,
        },
        {
          label: 'E-Stop Active',
          source: 'register' as const,
          address: 0,
          type: 'state' as const,
          triggerValues: [6],
          severity: 'critical' as const,
        },
        {
          label: 'Spindle Overload',
          source: 'register' as const,
          address: 5,
          type: 'threshold' as const,
          max: 85,
          severity: 'critical' as const,
        },
        {
          label: 'Spindle Load High',
          source: 'register' as const,
          address: 5,
          type: 'threshold' as const,
          max: 70,
          severity: 'warning' as const,
        },
        {
          label: 'Spindle Overspeed',
          source: 'register' as const,
          address: 4,
          type: 'threshold' as const,
          max: 9000,
          severity: 'warning' as const,
        },
        {
          label: 'Comm Errors',
          source: 'sysRegister' as const,
          address: 1,
          type: 'threshold' as const,
          max: 10,
          severity: 'warning' as const,
        },
      ] satisfies AlarmRule[],
      showInactive: true,
      compact: false,
    },
    layout: { w: 6, h: 7, x: 6, y: 0, i: 'cnc-mon-1', moved: false, static: false },
  },
  {
    id: 'cnc-mon-2',
    type: 'statusMatrix',
    config: {
      label: 'I/O Status',
      refreshInterval: 200,
      items: [
        { label: 'Motor X', source: 'register' as const, address: 6, onValue: 1, onColor: '#00F2FF', offColor: '#6B7280' },
        { label: 'Motor Y', source: 'register' as const, address: 7, onValue: 1, onColor: '#4ADE80', offColor: '#6B7280' },
        { label: 'Motor Z', source: 'register' as const, address: 8, onValue: 1, onColor: '#FF8C42', offColor: '#6B7280' },
        { label: 'Spindle', source: 'register' as const, address: 9, onValue: 1, onColor: '#00F2FF', offColor: '#6B7280' },
      ],
      showLabels: true,
      dotSize: 14,
      compact: false,
    },
    layout: { w: 6, h: 2, x: 6, y: 7, i: 'cnc-mon-2', moved: false, static: false },
  },
];

/** CNC system commands for the emulator */
export const CNC_SYS_COMMANDS: SysCommand[] = [
  { code:  0, name: 'ENABLE_ALL_MOTORS',  description: 'Enable all motor axes' },
  { code:  1, name: 'DISABLE_ALL_MOTORS', description: 'Disable all motor axes' },
  { code:  2, name: 'ENABLE_MOTOR_X',     description: 'Enable X-axis motor' },
  { code:  3, name: 'ENABLE_MOTOR_Y',     description: 'Enable Y-axis motor' },
  { code:  4, name: 'ENABLE_MOTOR_Z',     description: 'Enable Z-axis motor' },
  { code:  5, name: 'DISABLE_MOTOR_X',    description: 'Disable X-axis motor' },
  { code:  6, name: 'DISABLE_MOTOR_Y',    description: 'Disable Y-axis motor' },
  { code:  7, name: 'DISABLE_MOTOR_Z',    description: 'Disable Z-axis motor' },
  { code:  8, name: 'ENABLE_SPINDLE',     description: 'Enable spindle motor' },
  { code:  9, name: 'DISABLE_SPINDLE',    description: 'Disable spindle motor' },
  { code: 10, name: 'HOME_ALL',           description: 'Home all axes' },
  { code: 11, name: 'HOME_X',             description: 'Home X-axis' },
  { code: 12, name: 'HOME_Y',             description: 'Home Y-axis' },
  { code: 13, name: 'HOME_Z',             description: 'Home Z-axis' },
  { code: 14, name: 'E_STOP',             description: 'Emergency stop' },
  { code: 15, name: 'RESET_E_STOP',       description: 'Reset emergency stop' },
  { code: 16, name: 'CLEAR_ERRORS',       description: 'Clear error state' },
  { code: 20, name: 'JOG_X_POSITIVE',     description: 'Jog X-axis positive' },
  { code: 21, name: 'JOG_X_NEGATIVE',     description: 'Jog X-axis negative' },
  { code: 22, name: 'JOG_Y_POSITIVE',     description: 'Jog Y-axis positive' },
  { code: 23, name: 'JOG_Y_NEGATIVE',     description: 'Jog Y-axis negative' },
  { code: 24, name: 'JOG_Z_POSITIVE',     description: 'Jog Z-axis positive' },
  { code: 25, name: 'JOG_Z_NEGATIVE',     description: 'Jog Z-axis negative' },
];

export const CNC_REGISTERS_METADATA: Record<string, EntryMetadata> = {
  CONTROLLER_STATE: {
    description: 'Current state of the CNC controller state machine. Updated internally by firmware; read-only.',
    valueList: [
      { value: '0', label: 'IDLE — Powered on, motors enabled, awaiting commands' },
      { value: '1', label: 'HOMING — Homing sequence in progress' },
      { value: '2', label: 'READY — Homed and ready to execute motion' },
      { value: '3', label: 'RUNNING — Actively executing a motion command' },
      { value: '4', label: 'PAUSED — Motion paused, resumable' },
      { value: '5', label: 'ERROR — Fault condition; clear with CLEAR_ERRORS' },
      { value: '6', label: 'E_STOP — Emergency stop active; reset with RESET_E_STOP' },
    ],
  },
  MOTOR_X_ENCODER: {
    unit: 'counts',
    description: 'X-axis motor encoder feedback position in raw encoder counts. Divide by MOTOR_X_STEPS_PER_MM to convert to mm.',
  },
  MOTOR_Y_ENCODER: {
    unit: 'counts',
    description: 'Y-axis motor encoder feedback position in raw encoder counts. Divide by MOTOR_Y_STEPS_PER_MM to convert to mm.',
  },
  MOTOR_Z_ENCODER: {
    unit: 'counts',
    description: 'Z-axis motor encoder feedback position in raw encoder counts. Divide by MOTOR_Z_STEPS_PER_MM to convert to mm.',
  },
  SPINDLE_RPM: {
    unit: 'RPM',
    description: 'Current spindle speed as measured by the feedback sensor. Updated every control cycle.',
  },
  SPINDLE_LOAD: {
    unit: '%',
    description: 'Spindle motor load as a percentage of maximum rated torque. Values above 80% indicate heavy cutting load.',
  },
  MOTOR_X_ENABLED: {
    description: 'X-axis motor driver enable state.',
    valueList: [
      { value: '0', label: 'Disabled — driver de-energised, axis free to move' },
      { value: '1', label: 'Enabled — driver energised, axis under closed-loop control' },
    ],
  },
  MOTOR_Y_ENABLED: {
    description: 'Y-axis motor driver enable state.',
    valueList: [
      { value: '0', label: 'Disabled — driver de-energised, axis free to move' },
      { value: '1', label: 'Enabled — driver energised, axis under closed-loop control' },
    ],
  },
  MOTOR_Z_ENABLED: {
    description: 'Z-axis motor driver enable state.',
    valueList: [
      { value: '0', label: 'Disabled — driver de-energised, axis free to move' },
      { value: '1', label: 'Enabled — driver energised, axis under closed-loop control' },
    ],
  },
  SPINDLE_ENABLED: {
    description: 'Spindle motor enable state.',
    valueList: [
      { value: '0', label: 'Disabled — spindle motor off' },
      { value: '1', label: 'Enabled — spindle motor running at SPINDLE_SPEED_SETPOINT' },
    ],
  },
  MOTOR_X_SETPOINT: {
    unit: 'counts',
    description: 'Target position setpoint for the X-axis closed-loop controller. Write to command motion; the firmware ramps to this position at up to MOTOR_X_MAX_VEL.',
  },
  MOTOR_Y_SETPOINT: {
    unit: 'counts',
    description: 'Target position setpoint for the Y-axis closed-loop controller. Write to command motion; the firmware ramps to this position at up to MOTOR_Y_MAX_VEL.',
  },
  MOTOR_Z_SETPOINT: {
    unit: 'counts',
    description: 'Target position setpoint for the Z-axis closed-loop controller. Write to command motion; the firmware ramps to this position at up to MOTOR_Z_MAX_VEL.',
  },
  SPINDLE_SPEED_SETPOINT: {
    unit: 'RPM',
    description: 'Commanded spindle speed. Takes effect immediately when the spindle is enabled. Clamped to SPINDLE_MAX_RPM by firmware.',
  },
  JOG_DISTANCE: {
    unit: 'counts',
    description: 'Distance moved per jog step command (encoder counts). Each JOG_* SYS_COMMAND moves the corresponding axis by this amount.',
    valueList: [
      { value: '1',   label: 'Fine jog (1 count)' },
      { value: '10',  label: 'Small jog (10 counts)' },
      { value: '50',  label: 'Medium jog (50 counts)' },
      { value: '100', label: 'Standard jog (100 counts)' },
      { value: '500', label: 'Coarse jog (500 counts)' },
    ],
  },
};

export const CNC_PARAMETERS_METADATA: Record<string, EntryMetadata> = {
  MOTOR_X_MAX_VEL: {
    unit: 'counts/s',
    description: 'Maximum allowed velocity for the X-axis motor. The firmware clamps all X motion profiles to this speed.',
  },
  MOTOR_Y_MAX_VEL: {
    unit: 'counts/s',
    description: 'Maximum allowed velocity for the Y-axis motor. The firmware clamps all Y motion profiles to this speed.',
  },
  MOTOR_Z_MAX_VEL: {
    unit: 'counts/s',
    description: 'Maximum allowed velocity for the Z-axis motor. The firmware clamps all Z motion profiles to this speed.',
  },
  MOTOR_X_MAX_ACCEL: {
    unit: 'counts/s²',
    description: 'Maximum acceleration ramp rate for the X-axis. Higher values give faster response but may cause missed steps or mechanical shock.',
  },
  MOTOR_Y_MAX_ACCEL: {
    unit: 'counts/s²',
    description: 'Maximum acceleration ramp rate for the Y-axis. Higher values give faster response but may cause missed steps or mechanical shock.',
  },
  MOTOR_Z_MAX_ACCEL: {
    unit: 'counts/s²',
    description: 'Maximum acceleration ramp rate for the Z-axis. Higher values give faster response but may cause missed steps or mechanical shock.',
  },
  MOTOR_X_KP: {
    description: 'Proportional gain for the X-axis PID position controller. Increase to improve stiffness; too high causes oscillation.',
  },
  MOTOR_X_KI: {
    description: 'Integral gain for the X-axis PID position controller. Eliminates steady-state position error; too high causes windup and instability.',
  },
  MOTOR_X_KD: {
    description: 'Derivative gain for the X-axis PID position controller. Dampens overshoot; too high amplifies noise.',
  },
  MOTOR_Y_KP: {
    description: 'Proportional gain for the Y-axis PID position controller. Increase to improve stiffness; too high causes oscillation.',
  },
  MOTOR_Y_KI: {
    description: 'Integral gain for the Y-axis PID position controller. Eliminates steady-state position error; too high causes windup and instability.',
  },
  MOTOR_Y_KD: {
    description: 'Derivative gain for the Y-axis PID position controller. Dampens overshoot; too high amplifies noise.',
  },
  MOTOR_Z_KP: {
    description: 'Proportional gain for the Z-axis PID position controller. Increase to improve stiffness; too high causes oscillation.',
  },
  MOTOR_Z_KI: {
    description: 'Integral gain for the Z-axis PID position controller. Eliminates steady-state position error; too high causes windup and instability.',
  },
  MOTOR_Z_KD: {
    description: 'Derivative gain for the Z-axis PID position controller. Dampens overshoot; too high amplifies noise.',
  },
  MOTOR_X_STEPS_PER_MM: {
    unit: 'counts/mm',
    description: 'Encoder counts per millimeter of linear travel on the X-axis. Used to convert between encoder counts and physical position in mm. Determined by leadscrew pitch × encoder resolution.',
  },
  MOTOR_Y_STEPS_PER_MM: {
    unit: 'counts/mm',
    description: 'Encoder counts per millimeter of linear travel on the Y-axis. Used to convert between encoder counts and physical position in mm. Determined by leadscrew pitch × encoder resolution.',
  },
  MOTOR_Z_STEPS_PER_MM: {
    unit: 'counts/mm',
    description: 'Encoder counts per millimeter of linear travel on the Z-axis. Used to convert between encoder counts and physical position in mm. Determined by leadscrew pitch × encoder resolution.',
  },
  SPINDLE_MAX_RPM: {
    unit: 'RPM',
    description: 'Maximum rated spindle speed. The firmware clamps SPINDLE_SPEED_SETPOINT to this value to protect the spindle motor.',
  },
  SPINDLE_ACCEL_RPM_PER_SEC: {
    unit: 'RPM/s',
    description: 'Spindle speed ramp rate on enable or setpoint change. Higher values reach target RPM faster but increase mechanical stress on the spindle drive.',
  },
  E_STOP_DECEL: {
    unit: 'counts/s²',
    description: 'Deceleration rate applied to all axes during an emergency stop. High values stop faster but may cause position loss on open-loop sections. Set lower than MOTOR_*_MAX_ACCEL for a controlled stop.',
  },
  HOMING_SPEED: {
    unit: 'counts/s',
    description: 'Motor velocity used during the homing sequence for all axes. Lower values improve repeatability and reduce impact force on endstops.',
  },
  HOME_X_POSITION: {
    unit: 'counts',
    description: 'Encoder count value assigned as the X-axis logical zero after homing is complete. Typically 0; adjust if the home switch is offset from the mechanical zero point.',
  },
  HOME_Y_POSITION: {
    unit: 'counts',
    description: 'Encoder count value assigned as the Y-axis logical zero after homing is complete. Typically 0; adjust if the home switch is offset from the mechanical zero point.',
  },
  HOME_Z_POSITION: {
    unit: 'counts',
    description: 'Encoder count value assigned as the Z-axis logical zero after homing is complete. Typically 0; adjust if the home switch is offset from the mechanical zero point.',
  },
};

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
