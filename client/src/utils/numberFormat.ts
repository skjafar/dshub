/**
 * Display formatting for numeric device values.
 *
 * One rule, applied wherever a value is shown to the user:
 *
 *   - fractional values render with {@link VALUE_DECIMALS} decimal places;
 *   - a non-zero value too small to survive that rounding renders in scientific
 *     notation instead of collapsing to `0.000`.
 *
 * This is display only. Editing paths (the thumbwheel, write parsing) keep full
 * precision via `formatFloat` — truncating a value the user is editing would lose
 * data, not just detail.
 */

/** Decimal places shown for a fractional value. */
export const VALUE_DECIMALS = 3;

/**
 * Mantissa digits in scientific notation. Kept wider than {@link VALUE_DECIMALS}
 * because scientific notation is reached precisely when the magnitude is small
 * and every remaining significant digit matters.
 */
export const SCIENTIFIC_DIGITS = 4;

/** Smallest magnitude representable at `decimals` places without rounding to zero. */
export function smallestRepresentable(decimals: number = VALUE_DECIMALS): number {
  return Math.pow(10, -decimals);
}

/**
 * True when fixed-point notation at `decimals` would round a non-zero value away
 * to zero, so scientific notation must be used instead.
 */
export function needsScientific(value: number, decimals: number = VALUE_DECIMALS): boolean {
  if (!Number.isFinite(value) || value === 0) return false;
  return Math.abs(value) < smallestRepresentable(decimals);
}

export interface FractionalFormatOptions {
  /** Override the decimal places. Defaults to {@link VALUE_DECIMALS}. */
  decimals?: number;
  /** Force scientific notation regardless of magnitude. */
  scientific?: boolean;
}

/**
 * Formats a fractional value for display.
 *
 * Use this for any value that can have a fractional part — float registers and
 * parameters, and derived figures such as plot statistics. Integer-typed values
 * should be rendered as integers by the caller rather than padded to `N.000`.
 */
export function formatFractional(value: number, options: FractionalFormatOptions = {}): string {
  const { decimals = VALUE_DECIMALS, scientific = false } = options;

  if (!Number.isFinite(value)) return String(value);
  if (scientific || needsScientific(value, decimals)) {
    return value.toExponential(SCIENTIFIC_DIGITS);
  }
  return value.toFixed(decimals);
}

export interface DeviceValueFormatOptions extends FractionalFormatOptions {
  /** True when the value's map entry is a float. */
  isFloat?: boolean;
}

/**
 * Formats a register/parameter value for display.
 *
 * Floats follow the fractional rule. Integers stay integers — padding a uint32
 * counter out to `1234.000` would be noise — unless the widget explicitly
 * configured a decimal count or scientific notation.
 */
export function formatDeviceValue(value: number, options: DeviceValueFormatOptions = {}): string {
  const { isFloat = false, decimals, scientific = false } = options;

  if (!Number.isFinite(value)) return String(value);
  if (isFloat || scientific || decimals !== undefined) {
    return formatFractional(value, { decimals, scientific });
  }
  return value.toString();
}
