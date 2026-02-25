import { WidgetType } from '../types/dashboard';

export interface WidgetSizeInfo {
  width: number;
  height: number;
  scale: number;
}

/**
 * Reference sizes in pixels for each widget type at default grid dimensions.
 * Computed as: DEFAULT_WIDGET_SIZES * 60px rowHeight, minus 24px padding (p:1.5 = 12px each side).
 * Button has no padding so uses raw grid dimensions.
 */
const WIDGET_REFERENCE_SIZES: Record<WidgetType, { width: number; height: number }> = {
  button:             { width: 120, height: 60 },
  valueRead:          { width: 156, height: 96 },
  valueWrite:         { width: 156, height: 96 },
  miniPlot:           { width: 216, height: 156 },
  dropdown:           { width: 156, height: 96 },
  stateLED:           { width: 96,  height: 36 },
  gauge:              { width: 156, height: 156 },
  progressBar:        { width: 216, height: 36 },
  encoderDisplay:     { width: 156, height: 96 },
  ledIndicator:       { width: 96,  height: 36 },
  directionalControl: { width: 156, height: 156 },
  systemInfo:         { width: 216, height: 156 },
  dataTable:          { width: 276, height: 216 },
  alarmList:          { width: 216, height: 216 },
  statusMatrix:       { width: 216, height: 156 },
  controlTable:       { width: 276, height: 216 },
};

/**
 * Compute the scale factor for a widget based on its current pixel dimensions.
 * At default size, scale = 1.0. Clamped to [0.5, 3.0].
 */
export function getWidgetScale(type: WidgetType, width: number, height: number): WidgetSizeInfo {
  if (width === 0 || height === 0) {
    return { width, height, scale: 1 };
  }

  const ref = WIDGET_REFERENCE_SIZES[type];
  const wRatio = width / ref.width;
  const hRatio = height / ref.height;
  const scale = Math.max(0.5, Math.min(3.0, Math.min(wRatio, hRatio)));

  return { width, height, scale };
}

/** Scale a rem base value by the widget scale factor, returning a CSS rem string. */
export function scaledRem(baseRem: number, scale: number): string {
  return `${(baseRem * scale).toFixed(4)}rem`;
}

/** Scale a pixel base value by the widget scale factor, returning a rounded number. */
export function scaledPx(basePx: number, scale: number): number {
  return Math.round(basePx * scale);
}

/** Layout orientation derived from widget aspect ratio. */
export type WidgetOrientation = 'landscape' | 'portrait' | 'square';

/**
 * Determine layout orientation from widget dimensions.
 * Uses a dead-zone threshold (default 1.4) to prevent flickering during resize.
 */
export function getOrientation(size: WidgetSizeInfo, threshold = 1.4): WidgetOrientation {
  if (size.height === 0 || size.width === 0) return 'square';
  const ratio = size.width / size.height;
  if (ratio > threshold) return 'landscape';
  if (ratio < 1 / threshold) return 'portrait';
  return 'square';
}

/** True when the widget is below a pixel threshold in either dimension. */
export function isCompactSize(size: WidgetSizeInfo, minDimension = 80): boolean {
  return size.width < minDimension || size.height < minDimension;
}
