/**
 * Named, saveable Workspaces belonging to a Profile.
 *
 * A Workspace is dockview's serialized layout plus each open Pane's own state
 * (ADR-0001) plus the shared selection the Inspector was following — the three
 * things that together are "what the Panes were actually showing". This module
 * owns the shape, validates it against corruption, and holds the pure
 * collection operations a chrome switcher/save/rename/delete flow needs. The
 * imperative half — actually calling `api.fromJSON` — is isolated behind
 * {@link WorkspaceDockApi} so it can be pinned without a real dockview
 * instance, which ADR-0001 keeps out of this project's test net.
 */

import type { SerializedDockview } from 'dockview';
import type { EntrySelection } from './SelectionContext';
import { isKnownPaneKind } from './paneRegistry';
import { loadPaneStates, snapshotPaneStates } from './paneState';

export interface StoredWorkspace {
  readonly id: string;
  readonly name: string;
  readonly dockLayout: SerializedDockview;
  /** Each open Pane's own state, keyed by panel id. */
  readonly paneStates: Readonly<Record<string, unknown>>;
  /** What the shared Inspector was following, if anything. */
  readonly selection: EntrySelection | null;
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

  return true;
}

export function isValidStoredWorkspace(value: unknown): value is StoredWorkspace {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== 'string' || value.id === '') return false;
  if (typeof value.name !== 'string' || value.name === '') return false;
  if (!isPlainObject(value.paneStates)) return false;
  if (!isValidDockLayout(value.dockLayout)) return false;
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

/** Replaces one Workspace's content in place — what autosave calls on every change. */
export function updateWorkspaceContent(
  collection: ProfileWorkspaces,
  id: string,
  content: Pick<StoredWorkspace, 'dockLayout' | 'paneStates' | 'selection'>
): ProfileWorkspaces {
  if (!collection.workspaces.some(w => w.id === id)) return collection;
  return {
    ...collection,
    workspaces: collection.workspaces.map(w => (w.id === id ? { ...w, ...content } : w)),
  };
}

/** The Workspace to restore: the active one, falling back to default if the pointer is stale. */
export function activeWorkspaceOf(collection: ProfileWorkspaces): StoredWorkspace | undefined {
  return (
    collection.workspaces.find(w => w.id === collection.activeWorkspaceId) ??
    collection.workspaces.find(w => w.id === collection.defaultWorkspaceId)
  );
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
  selection: EntrySelection | null
): StoredWorkspace {
  const paneIds = api.panels.map(panel => panel.id);
  return {
    id,
    name,
    dockLayout: api.toJSON(),
    paneStates: snapshotPaneStates(paneIds),
    selection,
  };
}

/**
 * Restores a Workspace onto a live dock api.
 *
 * Pane state is seeded first and dockview loaded second: `usePaneState` only
 * reads the store on a Pane's first mount, and `fromJSON` is what creates that
 * mount. The other order would restore every Pane to its own default.
 */
export function restoreWorkspace(api: WorkspaceDockApi, workspace: StoredWorkspace): void {
  loadPaneStates(workspace.paneStates);
  api.fromJSON(workspace.dockLayout);
}
