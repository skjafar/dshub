/**
 * Float conversion utilities for IEEE 754 32-bit float <-> int32 conversion
 *
 * Floats are transmitted as 32-bit integers (IEEE 754 representation) over the protocol.
 * These utilities convert between the integer representation and actual float values.
 */

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
 * Format a float value for display with appropriate precision
 * @param value - The float value to format
 * @param precision - Number of decimal places (default: 6)
 * @returns Formatted string
 */
export function formatFloat(value: number, precision: number = 6): string {
  // Remove trailing zeros and unnecessary decimal point
  return value.toFixed(precision).replace(/\.?0+$/, '');
}
