import { DataForm, MapEntry } from '../maps/mapParser';
import { int32ToFloat, floatToInt32, formatFloat, isTinyFloat } from './floatConversion';
import { filterWriteInput } from './writeInputParse';

// Shared constants
export const MIN_INT32 = -2147483648;
export const MAX_INT32 = 2147483647;
export const MAX_UINT32 = 4294967295;

// Check if the connection allows write operations
export function canWriteToDevice(connection: { connected: boolean; interface: string; controlState: number } | null): boolean {
  return !!connection?.connected && (
    (connection.interface === 'TCP' && connection.controlState === 1) ||
    (connection.interface === 'UDP' && connection.controlState === 2)
  );
}

// Format a data value based on its map entry type
export function formatDataValue(value: number | null | undefined, mapEntry: MapEntry | undefined): string {
  if (value === null || value === undefined) {
    return '---';
  }

  if (mapEntry?.type === 'float') {
    const floatValue = int32ToFloat(value);
    return isTinyFloat(floatValue) ? floatValue.toExponential(4) : formatFloat(floatValue);
  }

  if (mapEntry?.showAsHex) {
    return `0x${value.toString(16).toUpperCase()}`;
  }
  return value.toString();
}

// Convert a raw register value (as received over the wire) into the numeric
// value it should be plotted/aggregated as, based on its map entry type.
// Floats are decoded from their IEEE 754 bit pattern; hex values are shown as
// unsigned; signed/unsigned integers pass through unchanged.
export function getPlotValue(value: number, mapEntry: MapEntry | undefined): number {
  if (mapEntry?.type === DataForm.FLOAT) {
    return int32ToFloat(value);
  }
  if (mapEntry?.showAsHex) {
    return value >>> 0;
  }
  return value;
}

// Inverse of getPlotValue: encode a real-world value (e.g. user-entered 3.14) into
// the raw wire value expected by writeRegister/writeParameter. Floats are encoded to
// their IEEE 754 bit pattern; everything else is sent through unchanged.
export function getWireValue(value: number, mapEntry: MapEntry | undefined): number {
  if (mapEntry?.type === DataForm.FLOAT) {
    return floatToInt32(value);
  }
  return value;
}

/**
 * Filter keystroke input based on the map entry's data type.
 * - float → decimal (digits, minus, dot, scientific notation)
 * - showAsHex → hex (0-9, A-F, optional 0x prefix)
 * - everything else → decimal integers (digits + optional leading minus)
 */
export function filterWriteValueFromMap(value: string, mapEntry: MapEntry | undefined): string {
  if (mapEntry?.type === 'float') return filterWriteInput(value, 'decimal');
  if (mapEntry?.showAsHex) return filterWriteInput(value, 'hex');
  // Integer decimal: digits and optional leading minus only
  return filterWriteInput(value, 'decimal');
}

// Parse a string value for writing, handling float/hex/decimal based on map entry type
export function parseWriteValue(valueStr: string, mapEntry: MapEntry | undefined): { value: number; error?: string } | { value: null; error: string } {
  let parsedValue: number;

  if (mapEntry?.type === 'float') {
    const floatValue = parseFloat(valueStr);
    if (isNaN(floatValue)) {
      return { value: null, error: 'Invalid float value' };
    }
    parsedValue = floatToInt32(floatValue);
  } else if (mapEntry?.showAsHex) {
    parsedValue = parseInt(valueStr, 16);
  } else {
    parsedValue = parseInt(valueStr, 10);
  }

  if (isNaN(parsedValue)) {
    return { value: null, error: 'Invalid numeric value' };
  }

  // Validate range for safety-critical applications
  if (mapEntry?.type === DataForm.UINT) {
    if (parsedValue < 0 || parsedValue > MAX_UINT32) {
      return { value: null, error: `Value must be between 0 and ${MAX_UINT32.toLocaleString()} (uint32_t)` };
    }
  } else {
    if (parsedValue < MIN_INT32 || parsedValue > MAX_INT32) {
      return { value: null, error: `Value must be between ${MIN_INT32.toLocaleString()} and ${MAX_INT32.toLocaleString()} (int32_t)` };
    }
  }

  return { value: parsedValue };
}
