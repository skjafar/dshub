/**
 * Named, saveable Workspaces belonging to a Profile.
 *
 * A Workspace is the Main Window's serialized dockview layout plus each open
 * Pane's own state (ADR-0001) plus the shared selection the Inspector was
 * following, plus every Daughter Window that belongs to it — its own
 * dockLayout, its own Panes' own state, and its saved position/size
 * (`.scratch/daughter-windows-native` issue 03; ADR 0005's own
 * "Cross-restart persistence... is issue 03's own job"). A single composite
 * `dockLayout` blob could describe the Main Window's arrangement because
 * dockview's own `popoutGroups` field rode along inside it; a genuinely
 * separate `WebviewWindow` has its own independent dockview instance with
 * nothing to embed it in, so each Daughter Window gets its own entry instead.
 * This module owns the shape, validates it against corruption, and holds the
 * pure collection operations a chrome switcher/save/rename/delete flow needs.
 * The imperative half — actually calling `api.fromJSON` — is isolated behind
 * {@link WorkspaceDockApi} so it can be pinned without a real dockview
 * instance, which ADR-0001 keeps out of this project's test net.
 */

import type { SerializedDockview } from 'dockview';
import type { EntrySelection } from './SelectionContext';
import { isKnownPaneKind } from './paneRegistry';
import { loadPaneStates, snapshotPaneStates } from './paneState';

