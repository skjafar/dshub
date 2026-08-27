/**
 * A binding's captured identity: what it was actually bound to, alongside the
 * address that remains the only value ever used for a device read, write or
 * poll. `.scratch/map-binding-drift/spec.md`'s whole premise is that an
 * address is not stable data — it is recomputed from an entry's position
 * every time the Map is edited — so a stored address alone cannot say whether
 * a Widget or Plot series still means what it did when it was bound. This
 * snapshot is what a later edit is diffed against.
 */

import { DataForm } from '../maps/mapParser';
import type { MapEntry } from '../maps/mapParser';
import type { AddressSpace } from './addressSpace';

export interface BindingSnapshot {
  readonly name: string;
  readonly type: DataForm;
  readonly isArray: boolean;
  readonly arraySize?: number;
}

/** Current entries for every Address Space, as a binding's own `space` field selects between — what a resolver or a backfill pass checks a snapshot against. */
export type EntriesBySpace = Readonly<Record<AddressSpace, readonly MapEntry[]>>;

/** Captures one entry's identity at the moment a binding is made. */
export function snapshotFromEntry(entry: MapEntry): BindingSnapshot {
  return { name: entry.name, type: entry.type, isArray: entry.isArray, arraySize: entry.arraySize };
}

/**
 * Fills in a snapshot missing because a binding was saved before this feature
 * shipped, from whatever entry currently sits at `address` — treating the
 * current Map as a trusted baseline, per spec.md's "Migration of existing
 * data". A snapshot that is already present, real or explicitly `null` (a
 * prior backfill that found nothing), is returned unchanged: `undefined` is
 * the only value that means "never backfilled."
 */
export function backfillSnapshot(
  existing: BindingSnapshot | null | undefined,
  address: number,
  entries: readonly MapEntry[]
): BindingSnapshot | null {
  if (existing !== undefined) return existing;
  const entry = entries.find(candidate => candidate.address === address);
  return entry ? snapshotFromEntry(entry) : null;
}

const VALID_DATA_FORMS: ReadonlySet<string> = new Set(Object.values(DataForm));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `undefined` (a binding saved before this feature shipped) and `null` (a
 * backfill that found nothing) are both accepted — see {@link BindingSnapshot}'s
 * own doc comment — so a stored binding missing this field entirely, or
 * carrying it as `null`, is not corruption.
 */
export function isValidBindingSnapshot(value: unknown): value is BindingSnapshot | null | undefined {
  if (value === undefined || value === null) return true;
  if (!isPlainObject(value)) return false;
  if (typeof value.name !== 'string' || value.name === '') return false;
  if (typeof value.type !== 'string' || !VALID_DATA_FORMS.has(value.type)) return false;
  if (typeof value.isArray !== 'boolean') return false;
  if (value.arraySize !== undefined && typeof value.arraySize !== 'number') return false;
  return true;
}
