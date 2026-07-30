/**
 * Float conversion utilities for IEEE 754 32-bit float <-> int32 conversion
 *
 * Floats are transmitted as 32-bit integers (IEEE 754 representation) over the protocol.
 * These utilities convert between the integer representation and actual float values.
 */
import { needsScientific } from './numberFormat';

/**
 * Convert a 32-bit integer (IEEE 754 representation) to a float
 * @param int32Value - The integer representation of the float
 * @returns The actual float value
 */
export function int32ToFloat(int32Value: number): number {
  // Create a buffer to hold the int32 value
  const buffer = new ArrayBuffer(4);
  const intView = new Int32Array(buffer);
  const floatView = new Float32Array(buffer);

  // Write the int32 value
  intView[0] = int32Value;

  // Read it back as a float
  return floatView[0];
}

/**
 * Convert a float to its 32-bit integer representation (IEEE 754)
 * @param floatValue - The float value
 * @returns The integer representation
 */
export function floatToInt32(floatValue: number): number {
  // Create a buffer to hold the float value
  const buffer = new ArrayBuffer(4);
  const floatView = new Float32Array(buffer);
  const intView = new Int32Array(buffer);

  // Write the float value
  floatView[0] = floatValue;

  // Read it back as int32
  return intView[0];
}

/**
 * Format a float at full working precision, with trailing zeros stripped.
 *
 * This is the **editing** precision, not the display precision: the thumbwheel
 * uses it to decide how many fraction digits a value starts with, so narrowing it
 * would silently truncate values the user is editing. For showing a value to the
 * user, use `formatFractional` from `numberFormat.ts`.
 *
 * @param value - The float value to format
 * @param precision - Number of decimal places (default: 6)
 */
export function formatFloat(value: number, precision: number = 6): string {
  // Remove trailing zeros and unnecessary decimal point
  return value.toFixed(precision).replace(/\.?0+$/, '');
}

/**
 * True when a float's magnitude is small enough that fixed-decimal notation
 * would round it away to 0 or lose meaningful precision. Callers use this to
 * force scientific notation regardless of any user-configured display toggle.
 *
 * Delegates to `needsScientific` so the threshold can never drift from the
 * decimal precision the rest of the UI displays.
 */
export function isTinyFloat(value: number): boolean {
  return needsScientific(value);
}
