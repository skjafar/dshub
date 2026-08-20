import { describe, it, expect, afterEach } from 'vitest';
import type { SerializedDockview } from 'dockview';
import { loadPaneStates, retainPaneState, snapshotPaneStates } from '../paneState';
import {
  DEFAULT_WORKSPACE_NAME,
  addWorkspace,
  createWorkspaceId,
  isValidStoredWorkspace,
  removeWorkspace,
  renameWorkspace,
  restoreDaughterWindowContent,
  restoreWorkspace,
  sanitizeProfileWorkspaces,
  seedProfileWorkspaces,
  setActiveWorkspace,
  snapshotWorkspace,
  updateWorkspaceContent,
  updateWorkspaceDaughterWindows,
  upsertDaughterWindow,
  withoutDaughterWindow,
  withoutWorkspace,
} from '../workspaceStore';
import type { DaughterWindowBounds, StoredDaughterWindow, StoredWorkspace, WorkspaceDockApi } from '../workspaceStore';

afterEach(() => {
  retainPaneState([]);
});

/** A dockLayout naming only Pane kinds this build actually has. */
function validDockLayout(panelIds: readonly string[] = ['overview']): SerializedDockview {
  const panels: Record<string, unknown> = {};
  for (const id of panelIds) {
    // "overview" and "register" are both known kinds; callers pick.
    panels[id] = { id, contentComponent: id.split('#')[0] };
  }
  return {
    grid: {
      root: { type: 'branch', data: [] },
      height: 600,
      width: 800,
      orientation: 'HORIZONTAL',
    },
    panels,
  } as unknown as SerializedDockview;
}

const bounds: DaughterWindowBounds = { x: 100, y: 100, width: 640, height: 480 };

function daughterWindow(overrides: Partial<StoredDaughterWindow> = {}): StoredDaughterWindow {
  return {
    label: 'daughter-1',
    dockLayout: validDockLayout(['register']),
    paneStates: {},
    bounds,
    ...overrides,
  };
}

function workspace(overrides: Partial<StoredWorkspace> = {}): StoredWorkspace {
  return {
    id: 'w1',
    name: 'My Workspace',
    mainDockLayout: validDockLayout(),
    paneStates: {},
    selection: null,
    daughterWindows: [],
    ...overrides,
  };
}

describe('validating a stored Workspace', () => {
  it('accepts a well-formed Workspace naming only known Pane kinds', () => {
    expect(isValidStoredWorkspace(workspace())).toBe(true);
  });

  it('accepts a Workspace carrying well-formed Daughter Windows', () => {
    expect(isValidStoredWorkspace(workspace({ daughterWindows: [daughterWindow()] }))).toBe(true);
  });

  it('rejects a mainDockLayout naming a Pane kind this build does not have', () => {
    // The situation a downgrade or a retired Pane kind produces.
    const bad = workspace({ mainDockLayout: validDockLayout(['register-from-the-future']) });
    expect(isValidStoredWorkspace(bad)).toBe(false);
  });

  it('rejects a mainDockLayout with no recognisable grid root', () => {
    const bad = workspace({ mainDockLayout: { panels: {} } as unknown as SerializedDockview });
    expect(isValidStoredWorkspace(bad)).toBe(false);
  });

  it('rejects a dockLayout carrying real popoutGroups entries — the pre-native format\'s signature', () => {
    const bad = workspace({
      mainDockLayout: { ...validDockLayout(), popoutGroups: [{ id: 'popout-1' }] } as unknown as SerializedDockview,
    });
    expect(isValidStoredWorkspace(bad)).toBe(false);
  });

  it('accepts a dockLayout with an empty popoutGroups array', () => {
    // dockview may still serialize the field even with nothing in it —
    // only a *populated* list is the old-format signal.
    const ok = workspace({
      mainDockLayout: { ...validDockLayout(), popoutGroups: [] } as unknown as SerializedDockview,
    });
    expect(isValidStoredWorkspace(ok)).toBe(true);
  });

  it('rejects a Workspace saved under the old (pre-native) shape — dockLayout instead of mainDockLayout, no daughterWindows at all', () => {
    // Exactly what `.scratch/daughter-windows-native/issues/03` requires:
    // this must reset cleanly through the existing drop-and-fall-back path
    // rather than erroring or partially restoring.
    const old = {
      id: 'w1',
      name: 'Old shape',
      dockLayout: validDockLayout(),
      paneStates: {},
      selection: null,
    };
    expect(isValidStoredWorkspace(old)).toBe(false);
  });

  it('rejects a Workspace whose daughterWindows is missing or not an array', () => {
    const missing = { id: 'w1', name: 'X', mainDockLayout: validDockLayout(), paneStates: {}, selection: null };
    expect(isValidStoredWorkspace(missing)).toBe(false);

    const notArray = { ...missing, daughterWindows: {} };
    expect(isValidStoredWorkspace(notArray)).toBe(false);
  });

  it('rejects a Workspace carrying one malformed Daughter Window entry', () => {
    const bad = workspace({ daughterWindows: [{ label: 'daughter-1' }] as unknown as StoredDaughterWindow[] });
    expect(isValidStoredWorkspace(bad)).toBe(false);
  });

  it('rejects a Daughter Window entry with a missing or empty label', () => {
    const bad = workspace({ daughterWindows: [daughterWindow({ label: '' })] });
    expect(isValidStoredWorkspace(bad)).toBe(false);
  });

  it('rejects a Daughter Window entry with malformed bounds', () => {
    const bad = workspace({
      daughterWindows: [daughterWindow({ bounds: { x: 0, y: 0 } as unknown as DaughterWindowBounds })],
    });
    expect(isValidStoredWorkspace(bad)).toBe(false);
  });

  it('rejects garbage of every shape without throwing', () => {
    for (const candidate of [null, undefined, 42, 'a string', [], {}, { id: 1 }]) {
      expect(() => isValidStoredWorkspace(candidate)).not.toThrow();
      expect(isValidStoredWorkspace(candidate)).toBe(false);
    }
  });
});

