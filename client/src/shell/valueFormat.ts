/**
 * How a 32-bit Device word is read on screen.
 *
 * Every value that crosses the link is one 32-bit word. What it *means* comes
 * from two places that must not be confused: the Map's type says how to decode
 * the bits, and the Pane's display format says which notation to show them in.
 * Keeping both in one module is what stops a surface deciding half of it —
 * showing a float's raw word as a decimal integer, or a signed register as an
 * unsigned one, are the two ways this goes wrong, and both look like a plausible
 * number rather than an error.
 */

import { DataForm } from '../maps/mapParser';
import { floatToInt32, int32ToFloat } from '../utils/floatConversion';
import { formatFractional } from '../utils/numberFormat';

/** The notations a Pane can be switched between. */
export type DisplayFormat = 'decimal' | 'hexadecimal' | 'binary';

export const DISPLAY_FORMATS: readonly DisplayFormat[] = [
  'decimal',
  'hexadecimal',
  'binary',
];

/**
 * `0x` and eight uppercase digits, always.
 *
 * Zero-padded rather than trimmed because these sit in a column: a value that
 * shortens from `0x0000002A` to `0x2A` as it changes moves every digit beside
 * it, which is the thing tabular figures exist to prevent.
 */
export function toHex32(raw: number): string {
  return `0x${(raw >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

/**
 * An address in hexadecimal, four digits.
 *
 * Narrower than a value: the Map parser refuses an address above 65535, so a
 * full 32-bit word would be four leading zeroes on every entry — padding that
 * says nothing and pushes the digits that do out of a scanning eye's way.
 */
export function toHexAddress(address: number): string {
  return `0x${(address >>> 0).toString(16).toUpperCase().padStart(4, '0')}`;
}

/** All thirty-two bits, in nibbles. Same width for every value, for the same reason. */
export function toBinary32(raw: number): string {
  const bits = (raw >>> 0).toString(2).padStart(32, '0');
  return (bits.match(/.{4}/g) ?? []).join(' ');
}

/** The decimal reading the Map's type asks for. */
function toDecimal(raw: number, type: DataForm): string {
  switch (type) {
    case DataForm.FLOAT:
      return formatFractional(int32ToFloat(raw));
    case DataForm.INT:
      return (raw | 0).toString(10);
    default:
      // uint32_t and hex are both unsigned words. Reading either as signed turns
      // a large count into a negative one.
      return (raw >>> 0).toString(10);
  }
}

/** One word, in the notation this Pane is set to. */
export function formatEntryValue(
  raw: number,
  type: DataForm,
  format: DisplayFormat
): string {
  switch (format) {
    case 'hexadecimal':
      // Deliberately the raw word even for a float entry: switching a Pane to
      // hexadecimal is asking what is actually on the wire, and hex digits of a
      // decoded float would answer a question nobody asked.
      return toHex32(raw);
    case 'binary':
      return toBinary32(raw);
    default:
      return toDecimal(raw, type);
  }
}

/**
 * The shortest decimal text that decodes back to exactly this float.
 *
 * Display rounds to three places, which is right for reading a column and wrong
 * for seeding a field someone is about to commit: a register holding 3.14159274
 * shows as `3.142`, and a field started from that writes 3.142 to the Device the
 * moment Enter is pressed on a value nobody meant to change. Digits are added
 * until the text survives the round trip, so the field starts from the value the
 * Device actually holds — and stays as short as that allows.
 */
function exactFloatText(value: number): string {
  // Negative zero is a distinct word, and every rounding route below renders it
  // as "0" — which writes back the positive one.
  if (Object.is(value, -0)) return '-0';

  const target = floatToInt32(value);
  // Nine significant digits always suffice for a 32-bit float; the loop stops at
  // the first width that does, so whole numbers stay whole.
  for (let digits = 1; digits <= 9; digits += 1) {
    const text = value.toPrecision(digits);
    if (floatToInt32(Number(text)) === target) return String(Number(text));
  }
  return String(value);
}

/**
 * The text a write field starts from.
 *
 * Distinct from {@link formatEntryValue}, which is display: hexadecimal and
 * binary already carry every bit, but a decimal float has to be seeded at full
 * precision rather than at the three places a column is read in.
 */
export function editableEntryValue(
  raw: number,
  type: DataForm,
  format: DisplayFormat
): string {
  if (format === 'decimal' && type === DataForm.FLOAT) {
    return exactFloatText(int32ToFloat(raw));
  }
  return formatEntryValue(raw, type, format);
}

/** Every reading of one word, which is what the Inspector states at once. */
export interface ValueDecoding {
  /** The reading the entry's own type calls for. */
  readonly decimal: string;
  readonly hexadecimal: string;
  readonly binary: string;
  /** The same bits read as IEEE-754, whatever the Map says the type is. */
  readonly float: string;
}

/**
 * Decodes one word every way at once.
 *
 * The float reading is offered for integer-typed entries too. An Engineer who
 * suspects a register is carrying a float the Map calls an int should be able to
 * see that reading without editing the Map to find out — which is a change to
 * the Device's definition made in order to ask a question.
 */
export function decodeValue(raw: number, type: DataForm): ValueDecoding {
  return {
    decimal: toDecimal(raw, type),
    hexadecimal: toHex32(raw),
    binary: toBinary32(raw),
    float: formatFractional(int32ToFloat(raw)),
  };
}
