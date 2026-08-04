/**
 * Turning what someone typed into the word that reaches the Device.
 *
 * The exact inverse of `valueFormat.ts`, and deliberately paired with it: a Pane
 * shows a value in its chosen notation, so typing into that field means typing
 * in that notation. Any other rule makes the screen a trap — a column reading
 * `0x0000002A` where typing `2A` sets the register to forty-two thousand.
 *
 * Everything here returns a **signed** 32-bit word, because that is what the
 * transport takes: `write_register` is declared `value: i32`, so an unsigned
 * reading handed over as-is is refused at the Tauri boundary and never reaches
 * the board — reported, but as a message about types, a long way from the field
 * that caused it.
 */

import { DataForm } from '../maps/mapParser';
import { floatToInt32, int32ToFloat } from '../utils/floatConversion';
import type { DisplayFormat } from './valueFormat';

export type ParsedValue =
  | { readonly ok: true; readonly raw: number }
  | { readonly ok: false; readonly error: string };

const MAX_INT32 = 2147483647;
const MIN_INT32 = -2147483648;
const MAX_UINT32 = 4294967295;

const failed = (error: string): ParsedValue => ({ ok: false, error });

/** Reduces a 32-bit word to the signed reading the transport is declared with. */
const asWord = (value: number): ParsedValue => ({ ok: true, raw: value | 0 });

/** Whether the Map's type means this entry carries a signed reading. */
function isSigned(type: DataForm): boolean {
  return type === DataForm.INT;
}

/**
 * Decimal digits only, with an optional sign, point and exponent.
 *
 * `Number()` is not used to decide this. It reads `0x1F` as 31 and `0b11` as 3,
 * so a Pane showing a decimal column would silently accept a hexadecimal value
 * and write a different number than the one on screen. A Pane has an explicit
 * format for that; a decimal field means decimal.
 */
const DECIMAL_BODY = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function parseDecimal(input: string, type: DataForm): ParsedValue {
  if (!DECIMAL_BODY.test(input)) {
    return failed(type === DataForm.FLOAT ? 'Enter a number' : 'Enter a whole number');
  }

  const value = Number(input);

  if (type === DataForm.FLOAT) {
    if (!Number.isFinite(value)) return failed('Enter a number');
    const raw = floatToInt32(value);
    // Rounding to the nearest float is expected; overflowing to infinity is a
    // value the entry cannot carry at all.
    if (!Number.isFinite(int32ToFloat(raw))) return failed('Too large for a 32-bit float');
    return asWord(raw);
  }

  if (!Number.isInteger(value)) {
    // Truncating silently would write a value nobody asked for and look like it
    // worked, which is the whole failure mode this module exists to prevent.
    return failed('This entry holds whole numbers only');
  }

  if (isSigned(type)) {
    if (value < MIN_INT32 || value > MAX_INT32) {
      return failed(`Enter a value between ${MIN_INT32} and ${MAX_INT32}`);
    }
  } else if (value < 0 || value > MAX_UINT32) {
    return failed(`Enter a value between 0 and ${MAX_UINT32}`);
  }

  return asWord(value);
}

/** `0x` prefix optional, since that is how the same value is displayed. */
const HEX_BODY = /^(?:0[xX])?([0-9a-fA-F]+)$/;

/** `0b` prefix and nibble spacing both optional, for the same reason. */
const BINARY_BODY = /^(?:0[bB])?([01]+)$/;

function parseBase(input: string, pattern: RegExp, base: 16 | 2, digits: number): ParsedValue {
  const match = pattern.exec(input);
  if (!match) {
    return failed(base === 16 ? 'Enter hexadecimal digits (0-9, A-F)' : 'Enter binary digits (0 or 1)');
  }

  const body = match[1].replace(/^0+(?=.)/, '');
  if (body.length > digits) return failed(`A value is ${digits} ${base === 16 ? 'digits' : 'bits'} at most`);

  return asWord(Number.parseInt(body, base));
}

/**
 * The word a typed value means, in this entry's type and this Pane's notation.
 *
 * Hexadecimal and binary are read as the raw word whatever the Map's type says:
 * a Pane switched to either is working in raw words, and a float entry's field
 * shows its bit pattern there — so that is what typing into it means. Only the
 * decimal reading is type-dependent, which is exactly where the type matters.
 */
export function parseEntryValue(
  input: string,
  type: DataForm,
  format: DisplayFormat
): ParsedValue {
  const trimmed = input.trim();
  if (trimmed === '') return failed('Enter a value');

  switch (format) {
    case 'hexadecimal':
      return parseBase(trimmed, HEX_BODY, 16, 8);
    case 'binary':
      // Spaces group the nibbles on screen, so the text being edited contains
      // them; refusing them would make the displayed value unwritable.
      return parseBase(trimmed.replace(/\s+/g, ''), BINARY_BODY, 2, 32);
    default:
      return parseDecimal(trimmed, type);
  }
}