describe('repairing a stored Profile\'s Workspace collection', () => {
  it('passes through a collection whose default and active ids both resolve', () => {
    const collection = seedProfileWorkspaces(workspace({ id: 'default' }));
    expect(sanitizeProfileWorkspaces(collection)).toEqual(collection);
  });

  it('gives up entirely on a collection with no Workspaces', () => {
    expect(sanitizeProfileWorkspaces({ workspaces: [], defaultWorkspaceId: 'x', activeWorkspaceId: 'x' })).toBeUndefined();
  });

  it('gives up on garbage that is not even shaped like a collection, without throwing', () => {
    for (const candidate of [null, undefined, 42, 'a string', [], { workspaces: 'not an array' }]) {
      expect(() => sanitizeProfileWorkspaces(candidate)).not.toThrow();
      expect(sanitizeProfileWorkspaces(candidate)).toBeUndefined();
    }
  });

  it('drops one corrupt Workspace but keeps the rest — a downgrade must not cost every saved arrangement', () => {
    const good = workspace({ id: 'w1' });
    const corrupt = { id: 'w2', name: 'Bad', mainDockLayout: validDockLayout(['unknown-kind']), paneStates: {}, daughterWindows: [] };
    const collection = {
      workspaces: [good, corrupt],
      defaultWorkspaceId: 'w1',
      activeWorkspaceId: 'w1',
    };

    const repaired = sanitizeProfileWorkspaces(collection);
    expect(repaired?.workspaces.map(w => w.id)).toEqual(['w1']);
  });

  it('falls the default pointer back to a surviving Workspace when the named default was the corrupt one', () => {
    const good = workspace({ id: 'w1' });
    const corrupt = { id: 'w2', name: 'Bad', mainDockLayout: validDockLayout(['unknown-kind']), paneStates: {}, daughterWindows: [] };
    const collection = {
      workspaces: [good, corrupt],
      defaultWorkspaceId: 'w2',
      activeWorkspaceId: 'w2',
    };

    const repaired = sanitizeProfileWorkspaces(collection);
    expect(repaired?.defaultWorkspaceId).toBe('w1');
    expect(repaired?.activeWorkspaceId).toBe('w1');
  });

  it('falls the active pointer back to the default when active names a Workspace that no longer exists', () => {
    const collection = {
      workspaces: [workspace({ id: 'w1' })],
      defaultWorkspaceId: 'w1',
      activeWorkspaceId: 'ghost',
    };
    const repaired = sanitizeProfileWorkspaces(collection);
    expect(repaired?.activeWorkspaceId).toBe('w1');
  });
});

