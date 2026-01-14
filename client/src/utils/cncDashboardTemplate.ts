import { DashboardLayout, DashboardTab, DashboardWidget } from '../types/dashboard';
import { Layout } from 'react-grid-layout';

/**
 * Create a pre-configured CNC Motor Controller dashboard
 * This dashboard demonstrates all DeviceMon capabilities with the emulator
 */
export function createCNCDashboard(): DashboardLayout {
  const widgets: DashboardWidget[] = [];
  let widgetCounter = 0;

  // Helper to create a widget with layout
  const createWidget = (
    type: DashboardWidget['type'],
    config: DashboardWidget['config'],
    layout: Omit<Layout, 'i'>
  ): DashboardWidget => {
    const id = `cnc-widget-${widgetCounter++}`;
    return {
      id,
      type,
      config,
      layout: { ...layout, i: id }
    };
  };

  // Row 1: System Control Buttons (y=0)
  widgets.push(
    createWidget('button', {
      label: 'Enable All Motors',
      target: 'sysCommand',
      address: 200, // ENABLE_ALL_MOTORS
      valueToWrite: 0,
      color: '#4caf50',
      confirmationRequired: false
    }, { x: 0, y: 0, w: 2, h: 1 })
  );

  widgets.push(
    createWidget('button', {
      label: 'Disable All Motors',
      target: 'sysCommand',
      address: 201, // DISABLE_ALL_MOTORS
      valueToWrite: 0,
      color: '#ff9800',
      confirmationRequired: false
    }, { x: 2, y: 0, w: 2, h: 1 })
  );

  widgets.push(
    createWidget('button', {
      label: 'Home All Axes',
      target: 'sysCommand',
      address: 210, // HOME_ALL
      valueToWrite: 0,
      color: '#2196f3',
      confirmationRequired: false
    }, { x: 4, y: 0, w: 2, h: 1 })
  );

  widgets.push(
    createWidget('button', {
      label: 'E-STOP',
      target: 'sysCommand',
      address: 214, // E_STOP
      valueToWrite: 0,
      color: '#f44336',
      confirmationRequired: true
    }, { x: 6, y: 0, w: 2, h: 1 })
  );

  widgets.push(
    createWidget('button', {
      label: 'Reset E-Stop',
      target: 'sysCommand',
      address: 215, // RESET_E_STOP
      valueToWrite: 0,
      color: '#9c27b0',
      confirmationRequired: false
    }, { x: 8, y: 0, w: 2, h: 1 })
  );

  widgets.push(
    createWidget('button', {
      label: 'Clear Errors',
      target: 'sysCommand',
      address: 216, // CLEAR_ERRORS
      valueToWrite: 0,
      color: '#607d8b',
      confirmationRequired: false
    }, { x: 10, y: 0, w: 2, h: 1 })
  );

  // Row 2: CNC State and Motors Status (y=1)
  widgets.push(
    createWidget('valueRead', {
      label: 'CNC State',
      source: 'register',
      address: 4, // CONTROLLER_STATE (0=IDLE, 1=HOMING, 2=READY, 3=RUNNING, 4=PAUSED, 5=ERROR, 6=E_STOP)
      displayFormat: 'decimal',
      refreshInterval: 200,
      showTimestamp: false
    }, { x: 0, y: 1, w: 3, h: 2 })
  );

  widgets.push(
    createWidget('valueRead', {
      label: 'Motor X Enabled',
      source: 'register',
      address: 10, // MOTOR_X_ENABLED
      displayFormat: 'decimal',
      refreshInterval: 200,
      showTimestamp: false
    }, { x: 3, y: 1, w: 3, h: 2 })
  );

  widgets.push(
    createWidget('valueRead', {
      label: 'Spindle Enabled',
      source: 'register',
      address: 13, // SPINDLE_ENABLED
      displayFormat: 'decimal',
      refreshInterval: 200,
      showTimestamp: false
    }, { x: 6, y: 1, w: 3, h: 2 })
  );

  widgets.push(
    createWidget('valueRead', {
      label: 'Spindle Load',
      source: 'register',
      address: 9, // SPINDLE_LOAD (percentage)
      displayFormat: 'decimal',
      refreshInterval: 200,
      showTimestamp: false,
      unit: '%'
    }, { x: 9, y: 1, w: 3, h: 2 })
  );

  // Row 3: Position Plots (y=3)
  widgets.push(
    createWidget('miniPlot', {
      label: 'X Encoder Position',
      source: 'register',
      address: 5, // MOTOR_X_ENCODER
      timeWindow: 30,
      pollInterval: 200,
      showLegend: true,
      color: '#f44336'
    }, { x: 0, y: 3, w: 4, h: 3 })
  );

  widgets.push(
    createWidget('miniPlot', {
      label: 'Y Encoder Position',
      source: 'register',
      address: 6, // MOTOR_Y_ENCODER
      timeWindow: 30,
      pollInterval: 200,
      showLegend: true,
      color: '#4caf50'
    }, { x: 4, y: 3, w: 4, h: 3 })
  );

  widgets.push(
    createWidget('miniPlot', {
      label: 'Z Encoder Position',
      source: 'register',
      address: 7, // MOTOR_Z_ENCODER
      timeWindow: 30,
      pollInterval: 200,
      showLegend: true,
      color: '#2196f3'
    }, { x: 8, y: 3, w: 4, h: 3 })
  );

  // Row 4: Motor Status and Spindle (y=6)
  widgets.push(
    createWidget('valueRead', {
      label: 'Motor Y Enabled',
      source: 'register',
      address: 11, // MOTOR_Y_ENABLED
      displayFormat: 'decimal',
      refreshInterval: 200,
      showTimestamp: false
    }, { x: 0, y: 6, w: 3, h: 2 })
  );

  widgets.push(
    createWidget('valueRead', {
      label: 'Motor Z Enabled',
      source: 'register',
      address: 12, // MOTOR_Z_ENABLED
      displayFormat: 'decimal',
      refreshInterval: 200,
      showTimestamp: false
    }, { x: 3, y: 6, w: 3, h: 2 })
  );

  widgets.push(
    createWidget('valueRead', {
      label: 'Spindle RPM',
      source: 'register',
      address: 8, // SPINDLE_RPM
      displayFormat: 'decimal',
      refreshInterval: 200,
      showTimestamp: false,
      unit: 'RPM'
    }, { x: 6, y: 6, w: 3, h: 2 })
  );

  widgets.push(
    createWidget('valueRead', {
      label: 'Packet Count',
      source: 'register',
      address: 0, // DS_PACKET_COUNT
      displayFormat: 'decimal',
      refreshInterval: 200,
      showTimestamp: false
    }, { x: 9, y: 6, w: 3, h: 2 })
  );

  // Row 5: Motor Control Buttons (y=8)
  // X-Axis controls
  widgets.push(
    createWidget('button', {
      label: 'Enable X',
      target: 'sysCommand',
      address: 202, // ENABLE_MOTOR_X
      valueToWrite: 0,
      color: '#4caf50'
    }, { x: 0, y: 8, w: 2, h: 1 })
  );

  widgets.push(
    createWidget('button', {
      label: 'Disable X',
      target: 'sysCommand',
      address: 205, // DISABLE_MOTOR_X
      valueToWrite: 0,
      color: '#ff9800'
    }, { x: 2, y: 8, w: 2, h: 1 })
  );

  // Y-Axis controls
  widgets.push(
    createWidget('button', {
      label: 'Enable Y',
      target: 'sysCommand',
      address: 203, // ENABLE_MOTOR_Y
      valueToWrite: 0,
      color: '#4caf50'
    }, { x: 4, y: 8, w: 2, h: 1 })
  );

  widgets.push(
    createWidget('button', {
      label: 'Disable Y',
      target: 'sysCommand',
      address: 206, // DISABLE_MOTOR_Y
      valueToWrite: 0,
      color: '#ff9800'
    }, { x: 6, y: 8, w: 2, h: 1 })
  );

  // Z-Axis controls
  widgets.push(
    createWidget('button', {
      label: 'Enable Z',
      target: 'sysCommand',
      address: 204, // ENABLE_MOTOR_Z
      valueToWrite: 0,
      color: '#4caf50'
    }, { x: 8, y: 8, w: 2, h: 1 })
  );

  widgets.push(
    createWidget('button', {
      label: 'Disable Z',
      target: 'sysCommand',
      address: 207, // DISABLE_MOTOR_Z
      valueToWrite: 0,
      color: '#ff9800'
    }, { x: 10, y: 8, w: 2, h: 1 })
  );

  // Row 6: Jog Controls (y=9)
  widgets.push(
    createWidget('button', {
      label: 'Jog X-',
      target: 'sysCommand',
      address: 221, // JOG_X_NEGATIVE
      valueToWrite: 0,
      color: '#3f51b5'
    }, { x: 0, y: 9, w: 2, h: 1 })
  );

  widgets.push(
    createWidget('button', {
      label: 'Jog X+',
      target: 'sysCommand',
      address: 220, // JOG_X_POSITIVE
      valueToWrite: 0,
      color: '#3f51b5'
    }, { x: 2, y: 9, w: 2, h: 1 })
  );

  widgets.push(
    createWidget('button', {
      label: 'Jog Y-',
      target: 'sysCommand',
      address: 223, // JOG_Y_NEGATIVE
      valueToWrite: 0,
      color: '#3f51b5'
    }, { x: 4, y: 9, w: 2, h: 1 })
  );

  widgets.push(
    createWidget('button', {
      label: 'Jog Y+',
      target: 'sysCommand',
      address: 222, // JOG_Y_POSITIVE
      valueToWrite: 0,
      color: '#3f51b5'
    }, { x: 6, y: 9, w: 2, h: 1 })
  );

  widgets.push(
    createWidget('button', {
      label: 'Jog Z-',
      target: 'sysCommand',
      address: 225, // JOG_Z_NEGATIVE
      valueToWrite: 0,
      color: '#3f51b5'
    }, { x: 8, y: 9, w: 2, h: 1 })
  );

  widgets.push(
    createWidget('button', {
      label: 'Jog Z+',
      target: 'sysCommand',
      address: 224, // JOG_Z_POSITIVE
      valueToWrite: 0,
      color: '#3f51b5'
    }, { x: 10, y: 9, w: 2, h: 1 })
  );

  // Row 7: Spindle Controls (y=10)
  widgets.push(
    createWidget('button', {
      label: 'Enable Spindle',
      target: 'sysCommand',
      address: 208, // ENABLE_SPINDLE
      valueToWrite: 0,
      color: '#00bcd4'
    }, { x: 0, y: 10, w: 2, h: 1 })
  );

  widgets.push(
    createWidget('button', {
      label: 'Disable Spindle',
      target: 'sysCommand',
      address: 209, // DISABLE_SPINDLE
      valueToWrite: 0,
      color: '#ff5722'
    }, { x: 2, y: 10, w: 2, h: 1 })
  );

  // System Status Displays
  widgets.push(
    createWidget('valueRead', {
      label: 'Uptime Counter',
      source: 'register',
      address: 3, // COUNTER_1HZ (seconds since start)
      displayFormat: 'decimal',
      refreshInterval: 1000,
      showTimestamp: false,
      unit: 's'
    }, { x: 4, y: 10, w: 3, h: 2 })
  );

  widgets.push(
    createWidget('valueRead', {
      label: 'Error Count',
      source: 'register',
      address: 1, // DS_ERROR_COUNT
      displayFormat: 'decimal',
      refreshInterval: 200,
      showTimestamp: false
    }, { x: 7, y: 10, w: 3, h: 2 })
  );

  // Create the dashboard tab
  const cncTab: DashboardTab = {
    id: 'cnc-demo-tab',
    name: 'CNC Controller Demo',
    widgets
  };

  return {
    tabs: [cncTab],
    activeTabId: cncTab.id
  };
}
