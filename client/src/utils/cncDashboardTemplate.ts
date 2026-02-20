import type { DashboardLayout, DashboardWidget } from '../types/dashboard';
import type { SysCommand } from '../types/settings';

const CNC_TAB_ID = 'cnc-demo-tab';

const CNC_WIDGETS: DashboardWidget[] = [
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
    layout: { w: 2, h: 1, x: 0, y: 0, i: 'modern-cnc-0', moved: false, static: false },
  },
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
    layout: { w: 7, h: 2, x: 2, y: 0, i: 'modern-cnc-1', moved: false, static: false },
  },
  {
    id: 'modern-cnc-2',
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
    layout: { w: 3, h: 2, x: 9, y: 0, i: 'modern-cnc-2', moved: false, static: false },
  },
  {
    id: 'modern-cnc-3',
    type: 'button',
    config: { label: 'Reset E-Stop', target: 'sysCommand', address: 215, valueToWrite: 0, color: '#FACC15', fontSize: 0.8 },
    layout: { w: 2, h: 1, x: 9, y: 2, i: 'modern-cnc-3', moved: false, static: false },
  },
  {
    id: 'modern-cnc-4',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 216, valueToWrite: 0, color: '#6B7280', icon: 'RestartAlt' },
    layout: { w: 1, h: 1, x: 11, y: 2, i: 'modern-cnc-4', moved: false, static: false },
  },
  {
    id: 'modern-cnc-5',
    type: 'encoderDisplay',
    config: {
      label: 'X Position', source: 'register', address: 5, refreshInterval: 50,
      conversionSource: 'constant', conversionFactor: 1000,
      primaryUnit: 'mm', secondaryUnit: 'steps', showRawValue: true, decimals: 3,
      color: '#00F2FF', valueFontSize: 1.8,
    },
    layout: { w: 3, h: 2, x: 0, y: 2, i: 'modern-cnc-5', moved: false, static: false },
  },
  {
    id: 'modern-cnc-6',
    type: 'encoderDisplay',
    config: {
      label: 'Y Position', source: 'register', address: 6, refreshInterval: 50,
      conversionSource: 'constant', conversionFactor: 1000,
      primaryUnit: 'mm', secondaryUnit: 'steps', showRawValue: true, decimals: 3,
      color: '#4ADE80', valueFontSize: 1.8,
    },
    layout: { w: 3, h: 2, x: 3, y: 2, i: 'modern-cnc-6', moved: false, static: false },
  },
  {
    id: 'modern-cnc-7',
    type: 'encoderDisplay',
    config: {
      label: 'Z Position', source: 'register', address: 7, refreshInterval: 50,
      conversionSource: 'constant', conversionFactor: 1000,
      primaryUnit: 'mm', secondaryUnit: 'steps', showRawValue: true, decimals: 3,
      color: '#FF8C42', valueFontSize: 1.8,
    },
    layout: { w: 3, h: 2, x: 6, y: 2, i: 'modern-cnc-7', moved: false, static: false },
  },
  {
    id: 'modern-cnc-8',
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
    layout: { w: 3, h: 3, x: 0, y: 4, i: 'modern-cnc-8', moved: false, static: false },
  },
  {
    id: 'modern-cnc-9',
    type: 'button',
    config: { label: 'Z+', target: 'sysCommand', address: 224, valueToWrite: 0, color: '#FF8C42', icon: 'ArrowUpward', fontSize: 1.1 },
    layout: { w: 2, h: 1, x: 3, y: 4, i: 'modern-cnc-9', moved: false, static: false },
  },
  {
    id: 'modern-cnc-10',
    type: 'button',
    config: { label: 'Z-', target: 'sysCommand', address: 225, valueToWrite: 0, color: '#FF8C42', icon: 'ArrowDownward', fontSize: 1.1 },
    layout: { w: 2, h: 1, x: 3, y: 5, i: 'modern-cnc-10', moved: false, static: false },
  },
  {
    id: 'modern-cnc-11',
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
    layout: { w: 3, h: 3, x: 5, y: 4, i: 'modern-cnc-11', moved: false, static: false },
  },
  {
    id: 'modern-cnc-12',
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
    layout: { w: 4, h: 1, x: 8, y: 4, i: 'modern-cnc-12', moved: false, static: false },
  },
  {
    id: 'modern-cnc-13',
    type: 'button',
    config: { label: 'Enable Spindle', target: 'sysCommand', address: 208, valueToWrite: 0, color: '#4ADE80', icon: 'Power', fontSize: 0.85 },
    layout: { w: 2, h: 1, x: 8, y: 5, i: 'modern-cnc-13', moved: false, static: false },
  },
  {
    id: 'modern-cnc-14',
    type: 'button',
    config: { label: 'Disable Spindle', target: 'sysCommand', address: 209, valueToWrite: 0, color: '#FF3B30', icon: 'PowerOff', fontSize: 0.85 },
    layout: { w: 2, h: 1, x: 10, y: 5, i: 'modern-cnc-14', moved: false, static: false },
  },
  {
    id: 'modern-cnc-15',
    type: 'ledIndicator',
    config: { label: 'Motor X', source: 'register', address: 10, refreshInterval: 100, onValue: 1, offValue: 0, onColor: '#00F2FF', offColor: '#6B7280', onLabel: 'ON', offLabel: 'OFF', pulseWhenOn: false },
    layout: { w: 2, h: 1, x: 0, y: 7, i: 'modern-cnc-15', moved: false, static: false },
  },
  {
    id: 'modern-cnc-16',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 202, valueToWrite: 0, color: '#4ADE80', icon: 'Power' },
    layout: { w: 1, h: 1, x: 2, y: 7, i: 'modern-cnc-16', moved: false, static: false },
  },
  {
    id: 'modern-cnc-17',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 205, valueToWrite: 0, color: '#FF9800', icon: 'PowerOff' },
    layout: { w: 1, h: 1, x: 3, y: 7, i: 'modern-cnc-17', moved: false, static: false },
  },
  {
    id: 'modern-cnc-18',
    type: 'ledIndicator',
    config: { label: 'Motor Y', source: 'register', address: 11, refreshInterval: 100, onValue: 1, offValue: 0, onColor: '#4ADE80', offColor: '#6B7280', onLabel: 'ON', offLabel: 'OFF', pulseWhenOn: false },
    layout: { w: 2, h: 1, x: 4, y: 7, i: 'modern-cnc-18', moved: false, static: false },
  },
  {
    id: 'modern-cnc-19',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 203, valueToWrite: 0, color: '#4ADE80', icon: 'Power' },
    layout: { w: 1, h: 1, x: 6, y: 7, i: 'modern-cnc-19', moved: false, static: false },
  },
  {
    id: 'modern-cnc-20',
    type: 'button',
    config: { label: '', target: 'sysCommand', address: 206, valueToWrite: 0, color: '#FF9800', icon: 'PowerOff' },
    layout: { w: 1, h: 1, x: 7, y: 7, i: 'modern-cnc-20', moved: false, static: false },
  },
  {
    id: 'modern-cnc-21',
    type: 'ledIndicator',
    config: { label: 'Motor Z', source: 'register', address: 12, refreshInterval: 100, onValue: 1, offValue: 0, onColor: '#FF8C42', offColor: '#6B7280', onLabel: 'ON', offLabel: 'OFF', pulseWhenOn: false },
    layout: { w: 2, h: 1, x: 8, y: 7, i: 'modern-cnc-21', moved: false, static: false },
  },
  {
    id: 'modern-cnc-22',
    type: 'ledIndicator',
    config: { label: 'Spindle', source: 'register', address: 13, refreshInterval: 100, onValue: 1, offValue: 0, onColor: '#00F2FF', offColor: '#6B7280', onLabel: 'RUNNING', offLabel: 'STOPPED', pulseWhenOn: true },
    layout: { w: 2, h: 1, x: 10, y: 7, i: 'modern-cnc-22', moved: false, static: false },
  },
  {
    id: 'modern-cnc-23',
    type: 'button',
    config: { label: 'Enable All Motors', target: 'sysCommand', address: 200, valueToWrite: 0, color: '#4ADE80', icon: 'Power' },
    layout: { w: 4, h: 1, x: 0, y: 8, i: 'modern-cnc-23', moved: false, static: false },
  },
  {
    id: 'modern-cnc-24',
    type: 'button',
    config: { label: 'Disable All Motors', target: 'sysCommand', address: 201, valueToWrite: 0, color: '#FF9800', icon: 'PowerOff' },
    layout: { w: 4, h: 1, x: 4, y: 8, i: 'modern-cnc-24', moved: false, static: false },
  },
  {
    id: 'modern-cnc-25',
    type: 'button',
    config: { label: 'Home All Axes', target: 'sysCommand', address: 210, valueToWrite: 0, color: '#2196F3', icon: 'Home' },
    layout: { w: 4, h: 1, x: 8, y: 8, i: 'modern-cnc-25', moved: false, static: false },
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
        name: 'Modern CNC Dashboard',
        widgets: CNC_WIDGETS,
      },
    ],
    activeTabId: CNC_TAB_ID,
  };
}