describe('seeding the first Workspace a Profile opens into', () => {
  it('marks the seeded Workspace both default and active', () => {
    const seed = workspace({ id: 'default', name: DEFAULT_WORKSPACE_NAME });
    const collection = seedProfileWorkspaces(seed);
    expect(collection.defaultWorkspaceId).toBe('default');
    expect(collection.activeWorkspaceId).toBe('default');
    expect(collection.workspaces).toEqual([seed]);
  });
});

describe('Workspace collection operations', () => {
  it('adding a Workspace makes it the active one without disturbing the default', () => {
    const collection = seedProfileWorkspaces(workspace({ id: 'default' }));
    const next = addWorkspace(collection, workspace({ id: 'w2', name: 'Debugging' }));

    expect(next.workspaces.map(w => w.id)).toEqual(['default', 'w2']);
    expect(next.activeWorkspaceId).toBe('w2');
    expect(next.defaultWorkspaceId).toBe('default');
  });

  it('renames the named Workspace and leaves the others untouched', () => {
    const collection = seedProfileWorkspaces(workspace({ id: 'default', name: 'Default' }));
    const next = renameWorkspace(collection, 'default', 'Debug Layout');
    expect(next.workspaces[0]?.name).toBe('Debug Layout');
  });

  it('deletes a non-default Workspace and falls back the active pointer to default if it was active', () => {
    let collection = seedProfileWorkspaces(workspace({ id: 'default' }));
    collection = addWorkspace(collection, workspace({ id: 'w2' }));
    expect(collection.activeWorkspaceId).toBe('w2');

    const next = removeWorkspace(collection, 'w2');
    expect(next.workspaces.map(w => w.id)).toEqual(['default']);
    expect(next.activeWorkspaceId).toBe('default');
  });

  it('refuses to delete the default Workspace, so a Profile never loses what it opens into', () => {
    let collection = seedProfileWorkspaces(workspace({ id: 'default' }));
    collection = addWorkspace(collection, workspace({ id: 'w2' }));

    const next = removeWorkspace(collection, 'default');
    expect(next).toEqual(collection);
  });

  it('drops a non-default Workspace unconditionally, unlike removeWorkspace', () => {
    let collection = seedProfileWorkspaces(workspace({ id: 'default' }));
    collection = addWorkspace(collection, workspace({ id: 'w2' }));

    const next = withoutWorkspace(collection, 'w2');
    expect(next?.workspaces.map(w => w.id)).toEqual(['default']);
  });

  it('drops the default Workspace too, and hands default to a survivor — the restore path needs this even for a broken default', () => {
    let collection = seedProfileWorkspaces(workspace({ id: 'default' }));
    collection = addWorkspace(collection, workspace({ id: 'w2' }));

    const next = withoutWorkspace(collection, 'default');
    expect(next?.workspaces.map(w => w.id)).toEqual(['w2']);
    expect(next?.defaultWorkspaceId).toBe('w2');
    expect(next?.activeWorkspaceId).toBe('w2');
  });

  it('returns undefined once the last Workspace is dropped', () => {
    const collection = seedProfileWorkspaces(workspace({ id: 'default' }));
    expect(withoutWorkspace(collection, 'default')).toBeUndefined();
  });

  it('switches the active pointer to an existing Workspace', () => {
    let collection = seedProfileWorkspaces(workspace({ id: 'default' }));
    collection = addWorkspace(collection, workspace({ id: 'w2' }));

    const next = setActiveWorkspace(collection, 'default');
    expect(next.activeWorkspaceId).toBe('default');
  });

  it('ignores a switch to a Workspace id that does not exist', () => {
    const collection = seedProfileWorkspaces(workspace({ id: 'default' }));
    const next = setActiveWorkspace(collection, 'ghost');
    expect(next).toEqual(collection);
  });

  it('updates one Workspace\'s own content in place, identified by id, without touching its daughterWindows', () => {
    const collection = seedProfileWorkspaces(
      workspace({ id: 'default', paneStates: {}, daughterWindows: [daughterWindow()] })
    );
    const next = updateWorkspaceContent(collection, 'default', {
      mainDockLayout: validDockLayout(['register']),
      paneStates: { register: { query: 'MOTOR' } },
      selection: null,
    });
    expect(next.workspaces[0]?.paneStates).toEqual({ register: { query: 'MOTOR' } });
    expect(next.workspaces[0]?.daughterWindows).toEqual([daughterWindow()]);
  });

  it('does not create a new entry when updating an id nothing matches', () => {
    const collection = seedProfileWorkspaces(workspace({ id: 'default' }));
    const next = updateWorkspaceContent(collection, 'ghost', {
      mainDockLayout: validDockLayout(),
      paneStates: {},
      selection: null,
    });
    expect(next).toEqual(collection);
  });

  it('replaces one Workspace\'s Daughter Window list wholesale, identified by id', () => {
    const collection = seedProfileWorkspaces(workspace({ id: 'default', daughterWindows: [] }));
    const next = updateWorkspaceDaughterWindows(collection, 'default', [daughterWindow()]);
    expect(next.workspaces[0]?.daughterWindows).toEqual([daughterWindow()]);
  });

  it('leaves the collection untouched when updating daughterWindows for an id nothing matches', () => {
    const collection = seedProfileWorkspaces(workspace({ id: 'default' }));
    const next = updateWorkspaceDaughterWindows(collection, 'ghost', [daughterWindow()]);
    expect(next).toEqual(collection);
  });

  it('creates Workspace ids that do not collide', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createWorkspaceId()));
    expect(ids.size).toBe(50);
  });
});

