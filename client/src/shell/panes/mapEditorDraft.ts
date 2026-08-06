/**
 * Pure edits to a Map Editor's draft entries.
 *
 * `maps/` is frozen (ADR-0003): `mapParser`'s `MapEntry` shape and
 * `mapFileGenerator`'s array-consolidation and address-assignment rules are
 * read here, never changed. What lives here is everything an edit has to get
 * right on top of that — the entry cap, the Read-Only/Read-Write boundary a
 * Register's position in the file encodes, keeping an array's elements
 * together when it moves — as one set of rules to test, rather than each
 * re-derived inline in the Pane that calls them.
 */

import { DataAccessPermit, DataForm } from '../../maps/mapParser';
import type { MapEntry, ValueDescriptor } from '../../maps/mapParser';
import type { EntryMetadata } from '../../types/settings';
import { arrayMove } from '@dnd-kit/sortable';
import { consolidateArrayEntries, getNextAddress, isValidMapEntryName } from '../../utils/mapFileGenerator';

/** Matches the cap `MapEditorPanel` (the legacy editor) has always enforced. */
export const MAX_ENTRIES = 256;

const MIN_ARRAY_SIZE = 1;
const MAX_ARRAY_SIZE = 1000;

/**
 * `kind` rather than a boolean `ok`: this project's TypeScript configuration
 * runs with `strictNullChecks` off (see `CLAUDE.md`), under which a boolean
 * discriminant does not narrow a union at all — every existing discriminated
 * union in this codebase (`SendOutcome`, `WriteOutcome`) already uses a
 * string literal for exactly this reason.
 */
export type DraftResult =
  | { readonly kind: 'ok'; readonly entries: readonly MapEntry[] }
  | { readonly kind: 'error'; readonly error: string };

/** The editable fields of an entry; everything else is carried over from the target. */
export interface EntryEdit {
  readonly name?: string;
  readonly type?: DataForm;
  readonly isArray?: boolean;
  readonly arraySize?: number;
  readonly accessPermit?: DataAccessPermit;
  readonly unit?: string;
  readonly description?: string;
  readonly valueList?: ValueDescriptor[];
}

function baseName(name: string): string {
  return name.replace(/\[\d+\]$/, '');
}

/** Reassigns every entry's address to its position in the list. */
function readdress(entries: readonly MapEntry[]): MapEntry[] {
  return entries.map((entry, index) => ({ ...entry, address: index }));
}

function sortRegistersByAccess(entries: readonly MapEntry[]): MapEntry[] {
  const readOnly = entries.filter(e => e.accessPermit === DataAccessPermit.READ_ONLY);
  const readWrite = entries.filter(e => e.accessPermit === DataAccessPermit.READ_WRITE);
  return [...readOnly, ...readWrite];
}

interface NewEntryData {
  readonly name: string;
  readonly type: DataForm;
  readonly isArray: boolean;
  readonly arraySize?: number;
  readonly accessPermit: DataAccessPermit;
  readonly unit?: string;
  readonly description?: string;
  readonly valueList?: ValueDescriptor[];
}

/** Expands one logical entry into the one or more wire entries it occupies, addressed from `startAddress`. */
function expand(data: NewEntryData, startAddress: number): MapEntry[] {
  if (data.isArray && data.arraySize) {
    const out: MapEntry[] = [];
    for (let i = 0; i < data.arraySize; i++) {
      out.push({
        address: startAddress + i,
        name: `${data.name}[${i}]`,
        type: data.type,
        isArray: true,
        arraySize: data.arraySize,
        accessPermit: data.accessPermit,
        showAsHex: data.type === DataForm.HEX,
        unit: data.unit,
        description: data.description,
        valueList: data.valueList,
      });
    }
    return out;
  }
  return [
    {
      address: startAddress,
      name: data.name,
      type: data.type,
      isArray: false,
      accessPermit: data.accessPermit,
      showAsHex: data.type === DataForm.HEX,
      unit: data.unit,
      description: data.description,
      valueList: data.valueList,
    },
  ];
}

/** Appends a new, uniquely-named entry after the last one. Registers sort read-only ahead of read-write. */
export function addEntry(entries: readonly MapEntry[], isRegisterMap: boolean): DraftResult {
  if (entries.length >= MAX_ENTRIES) {
    return { kind: 'error', error: `Cannot add another entry — ${MAX_ENTRIES} is the maximum.` };
  }

  const prefix = isRegisterMap ? 'NEW_REGISTER' : 'NEW_PARAMETER';
  const used = new Set(entries.map(e => baseName(e.name)));
  let counter = 1;
  let name = `${prefix}_${counter}`;
  while (used.has(name)) {
    counter += 1;
    name = `${prefix}_${counter}`;
  }

  const created: MapEntry = {
    address: getNextAddress([...entries]),
    name,
    type: DataForm.UINT,
    isArray: false,
    accessPermit: isRegisterMap ? DataAccessPermit.READ_ONLY : DataAccessPermit.READ_WRITE,
    showAsHex: false,
  };

  const combined = isRegisterMap ? sortRegistersByAccess([...entries, created]) : [...entries, created];
  return { kind: 'ok', entries: readdress(combined) };
}

/**
 * Replaces one logical entry (every wire entry sharing its base name) with the
 * result of applying `edit` to it, re-addressing everything that follows.
 *
 * Access is not gated by whether this is a Register or a Parameter map:
 * `MapEntriesEditor` only ever offers the Access column for Registers, so
 * `edit.accessPermit` is simply absent for a Parameter's edit rather than
 * needing to be refused here.
 */
