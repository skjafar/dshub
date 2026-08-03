/**
 * Narrowing a Map down to the entries someone is looking for.
 *
 * A Map runs to hundreds of entries and a Pane shows one screen of them, so the
 * filter is how the Pane is actually used rather than a convenience on top of
 * it. Two readings of a query are supported because an Engineer arrives with
 * either: a name they half remember, or an address from a datasheet.
 */

import type { MapEntry } from '../maps/mapParser';

/** `0x` followed by hex digits, and nothing else. */
const HEX_LITERAL = /^0x[0-9a-f]+$/i;

/** Decimal digits, and nothing else. */
const DECIMAL_LITERAL = /^\d+$/;

/**
 * The address a query names, or null when it names none.
 *
 * Hexadecimal must carry its `0x` prefix. Without it, `2A` is both a plausible
 * address and a plausible fragment of an entry name, and picking either reading
 * makes the other unreachable — so the prefix is what separates the two rather
 * than a guess about which the user meant.
 */
function addressIn(query: string): number | null {
  if (HEX_LITERAL.test(query)) return Number.parseInt(query.slice(2), 16);
  if (DECIMAL_LITERAL.test(query)) return Number.parseInt(query, 10);
  return null;
}

/**
 * Whether one entry answers a query.
 *
 * An address matches exactly, not as a substring. Typing an address is asking to
 * go to it, and a substring match would return 420 alongside the 42 that was
 * asked for — leaving the entry actually wanted somewhere in a list. A query of
 * plain digits is still tried against names as well, since `AXIS_1_FAULT` is a
 * name someone types `1` to find.
 */
function matchesQuery(entry: MapEntry, query: string): boolean {
  const trimmed = query.trim();
  if (trimmed === '') return true;

  if (entry.name.toLowerCase().includes(trimmed.toLowerCase())) return true;

  const address = addressIn(trimmed);
  return address !== null && address === entry.address;
}

/** The entries answering a query, in the Map's own order. */
export function filterEntries(
  entries: readonly MapEntry[],
  query: string
): readonly MapEntry[] {
  if (query.trim() === '') return entries;
  return entries.filter(entry => matchesQuery(entry, query));
}