/**
 * One Daughter Window's own entry, kept current by that window's own
 * autosave — matched by label once its live label is known, or by array
 * position for the one restore-time write that has to bridge a freshly
 * minted label to whatever position it was told to restore from.
 */
describe('one Daughter Window\'s own entry', () => {
  it('appends a brand new entry when nothing matches its label', () => {
    const next = upsertDaughterWindow([], daughterWindow({ label: 'daughter-1' }));
    expect(next).toEqual([daughterWindow({ label: 'daughter-1' })]);
  });

  it('replaces an existing entry matched by label, leaving other entries untouched', () => {
    const other = daughterWindow({ label: 'daughter-2' });
    const updated = daughterWindow({ label: 'daughter-1', bounds: { x: 5, y: 5, width: 700, height: 500 } });
    const next = upsertDaughterWindow([daughterWindow({ label: 'daughter-1' }), other], updated);
    expect(next).toEqual([updated, other]);
  });

  it('targets a specific array position directly when a restoreIndex is given, regardless of label', () => {
    // The restore-time case: this window's freshly-minted label ("daughter-1")
    // shares nothing with whatever label the stored entry at position 0 was
    // saved under last session — only the position correlates.
    const stale = daughterWindow({ label: 'daughter-5' });
    const restored = daughterWindow({ label: 'daughter-1' });
    const next = upsertDaughterWindow([stale], restored, 0);
    expect(next).toEqual([restored]);
  });

  it('falls back to label matching when restoreIndex is out of range', () => {
    const next = upsertDaughterWindow([], daughterWindow({ label: 'daughter-1' }), 3);
    expect(next).toEqual([daughterWindow({ label: 'daughter-1' })]);
  });

  it('drops an entry by label, leaving the others', () => {
    const keep = daughterWindow({ label: 'daughter-2' });
    const next = withoutDaughterWindow([daughterWindow({ label: 'daughter-1' }), keep], 'daughter-1');
    expect(next).toEqual([keep]);
  });

  it('dropping a label nothing matches is a no-op', () => {
    const list = [daughterWindow({ label: 'daughter-1' })];
    expect(withoutDaughterWindow(list, 'daughter-9')).toEqual(list);
  });
});

/**
 * The round-trip contract: what dockview and paneState are handed on save has
 * to be exactly what a restore reproduces, including two Panes of the same
 * kind keeping separate filters. `WorkspaceDockApi` is the seam — a fake
 * satisfying it is enough to pin this without a real dockview instance, which
 * is not part of this project's test net (see ADR-0001).
 */
