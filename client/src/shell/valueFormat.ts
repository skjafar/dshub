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
import { int32ToFloat } from '../utils/floatConversion';
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
