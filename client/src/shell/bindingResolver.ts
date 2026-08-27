/**
 * The single decision point drift is actually resolved at
 * (`.scratch/map-binding-drift/spec.md`'s "Per-binding resolver (seam)").
 * Backs both a Widget or Plot's own live "needs review" status (checked
 * against the currently active Map) and the bulk review built when a Map
 * edit is saved (checked against the Map about to be committed) — the same
 * classification either way, over a plain snapshot and entry list. No I/O, no
 * React, no dependency on any specific Widget or Plot type.
 */

import type { MapEntry } from '../maps/mapParser';
import type { BindingSnapshot } from './bindingIdentity';

export type BindingResolution =
  | { readonly kind: 'unchanged' }
  /** The snapshot's name is found at a different address — `to` is the matching entry, offered as a re-point suggestion. */
  | { readonly kind: 'moved'; readonly to: MapEntry }
  /** The snapshot's name does not appear anywhere in the given entries, regardless of what now occupies its old address. */
  | { readonly kind: 'removed' }
  /** Name and address both still match, but type, array-ness or array size differs from the snapshot. */
  | { readonly kind: 'type-changed' };

function sameShape(snapshot: BindingSnapshot, entry: MapEntry): boolean {
  return snapshot.type === entry.type && snapshot.isArray === entry.isArray && snapshot.arraySize === entry.arraySize;
}

/**
 * Classifies one binding's captured snapshot against a set of current Map
 * entries for the relevant Address Space.
 *
 * A name matching more than one entry cannot occur — Map names are already
 * unique within a space (enforced by `mapEditorDraft.ts`'s own collision
 * check) — so this asserts rather than silently picking one, per ticket 02's
 * own checklist.
 */
export function resolveBinding(
  snapshot: BindingSnapshot,
  address: number,
  entries: readonly MapEntry[]
): BindingResolution {
  const matches = entries.filter(candidate => candidate.name === snapshot.name);
  if (matches.length > 1) {
    throw new Error(`Map entry name "${snapshot.name}" is not unique — found ${matches.length} matches.`);
  }

  const byName = matches[0];
  if (byName === undefined) return { kind: 'removed' };
  if (byName.address !== address) return { kind: 'moved', to: byName };
  return sameShape(snapshot, byName) ? { kind: 'unchanged' } : { kind: 'type-changed' };
}

/**
 * Whether a binding needs review — the one check every live call site
 * (`useWidgetReading`, `ButtonWidget`, `PlotPane`'s claim effect) actually
 * needs, over whichever entries the caller's own Address Space currently
 * holds.
 *
 * Deliberately does not require a caller to first find an entry at
 * `address` before calling this: `mapParser.ts` assigns addresses
 * sequentially with no gaps, so deleting or resizing an earlier entry
 * shifts every later one's address down and leaves the old address
 * genuinely vacant — a routine "moved" outcome, not a rare edge case. A
 * caller that gated on "something is at this address" first would miss
 * exactly that case and fall back to a plain "not found" instead of
 * "needs review". `false` when there is no snapshot to check at all —
 * nothing to diff, so nothing to flag.
 */
export function isBindingDrifted(
  snapshot: BindingSnapshot | null | undefined,
  address: number,
  entries: readonly MapEntry[]
): boolean {
  if (!snapshot) return false;
  return resolveBinding(snapshot, address, entries).kind !== 'unchanged';
}