export function updateEntry(target: MapEntry, entries: readonly MapEntry[], edit: EntryEdit): DraftResult {
  const targetBase = baseName(target.name);
  const rawName = (edit.name ?? target.name).trim().toUpperCase();

  if (rawName === '') return { kind: 'error', error: 'Name cannot be empty.' };
  if (!isValidMapEntryName(rawName)) {
    return {
      kind: 'error',
      error: `"${rawName}" is not a valid name — use letters, digits and underscores, starting with a letter or underscore.`,
    };
  }

  const collides = entries.some(e => baseName(e.name) === rawName && baseName(e.name) !== targetBase);
  if (collides) {
    return { kind: 'error', error: `"${rawName}" is already in use.` };
  }

  const isArray = edit.isArray ?? target.isArray;
  const arraySize = isArray ? edit.arraySize ?? target.arraySize : undefined;
  if (isArray && (arraySize === undefined || arraySize < MIN_ARRAY_SIZE || arraySize > MAX_ARRAY_SIZE)) {
    return { kind: 'error', error: `Array size must be between ${MIN_ARRAY_SIZE} and ${MAX_ARRAY_SIZE}.` };
  }

  const newCount = isArray && arraySize ? arraySize : 1;
  const insertIndex = entries.findIndex(e => baseName(e.name) === targetBase);
  const filtered = entries.filter(e => baseName(e.name) !== targetBase);

  if (filtered.length + newCount > MAX_ENTRIES) {
    return {
      kind: 'error',
      error: `This would create ${filtered.length + newCount} entries, exceeding the maximum of ${MAX_ENTRIES}.`,
    };
  }

  const data: NewEntryData = {
    name: rawName,
    type: edit.type ?? target.type,
    isArray,
    arraySize,
    accessPermit: edit.accessPermit ?? target.accessPermit,
    unit: 'unit' in edit ? edit.unit : target.unit,
    description: 'description' in edit ? edit.description : target.description,
    valueList: 'valueList' in edit ? edit.valueList : target.valueList,
  };

  const created = expand(data, target.address);
  const result = [...filtered];
  result.splice(insertIndex, 0, ...created);
  return { kind: 'ok', entries: readdress(result) };
}

/** Removes every wire entry belonging to one logical entry, re-addressing what follows. */
export function deleteEntry(target: MapEntry, entries: readonly MapEntry[]): MapEntry[] {
  const targetBase = baseName(target.name);
  return readdress(entries.filter(e => baseName(e.name) !== targetBase));
}

/**
 * Moves one logical (consolidated) entry from `oldIndex` to `newIndex` and
 * re-expands the whole list, keeping every array's elements adjacent and
 * refusing to move a Register across the Read-Only/Read-Write boundary its
 * position encodes.
 */
export function reorderEntries(
  entries: readonly MapEntry[],
  oldIndex: number,
  newIndex: number,
  isRegisterMap: boolean
): DraftResult {
  const consolidated = consolidateArrayEntries([...entries]);

  if (isRegisterMap && consolidated[oldIndex]?.accessPermit !== consolidated[newIndex]?.accessPermit) {
    return { kind: 'error', error: 'Cannot move entries across the Read-Only/Read-Write boundary.' };
  }

  const reordered = arrayMove(consolidated, oldIndex, newIndex);
  const expanded: MapEntry[] = [];
  let address = 0;
  for (const logical of reordered) {
    if (logical.isArray && logical.arraySize) {
      for (let i = 0; i < logical.arraySize; i++) {
        expanded.push({ ...logical, address: address++, name: `${logical.name}[${i}]` });
      }
    } else {
      expanded.push({ ...logical, address: address++ });
    }
  }

  return { kind: 'ok', entries: expanded };
}

/** The per-entry metadata (unit, description, value list) a Profile persists alongside its Map text. */
export function extractMetadata(entries: readonly MapEntry[]): Record<string, EntryMetadata> {
  const metadata: Record<string, EntryMetadata> = {};
  for (const logical of consolidateArrayEntries([...entries])) {
    if (!logical.unit && !logical.description && !(logical.valueList && logical.valueList.length > 0)) continue;
    metadata[baseName(logical.name)] = {
      unit: logical.unit,
      description: logical.description,
      valueList: logical.valueList,
    };
  }
  return metadata;
}

/**
 * Merges a Profile's saved per-entry metadata onto freshly parsed entries.
 *
 * `parseMapFile` never sets `unit`, `description` or `valueList` — they live
 * only in the Profile's separate metadata dict, keyed by base name, which is
 * why loading a Profile for editing is a parse followed by this rather than
 * the parse alone.
 */
export function applyMetadata(
  entries: readonly MapEntry[],
  metadata: Readonly<Record<string, EntryMetadata>>
): MapEntry[] {
  return entries.map(entry => {
    const meta = metadata[baseName(entry.name)];
    if (!meta) return entry;
    return { ...entry, unit: meta.unit, description: meta.description, valueList: meta.valueList };
  });
}

/** Whether every read-only Register precedes every read-write one, as the wire format requires. */
export function isRegisterOrderValid(entries: readonly MapEntry[]): boolean {
  let seenReadWrite = false;
  for (const entry of entries) {
    if (entry.accessPermit === DataAccessPermit.READ_WRITE) {
      seenReadWrite = true;
    } else if (entry.accessPermit === DataAccessPermit.READ_ONLY && seenReadWrite) {
      return false;
    }
  }
  return true;
}
