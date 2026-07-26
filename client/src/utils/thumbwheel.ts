import { MIN_INT32, MAX_INT32, MAX_UINT32 } from './dataTableUtils';
import { WriteFormat } from './writeInputParse';
import { formatFloat } from './floatConversion';

export type ThumbwheelFormat = 'decimalInt' | 'decimalFloat' | 'hex' | 'binary';

/** Matches formatFloat()'s default precision, so elastic fraction growth never exceeds it. */
export const FLOAT_MAX_FRACTION_DIGITS = 6;

export interface DigitPosition {
  /** Offset of this digit character within the display string. */
  charIndex: number;
  /** Place-value exponent (2 = hundreds, 0 = ones, -1 = tenths, ...). */
  weight: number;
  side: 'int' | 'frac';
}

export function resolveThumbwheelFormat(writeFormat: WriteFormat, isFloat: boolean): ThumbwheelFormat {
  if (writeFormat === 'hex') return 'hex';
  if (writeFormat === 'binary') return 'binary';
  return isFloat ? 'decimalFloat' : 'decimalInt';
}

/**
 * Ordered (most- to least-significant) list of editable digit positions in a
 * formatted display string, skipping sign / decimal point / 0x / 0b prefix chars.
 */
export function getDigitPositions(display: string, format: ThumbwheelFormat): DigitPosition[] {
  const positions: DigitPosition[] = [];

  if (format === 'hex' || format === 'binary') {
    const hasPrefix = format === 'hex' ? /^0x/i.test(display) : /^0b/i.test(display);
    const start = hasPrefix ? 2 : 0;
    const digits = display.slice(start);
    const n = digits.length;
    for (let i = 0; i < n; i++) {
      positions.push({ charIndex: start + i, weight: n - 1 - i, side: 'int' });
    }
    return positions;
  }

  const signLen = display.startsWith('-') ? 1 : 0;
  const dotIndex = display.indexOf('.');

  if (format === 'decimalInt' || dotIndex === -1) {
    const digits = display.slice(signLen);
    const n = digits.length;
    for (let i = 0; i < n; i++) {
      positions.push({ charIndex: signLen + i, weight: n - 1 - i, side: 'int' });
    }
    return positions;
  }

  const intPart = display.slice(signLen, dotIndex);
  const fracPart = display.slice(dotIndex + 1);

  for (let i = 0; i < intPart.length; i++) {
    positions.push({ charIndex: signLen + i, weight: intPart.length - 1 - i, side: 'int' });
  }
  for (let j = 0; j < fracPart.length; j++) {
    positions.push({ charIndex: dotIndex + 1 + j, weight: -(j + 1), side: 'frac' });
  }
  return positions;
}

export function getPlaceValue(weight: number, format: ThumbwheelFormat): number {
  const base = format === 'hex' ? 16 : format === 'binary' ? 2 : 10;
  return Math.pow(base, weight);
}

export function getDefaultBounds(format: ThumbwheelFormat): { min: number; max: number } {
  if (format === 'hex' || format === 'binary') return { min: 0, max: MAX_UINT32 };
  return { min: MIN_INT32, max: MAX_INT32 };
}

/** Elastic starting decimal-digit count, matching formatFloat()'s trailing-zero-stripped convention. */
export function initialFractionDigits(value: number): number {
  const s = formatFloat(value, FLOAT_MAX_FRACTION_DIGITS);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

export function formatForThumbwheel(value: number, format: ThumbwheelFormat, fractionDigits?: number): string {
  if (format === 'hex' || format === 'binary') {
    const u = value >>> 0;
    return format === 'hex' ? `0x${u.toString(16).toUpperCase()}` : `0b${u.toString(2)}`;
  }
  if (format === 'decimalFloat') {
    return value.toFixed(fractionDigits ?? 0);
  }
  return Math.round(value).toString(10);
}

/** Index of the digit position closest to charIndex; ties favor the more-significant (earlier) digit. -1 if empty. */
export function findNearestDigitPosition(positions: DigitPosition[], charIndex: number): number {
  if (positions.length === 0) return -1;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const dist = Math.abs(positions[i].charIndex - charIndex);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export interface ThumbwheelStepResult {
  value: number;
  display: string;
  selectedIndex: number;
  clamped: boolean;
}

/**
 * Odometer-style Up/Down step: adds/subtracts the selected digit's place value
 * from the whole number, reformats, and relocates the same-weight digit in the
 * new string (handles carries/borrows that change the digit count, e.g. 99->100).
 */
export function applyDigitStep(
  currentValue: number,
  display: string,
  format: ThumbwheelFormat,
  selectedPositionIndex: number,
  direction: 1 | -1,
  bounds: { min: number; max: number },
  fractionDigits?: number
): ThumbwheelStepResult {
  const positions = getDigitPositions(display, format);
  if (positions.length === 0) {
    return { value: currentValue, display, selectedIndex: -1, clamped: false };
  }

  const idx = Math.min(Math.max(selectedPositionIndex, 0), positions.length - 1);
  const target = positions[idx];
  const delta = getPlaceValue(target.weight, format) * direction;

  let rawNew = currentValue + delta;
  if (format === 'decimalFloat') {
    rawNew = Number(rawNew.toFixed(fractionDigits ?? 0));
  }

  const value = Math.min(bounds.max, Math.max(bounds.min, rawNew));
  const clamped = value !== rawNew;

  const newDisplay = formatForThumbwheel(value, format, fractionDigits);
  const newPositions = getDigitPositions(newDisplay, format);

  let selectedIndex = newPositions.findIndex((p) => p.weight === target.weight && p.side === target.side);
  if (selectedIndex === -1) selectedIndex = 0;

  return { value, display: newDisplay, selectedIndex, clamped };
}

export interface NavigateResult {
  selectedIndex: number;
  display: string;
  fractionDigits: number;
  changed: boolean;
}

/**
 * Shift+Left/Right digit-highlight navigation. Moves within existing digits;
 * clamps (no-op) past the leftmost digit; for decimalFloat, grows one fractional
 * digit at a time past the rightmost shown digit (value unchanged) up to the cap.
 */
export function navigateDigit(
  display: string,
  format: ThumbwheelFormat,
  currentSelectedIndex: number,
  direction: 1 | -1,
  value: number,
  fractionDigits: number,
  maxFractionDigits: number = FLOAT_MAX_FRACTION_DIGITS
): NavigateResult {
  const positions = getDigitPositions(display, format);
  const noop: NavigateResult = { selectedIndex: currentSelectedIndex, display, fractionDigits, changed: false };
  if (positions.length === 0) return noop;

  const newIndex = currentSelectedIndex + direction;

  if (newIndex >= 0 && newIndex < positions.length) {
    return { selectedIndex: newIndex, display, fractionDigits, changed: true };
  }

  if (newIndex < 0) return noop;

  if (format !== 'decimalFloat') return noop;
  if (fractionDigits >= maxFractionDigits) return noop;

  const newFractionDigits = fractionDigits + 1;
  const newDisplay = formatForThumbwheel(value, 'decimalFloat', newFractionDigits);
  const newPositions = getDigitPositions(newDisplay, format);
  return {
    selectedIndex: newPositions.length - 1,
    display: newDisplay,
    fractionDigits: newFractionDigits,
    changed: true,
  };
}
