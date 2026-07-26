export type WriteFormat = 'decimal' | 'hex' | 'binary';

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * Parse a user-entered string according to the configured write format.
 * Accepts optional 0x / 0b prefixes regardless of format setting.
 */
export function parseWriteInput(raw: string, format: WriteFormat): { ok: true; value: number } | { ok: false; error: string } {
  const s = raw.trim();
  if (s === '') return { ok: false, error: 'Value is required' };

  // Detect explicit prefix overrides
  if (s.startsWith('0x') || s.startsWith('0X')) {
    const n = parseInt(s.slice(2), 16);
    if (isNaN(n)) return { ok: false, error: 'Invalid hex value (expected digits 0-9 and A-F)' };
    return { ok: true, value: n };
  }
  if (s.startsWith('0b') || s.startsWith('0B')) {
    const n = parseInt(s.slice(2), 2);
    if (isNaN(n)) return { ok: false, error: 'Invalid binary value (expected digits 0 and 1)' };
    return { ok: true, value: n };
  }

  switch (format) {
    case 'hex': {
      if (!/^[0-9a-fA-F]+$/.test(s)) {
        return { ok: false, error: 'Invalid hex value — use digits 0-9 and letters A-F (or prefix with 0x)' };
      }
      return { ok: true, value: parseInt(s, 16) };
    }
    case 'binary': {
      if (!/^[01]+$/.test(s)) {
        return { ok: false, error: 'Invalid binary value — use only 0 and 1 (or prefix with 0b)' };
      }
      return { ok: true, value: parseInt(s, 2) };
    }
    case 'decimal':
    default: {
      const n = Number(s);
      if (isNaN(n)) return { ok: false, error: 'Invalid number' };
      return { ok: true, value: n };
    }
  }
}

/**
 * Filter a keystroke/paste so only valid characters for the format are accepted.
 * Returns the filtered string (unchanged if valid, stripped of invalid chars).
 * Call this in onChange before setting state.
 *
 * Rules per format:
 *  decimal — digits, one leading minus, one decimal point, 'e'/'E' for scientific notation
 *  hex     — digits 0-9, A-F/a-f, with optional leading "0x"/"0X" prefix
 *  binary  — digits 0 and 1 only, with optional leading "0b"/"0B" prefix
 */
export function filterWriteInput(value: string, format: WriteFormat): string {
  if (value === '') return value;

  switch (format) {
    case 'hex': {
      // Allow "0x" / "0X" prefix followed by hex digits
      if (value.startsWith('0x') || value.startsWith('0X')) {
        const prefix = value.slice(0, 2);
        const rest = value.slice(2).replace(/[^0-9a-fA-F]/g, '');
        return prefix + rest;
      }
      return value.replace(/[^0-9a-fA-F]/g, '');
    }
    case 'binary': {
      // Allow "0b" / "0B" prefix followed by binary digits
      if (value.startsWith('0b') || value.startsWith('0B')) {
        const prefix = value.slice(0, 2);
        const rest = value.slice(2).replace(/[^01]/g, '');
        return prefix + rest;
      }
      return value.replace(/[^01]/g, '');
    }
    case 'decimal':
    default: {
      // Allow digits, one leading minus, one dot, e/E for scientific notation
      // with an optional +/- sign on the exponent (e.g. "-1.5e-3")
      let result = '';
      let hasMinus = false;
      let hasDot = false;
      let hasE = false;
      let afterE = false;
      for (const ch of value) {
        if (ch === '-' || ch === '+') {
          if (afterE) { afterE = false; result += ch; }
          else if (ch === '-' && result === '' && !hasMinus) { hasMinus = true; result += ch; }
        } else if (ch === '.') {
          if (!hasDot && !hasE) { hasDot = true; result += ch; }
        } else if (ch === 'e' || ch === 'E') {
          if (!hasE && result !== '' && result !== '-') { hasE = true; afterE = true; result += ch; }
        } else if (ch >= '0' && ch <= '9') {
          afterE = false;
          result += ch;
        }
      }
      return result;
    }
  }
}

/**
 * Check whether `value` is a valid multiple of `step`, with float-precision tolerance
 * (e.g. 0.3 / 0.1 === 2.9999999999999996 in JS, not 3 — a plain `%` check would wrongly reject it).
 * No step configured (undefined or <= 0) means no constraint — any value is valid.
 */
export function isValidStep(value: number, step: number | undefined): boolean {
  if (step === undefined || step <= 0) return true;
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
}

/** Short helper text shown below the input field. */
export function formatInputHint(format: WriteFormat, min?: number, max?: number): string {
  const rangeStr = min !== undefined && max !== undefined ? ` · Range: ${min}–${max}` : '';
  switch (format) {
    case 'hex':    return `Hex (e.g. 1A2B or 0x1A2B)${rangeStr}`;
    case 'binary': return `Binary (e.g. 1010 or 0b1010)${rangeStr}`;
    default:       return `Decimal or scientific (e.g. 1.5 or 1.5e-3)${rangeStr}`;
  }
}