/** A Daughter Window's saved position and size, in logical pixels — the unit `WebviewWindowBuilder::position`/`inner_size` both expect. */
export interface DaughterWindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * One Daughter Window belonging to a Workspace: its own dockview layout, its
 * own open Panes' own state, and where it sat on screen.
 *
 * `label` identifies which currently-open `WebviewWindow` this entry
 * belongs to for the lifetime of the session that wrote it — the live Tauri
 * label a Daughter Window is minted with, not a durable cross-restart
 * identity (labels are never reused *within* a run, per
 * `daughter_windows.rs`, but every fresh launch remints from `daughter-1`
 * regardless of what a previous session's windows were called). Restoring at
 * launch correlates by array position instead (`?restore=<index>` on the
 * window's own URL); the first thing a restored window's own autosave does
 * is stamp its newly-minted live label into this field, after which further
 * autosaves for that window find their own entry by label like any other.
 */
export interface StoredDaughterWindow {
  readonly label: string;
  readonly dockLayout: SerializedDockview;
  readonly paneStates: Readonly<Record<string, unknown>>;
  readonly bounds: DaughterWindowBounds;
}

export interface StoredWorkspace {
  readonly id: string;
  readonly name: string;
  readonly mainDockLayout: SerializedDockview;
  /** Each of the Main Window's own open Panes' own state, keyed by panel id. */
  readonly paneStates: Readonly<Record<string, unknown>>;
  /** What the shared Inspector was following, if anything. */
  readonly selection: EntrySelection | null;
  /** Every Daughter Window currently open under this Workspace. */
  readonly daughterWindows: readonly StoredDaughterWindow[];
}

export interface ProfileWorkspaces {
  readonly workspaces: readonly StoredWorkspace[];
  readonly defaultWorkspaceId: string;
  /** Which Workspace was open when the application was last closed. */
  readonly activeWorkspaceId: string;
}

export const DEFAULT_WORKSPACE_ID = 'default';
export const DEFAULT_WORKSPACE_NAME = 'Default';

export function createWorkspaceId(): string {
  return `workspace_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Validation ─────────────────────────────────────────────────────────────
//
// A stored Workspace embeds a third-party serialization format (spec.md), so
// corruption is a real failure mode: a hand-edited settings file, a field
// dropped by a future dockview version, or a Pane kind retired since the
// Workspace was saved. Every check here runs before a byte of this reaches
// `api.fromJSON` — dockview's own loader clears the current layout before it
// validates its input, so a rejected load would otherwise still blank the
// screen it was trying to protect.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDockLayout(value: unknown): value is SerializedDockview {
  if (!isPlainObject(value)) return false;

  const grid = value.grid;
  if (!isPlainObject(grid)) return false;
  const root = grid.root;
  if (!isPlainObject(root) || root.type !== 'branch' || !Array.isArray(root.data)) return false;

  const panels = value.panels;
  if (!isPlainObject(panels)) return false;
  for (const panel of Object.values(panels)) {
    if (!isPlainObject(panel)) return false;
    const kind = panel.contentComponent;
    if (typeof kind !== 'string' || !isKnownPaneKind(kind)) return false;
  }

  // dockview may still serialize a `popoutGroups` field even though nothing
  // populates it any more (`.scratch/daughter-windows-native` issue 02
  // removed the `on_new_window` handler that ever made a real one succeed) —
  // a non-empty one would only mean this layout predates that change.
  // Rejecting it here is defence in depth: a Workspace saved under the old
  // shape is already rejected by `isValidStoredWorkspace` for lacking
  // `mainDockLayout`/`daughterWindows` entirely, but this keeps a single
  // corrupt-in-this-specific-way layout from reaching `fromJSON`, which
  // would otherwise still try to reopen it via dockview's own internal
  // `window.open` and fail unconditionally.
  if (Array.isArray(value.popoutGroups) && value.popoutGroups.length > 0) return false;

  return true;
}

function isValidBounds(value: unknown): value is DaughterWindowBounds {
  return (
    isPlainObject(value) &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  );
}

function isValidStoredDaughterWindow(value: unknown): value is StoredDaughterWindow {
  if (!isPlainObject(value)) return false;
  if (typeof value.label !== 'string' || value.label === '') return false;
  if (!isValidDockLayout(value.dockLayout)) return false;
  if (!isPlainObject(value.paneStates)) return false;
  if (!isValidBounds(value.bounds)) return false;
  return true;
}

export function isValidStoredWorkspace(value: unknown): value is StoredWorkspace {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== 'string' || value.id === '') return false;
  if (typeof value.name !== 'string' || value.name === '') return false;
  if (!isPlainObject(value.paneStates)) return false;
  if (!isValidDockLayout(value.mainDockLayout)) return false;
  if (!Array.isArray(value.daughterWindows) || !value.daughterWindows.every(isValidStoredDaughterWindow)) return false;
  return true;
}

/**
 * Repairs a stored Profile's Workspace collection rather than only judging it.
 *
 * A single corrupted Workspace — one bad field, one Pane kind this build has
 * since retired — must not cost every other named Workspace the Profile has
 * saved. Individually invalid entries are dropped; a default or active pointer
 * left dangling by a drop falls back to whatever remains. Returns undefined
 * only when nothing in the collection can be trusted, which is what tells the
 * shell to fall back to a freshly seeded default Workspace instead of a blank
 * screen.
 */
export function sanitizeProfileWorkspaces(value: unknown): ProfileWorkspaces | undefined {
  if (!isPlainObject(value)) return undefined;
  if (!Array.isArray(value.workspaces)) return undefined;

  const workspaces = value.workspaces.filter(isValidStoredWorkspace);
  if (workspaces.length === 0) return undefined;

  const ids = new Set(workspaces.map(w => w.id));
  const defaultWorkspaceId =
    typeof value.defaultWorkspaceId === 'string' && ids.has(value.defaultWorkspaceId)
      ? value.defaultWorkspaceId
      : workspaces[0].id;
  const activeWorkspaceId =
    typeof value.activeWorkspaceId === 'string' && ids.has(value.activeWorkspaceId)
      ? value.activeWorkspaceId
      : defaultWorkspaceId;

  return { workspaces, defaultWorkspaceId, activeWorkspaceId };
}

/**
 * Drops one Workspace unconditionally and repairs a dangling default or
 * active pointer, or undefined if nothing is left.
 *
 * Not the same operation as {@link removeWorkspace}: that one refuses to drop
 * the default Workspace because a user deleting one is not allowed to leave a
 * Profile without an anchor. This is the recovery primitive the restore path
 * needs instead — a Workspace that passed structural validation but that
 * dockview itself then refused to load at runtime *has* to come out, default
 * or not, so the next candidate in the collection gets a turn before the
 * shell gives up and reseeds from scratch.
 */
export function withoutWorkspace(collection: ProfileWorkspaces, id: string): ProfileWorkspaces | undefined {
  const workspaces = collection.workspaces.filter(w => w.id !== id);
  if (workspaces.length === 0) return undefined;

  const ids = new Set(workspaces.map(w => w.id));
  const defaultWorkspaceId = ids.has(collection.defaultWorkspaceId)
    ? collection.defaultWorkspaceId
    : workspaces[0].id;
  const activeWorkspaceId = ids.has(collection.activeWorkspaceId) ? collection.activeWorkspaceId : defaultWorkspaceId;

  return { workspaces, defaultWorkspaceId, activeWorkspaceId };
}

// ── Building the first Workspace a Profile opens into ───────────────────────

export function seedProfileWorkspaces(defaultWorkspace: StoredWorkspace): ProfileWorkspaces {
  return {
    workspaces: [defaultWorkspace],
    defaultWorkspaceId: defaultWorkspace.id,
    activeWorkspaceId: defaultWorkspace.id,
  };
}

// ── Collection operations ────────────────────────────────────────────────
//
// Pure and immutable, so the chrome and the shell can share them without
// either holding a second copy of what "the current Workspace list" means.

/** Adds a Workspace and makes it the active one — "save current arrangement as". */
export function addWorkspace(collection: ProfileWorkspaces, workspace: StoredWorkspace): ProfileWorkspaces {
  return {
    ...collection,
    workspaces: [...collection.workspaces, workspace],
    activeWorkspaceId: workspace.id,
  };
}

export function renameWorkspace(collection: ProfileWorkspaces, id: string, name: string): ProfileWorkspaces {
  return {
    ...collection,
    workspaces: collection.workspaces.map(w => (w.id === id ? { ...w, name } : w)),
  };
}

/**
 * Refuses to delete the default Workspace.
 *
 * "One Workspace is marked default and is what a Profile opens into" only
 * holds if that Workspace cannot be removed out from under it — the chrome
 * disables the action too, but the invariant belongs here so it cannot be
 * reintroduced by a second call site.
 */
export function removeWorkspace(collection: ProfileWorkspaces, id: string): ProfileWorkspaces {
  if (id === collection.defaultWorkspaceId) return collection;
  if (!collection.workspaces.some(w => w.id === id)) return collection;

  return {
    ...collection,
    workspaces: collection.workspaces.filter(w => w.id !== id),
    activeWorkspaceId: collection.activeWorkspaceId === id ? collection.defaultWorkspaceId : collection.activeWorkspaceId,
  };
}

export function setActiveWorkspace(collection: ProfileWorkspaces, id: string): ProfileWorkspaces {
  if (!collection.workspaces.some(w => w.id === id)) return collection;
  return { ...collection, activeWorkspaceId: id };
}

/** Replaces one Workspace's own Main-Window content in place — what the Main Window's autosave calls on every change. Never touches `daughterWindows`: each Daughter Window keeps its own entry current independently (see {@link upsertDaughterWindow}). */
export function updateWorkspaceContent(
  collection: ProfileWorkspaces,
  id: string,
  content: Pick<StoredWorkspace, 'mainDockLayout' | 'paneStates' | 'selection'>
): ProfileWorkspaces {
  if (!collection.workspaces.some(w => w.id === id)) return collection;
  return {
    ...collection,
    workspaces: collection.workspaces.map(w => (w.id === id ? { ...w, ...content } : w)),
  };
}

/** Replaces one Workspace's Daughter Window list wholesale — what a Daughter Window's own autosave, and the Main Window's explicit close/prune, both call. */
export function updateWorkspaceDaughterWindows(
  collection: ProfileWorkspaces,
  id: string,
  daughterWindows: readonly StoredDaughterWindow[]
): ProfileWorkspaces {
  if (!collection.workspaces.some(w => w.id === id)) return collection;
  return {
    ...collection,
    workspaces: collection.workspaces.map(w => (w.id === id ? { ...w, daughterWindows } : w)),
  };
}

/** The Workspace to restore: the active one, falling back to default if the pointer is stale. */
export function activeWorkspaceOf(collection: ProfileWorkspaces): StoredWorkspace | undefined {
  return (
    collection.workspaces.find(w => w.id === collection.activeWorkspaceId) ??
    collection.workspaces.find(w => w.id === collection.defaultWorkspaceId)
  );
}

// ── One Daughter Window's own entry ─────────────────────────────────────────
//
// Pure list operations a Daughter Window's own autosave (and the Main
// Window's explicit close/prune) need against just the `daughterWindows`
// array — kept separate from `updateWorkspaceDaughterWindows` above so they
// can be pinned without a `ProfileWorkspaces` collection at all.

/**
 * Inserts or replaces one Daughter Window's own entry.
 *
 * `restoreIndex`, when given, targets that array position directly and
 * unconditionally — the one time a Daughter Window's live label cannot yet
 * match anything in the array: right after being restored at launch, its
 * newly-minted label has no relationship to whatever label the entry was
 * saved under last session, so the *position* it was told to restore from
 * (`?restore=<index>` on its own URL) is the only correlation available.
 * Every other call — this window's own later autosaves, or a freshly
 * *created* Daughter Window's very first save — omits it and matches by
 * `entry.label` instead, appending a new entry if nothing matches yet.
 */
export function upsertDaughterWindow(
  daughterWindows: readonly StoredDaughterWindow[],
  entry: StoredDaughterWindow,
  restoreIndex: number | null = null
): readonly StoredDaughterWindow[] {
  if (restoreIndex !== null && restoreIndex >= 0 && restoreIndex < daughterWindows.length) {
    return daughterWindows.map((d, i) => (i === restoreIndex ? entry : d));
  }
  const existingIndex = daughterWindows.findIndex(d => d.label === entry.label);
  if (existingIndex === -1) return [...daughterWindows, entry];
  return daughterWindows.map((d, i) => (i === existingIndex ? entry : d));
}

/** Drops one Daughter Window's entry by label — a deliberate close, not a corruption repair. */
export function withoutDaughterWindow(
  daughterWindows: readonly StoredDaughterWindow[],
  label: string
): readonly StoredDaughterWindow[] {
  return daughterWindows.filter(d => d.label !== label);
}

// ── Dock orchestration ───────────────────────────────────────────────────
//
// The seam: only what a save/restore needs from dockview's api, so the two
// operations below can be pinned against a fake rather than a live dockview
// instance.

export interface WorkspaceDockApi {
  toJSON(): SerializedDockview;
  fromJSON(data: SerializedDockview): void;
  readonly panels: ReadonlyArray<{ readonly id: string }>;
}

export function snapshotWorkspace(
  api: WorkspaceDockApi,
  id: string,
  name: string,
  selection: EntrySelection | null,
  daughterWindows: readonly StoredDaughterWindow[]
): StoredWorkspace {
  const paneIds = api.panels.map(panel => panel.id);
  return {
    id,
    name,
    mainDockLayout: api.toJSON(),
    paneStates: snapshotPaneStates(paneIds),
    selection,
    daughterWindows,
  };
}

/**
 * Restores one dockview instance's own content — pane state seeded first,
 * dockview loaded second: `usePaneState` only reads the store on a Pane's
 * first mount, and `fromJSON` is what creates that mount. The other order
 * would restore every Pane to its own default. Shared by
 * {@link restoreWorkspace} and {@link restoreDaughterWindowContent}, which
 * differ only in which of `StoredWorkspace`/`StoredDaughterWindow`'s fields
 * carry the layout and pane state — each dockview instance only ever has one
 * of these to restore, whole.
 */
function restoreDockContent(api: WorkspaceDockApi, paneStates: Readonly<Record<string, unknown>>, dockLayout: SerializedDockview): void {
  loadPaneStates(paneStates);
  api.fromJSON(dockLayout);
}

/**
 * Restores a Workspace's own Main-Window content onto a live dock api. Says
 * nothing about `workspace.daughterWindows` — restoring those is the Main
 * Window's own separate, asynchronous step (opening N `WebviewWindow`s via
 * Rust), not something this synchronous call can do.
 */
export function restoreWorkspace(api: WorkspaceDockApi, workspace: StoredWorkspace): void {
  restoreDockContent(api, workspace.paneStates, workspace.mainDockLayout);
}

/**
 * Restores one Daughter Window's own content onto its own live dock api,
 * scoped to a single {@link StoredDaughterWindow} entry rather than a whole
 * Workspace, since a Daughter Window only ever has one dockview instance of
 * its own to restore.
 */
export function restoreDaughterWindowContent(api: WorkspaceDockApi, entry: StoredDaughterWindow): void {
  restoreDockContent(api, entry.paneStates, entry.dockLayout);
}