describe('saving and restoring a Workspace against the dock api', () => {
  function fakeDockApi(initialPanelIds: readonly string[] = []): WorkspaceDockApi & { loaded: SerializedDockview[] } {
    let panelIds = [...initialPanelIds];
    const loaded: SerializedDockview[] = [];
    return {
      get panels() {
        return panelIds.map(id => ({ id }));
      },
      toJSON: () => validDockLayout(panelIds),
      fromJSON: (data: SerializedDockview) => {
        loaded.push(data);
        panelIds = Object.keys(data.panels);
      },
      loaded,
    };
  }

  it('snapshots exactly the open Panes\' dock layout, their own state, and the given Daughter Windows', () => {
    loadPaneStates({
      'register#1': { query: 'MOTOR' },
      'register#2': { query: 'SPINDLE' },
    });
    const api = fakeDockApi(['register#1', 'register#2']);

    const selection = {
      space: 'register' as const,
      address: 5,
      paneId: 'register#1',
      paneTitle: 'Registers · MOTOR',
    };
    const saved = snapshotWorkspace(api, 'w1', 'Motion', selection, [daughterWindow()]);

    expect(saved.id).toBe('w1');
    expect(saved.name).toBe('Motion');
    expect(saved.paneStates).toEqual({
      'register#1': { query: 'MOTOR' },
      'register#2': { query: 'SPINDLE' },
    });
    expect(Object.keys(saved.mainDockLayout.panels)).toEqual(['register#1', 'register#2']);
    // The shared Inspector's selection travels with the Workspace it was made
    // in — restoring one that carried no selection must not leave a stale
    // Inspector reading, and switching to one that did must reproduce it.
    expect(saved.selection).toEqual(selection);
    expect(saved.daughterWindows).toEqual([daughterWindow()]);
  });

  it('carries a null selection and an empty Daughter Window list through unchanged', () => {
    const api = fakeDockApi(['overview']);
    const saved = snapshotWorkspace(api, 'w1', 'Overview only', null, []);
    expect(saved.selection).toBeNull();
    expect(saved.daughterWindows).toEqual([]);
  });

  it('restoring reproduces two Panes of the same kind with independent state', () => {
    loadPaneStates({
      'register#1': { query: 'MOTOR' },
      'register#2': { query: 'SPINDLE' },
    });
    const api = fakeDockApi(['register#1', 'register#2']);
    const saved = snapshotWorkspace(api, 'w1', 'Motion', null, []);

    // Simulate moving on: the store now holds something else entirely.
    loadPaneStates({ overview: { anything: true } });

    restoreWorkspace(api, saved);

    expect(api.loaded).toEqual([saved.mainDockLayout]);
    // paneState was reseeded from the saved snapshot before fromJSON ran.
    expect(snapshotPaneStates(['register#1', 'register#2'])).toEqual({
      'register#1': { query: 'MOTOR' },
      'register#2': { query: 'SPINDLE' },
    });
  });

  it('switching Workspace loads the incoming Workspace\'s own mainDockLayout, not the outgoing one\'s', () => {
    const outgoing = snapshotWorkspace(fakeDockApi(['overview']), 'w1', 'Outgoing', null, []);
    const incomingLayout = validDockLayout(['register']);
    const incoming: StoredWorkspace = {
      id: 'w2',
      name: 'Incoming',
      mainDockLayout: incomingLayout,
      paneStates: {},
      selection: null,
      daughterWindows: [],
    };

    const api = fakeDockApi(['overview']);
    restoreWorkspace(api, outgoing);
    restoreWorkspace(api, incoming);

    // dockview's `fromJSON` clears before it loads (the module doc comment
    // above already establishes this), so there is no trace of `outgoing`'s
    // layout left for the last restore to have merged in.
    expect(api.loaded.at(-1)).toEqual(incomingLayout);
  });

  it('restores one Daughter Window\'s own content the same two-step way — pane state before fromJSON', () => {
    loadPaneStates({ 'register#1': { query: 'stale' } });
    const entry = daughterWindow({ paneStates: { 'register#1': { query: 'MOTOR' } } });
    const api = fakeDockApi();

    restoreDaughterWindowContent(api, entry);

    expect(api.loaded).toEqual([entry.dockLayout]);
    expect(snapshotPaneStates(['register#1'])).toEqual({ 'register#1': { query: 'MOTOR' } });
  });
});
