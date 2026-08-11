import { describe, it, expect, afterEach, vi } from 'vitest';
import type { SerializedDockview } from 'dockview';
import { loadPaneStates, retainPaneState, snapshotPaneStates } from '../paneState';
import {
  DEFAULT_WORKSPACE_NAME,
  addWorkspace,
  createRestoreGuard,
  createWorkspaceId,
  isValidStoredWorkspace,
  removeWorkspace,
  renameWorkspace,
  restoreWorkspace,
  sanitizeProfileWorkspaces,
  seedProfileWorkspaces,
  setActiveWorkspace,
  snapshotWorkspace,
  updateWorkspaceContent,
  withoutWorkspace,
} from '../workspaceStore';
import type { StoredWorkspace, WorkspaceDockApi } from '../workspaceStore';

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

function workspace(overrides: Partial<StoredWorkspace> = {}): StoredWorkspace {
  return {
    id: 'w1',
    name: 'My Workspace',
    dockLayout: validDockLayout(),
    paneStates: {},
    selection: null,
    ...overrides,
  };
}

describe('validating a stored Workspace', () => {
  it('accepts a well-formed Workspace naming only known Pane kinds', () => {
    expect(isValidStoredWorkspace(workspace())).toBe(true);
  });

  it('rejects a dockLayout naming a Pane kind this build does not have', () => {
    // The situation a downgrade or a retired Pane kind produces.
    const bad = workspace({ dockLayout: validDockLayout(['register-from-the-future']) });
    expect(isValidStoredWorkspace(bad)).toBe(false);
  });

  it('rejects a dockLayout with no recognisable grid root', () => {
    const bad = workspace({ dockLayout: { panels: {} } as unknown as SerializedDockview });
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
    const corrupt = { id: 'w2', name: 'Bad', dockLayout: validDockLayout(['unknown-kind']), paneStates: {} };
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
    const corrupt = { id: 'w2', name: 'Bad', dockLayout: validDockLayout(['unknown-kind']), paneStates: {} };
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

  it('updates one Workspace\'s content in place, identified by id', () => {
    const collection = seedProfileWorkspaces(workspace({ id: 'default', paneStates: {} }));
    const next = updateWorkspaceContent(collection, 'default', {
      dockLayout: validDockLayout(['register']),
      paneStates: { register: { query: 'MOTOR' } },
      selection: null,
    });
    expect(next.workspaces[0]?.paneStates).toEqual({ register: { query: 'MOTOR' } });
  });

  it('does not create a new entry when updating an id nothing matches', () => {
    const collection = seedProfileWorkspaces(workspace({ id: 'default' }));
    const next = updateWorkspaceContent(collection, 'ghost', {
      dockLayout: validDockLayout(),
      paneStates: {},
      selection: null,
    });
    expect(next).toEqual(collection);
  });

  it('creates Workspace ids that do not collide', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createWorkspaceId()));
    expect(ids.size).toBe(50);
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
  function fakeDockApi(
    initialPanelIds: readonly string[] = []
  ): WorkspaceDockApi & { loaded: SerializedDockview[]; failPopout: () => void } {
    let panelIds = [...initialPanelIds];
    const loaded: SerializedDockview[] = [];
    let failHandlers: Array<() => void> = [];
    return {
      get panels() {
        return panelIds.map(id => ({ id }));
      },
      toJSON: () => validDockLayout(panelIds),
      fromJSON: (data: SerializedDockview) => {
        loaded.push(data);
        panelIds = Object.keys(data.panels);
      },
      onDidOpenPopoutWindowFail: callback => {
        failHandlers.push(callback);
        return { dispose: () => { failHandlers = failHandlers.filter(h => h !== callback); } };
      },
      // Test-only: simulates dockview discovering a blocked popout.
      failPopout: () => failHandlers.forEach(h => h()),
      loaded,
    };
  }

  it('snapshots exactly the open Panes\' dock layout and their own state', () => {
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
    const saved = snapshotWorkspace(api, 'w1', 'Motion', selection);

    expect(saved.id).toBe('w1');
    expect(saved.name).toBe('Motion');
    expect(saved.paneStates).toEqual({
      'register#1': { query: 'MOTOR' },
      'register#2': { query: 'SPINDLE' },
    });
    expect(Object.keys(saved.dockLayout.panels)).toEqual(['register#1', 'register#2']);
    // The shared Inspector's selection travels with the Workspace it was made
    // in — restoring one that carried no selection must not leave a stale
    // Inspector reading, and switching to one that did must reproduce it.
    expect(saved.selection).toEqual(selection);
  });

  it('carries a null selection through unchanged', () => {
    const api = fakeDockApi(['overview']);
    const saved = snapshotWorkspace(api, 'w1', 'Overview only', null);
    expect(saved.selection).toBeNull();
  });

  it('restoring reproduces two Panes of the same kind with independent state', () => {
    loadPaneStates({
      'register#1': { query: 'MOTOR' },
      'register#2': { query: 'SPINDLE' },
    });
    const api = fakeDockApi(['register#1', 'register#2']);
    const saved = snapshotWorkspace(api, 'w1', 'Motion', null);

    // Simulate moving on: the store now holds something else entirely.
    loadPaneStates({ overview: { anything: true } });

    restoreWorkspace(api, saved);

    expect(api.loaded).toEqual([saved.dockLayout]);
    // paneState was reseeded from the saved snapshot before fromJSON ran.
    expect(snapshotPaneStates(['register#1', 'register#2'])).toEqual({
      'register#1': { query: 'MOTOR' },
      'register#2': { query: 'SPINDLE' },
    });
  });

  it('carries a Daughter Window through a save/restore round-trip unchanged', () => {
    // `snapshotWorkspace`/`restoreWorkspace` never inspect `dockLayout` beyond
    // validating its shape — `popoutGroups` is opaque to this module exactly
    // like every other field dockview's own `toJSON()` produces, which is
    // what "no new persistence" (spec.md) actually means in code: nothing
    // here has to know a Daughter Window exists for one to survive a save.
    const withPopout: SerializedDockview = {
      ...validDockLayout(['overview']),
      popoutGroups: [
        {
          data: { id: 'popout-group-1', views: ['plot#1'], activeView: 'plot#1' },
          position: { left: 200, top: 100, width: 640, height: 480 },
        },
      ],
    } as unknown as SerializedDockview;

    const api = fakeDockApi(['overview']);
    api.toJSON = () => withPopout;
    const saved = snapshotWorkspace(api, 'w1', 'With a Daughter Window', null);

    expect(saved.dockLayout.popoutGroups).toEqual(withPopout.popoutGroups);

    restoreWorkspace(api, saved);
    expect(api.loaded.at(-1)).toEqual(withPopout);
  });

  it('switching Workspace loads the incoming Workspace\'s own dock layout, including its Daughter Windows, not the outgoing one\'s', () => {
    const outgoing = snapshotWorkspace(fakeDockApi(['overview']), 'w1', 'Outgoing', null);
    const incomingLayout: SerializedDockview = {
      ...validDockLayout(['register']),
      popoutGroups: [{ data: { id: 'popout-group-2', views: ['plot#1'], activeView: 'plot#1' }, position: { left: 0, top: 0, width: 640, height: 480 } }],
    } as unknown as SerializedDockview;
    const incoming: StoredWorkspace = { id: 'w2', name: 'Incoming', dockLayout: incomingLayout, paneStates: {}, selection: null };

    const api = fakeDockApi(['overview']);
    restoreWorkspace(api, outgoing);
    restoreWorkspace(api, incoming);

    // The api's own panel/window state after the switch is the incoming
    // Workspace's exactly — dockview's `fromJSON` clears before it loads
    // (the module doc comment above already establishes this), so there is
    // no trace of `outgoing`'s dockLayout left for the last restore to have
    // merged in.
    expect(api.loaded.at(-1)).toEqual(incomingLayout);
    expect(api.loaded.at(-1)?.popoutGroups).toEqual(incomingLayout.popoutGroups);
  });

  it('a retry after a blocked restore reopens exactly what was stored, unmodified by the failed attempt', () => {
    const withPopout: SerializedDockview = {
      ...validDockLayout(['overview']),
      popoutGroups: [{ data: { id: 'popout-group-1', views: ['plot#1'], activeView: 'plot#1' }, position: { left: 200, top: 100, width: 640, height: 480 } }],
    } as unknown as SerializedDockview;
    const stored: StoredWorkspace = { id: 'w1', name: 'With a Daughter Window', dockLayout: withPopout, paneStates: {}, selection: null };

    const api = fakeDockApi();
    const guard = createRestoreGuard(api, () => {});

    // The first attempt: dockview accepts the load, then — asynchronously,
    // in the real mechanism — discovers the popout was blocked.
    guard.reset();
    restoreWorkspace(api, stored);
    api.failPopout();
    expect(guard.blocked).toBe(true);

    // The retry: `AppShell.tsx`'s `applyWorkspace` resets the guard and
    // restores the *same*, never-overwritten `stored` object again — nothing
    // in this module mutates it between attempts, which is what makes a
    // retry possible at all rather than reopening a layout already damaged
    // by the redock autosave was frozen to prevent.
    guard.reset();
    restoreWorkspace(api, stored);

    expect(guard.blocked).toBe(false);
    expect(api.loaded).toEqual([withPopout, withPopout]);
    expect(api.loaded.at(-1)?.popoutGroups).toEqual(withPopout.popoutGroups);
  });
});

/**
 * The data-loss path. What matters here is not which dockview methods get
 * called in which order — it's the one observable fact that follows from it:
 * a blocked restore must never let autosave overwrite the stored Workspace,
 * and a retry must be able to try again cleanly.
 */
describe('the blocked-restore guard', () => {
  function fakeDockApi(): WorkspaceDockApi & { failPopout: () => void } {
    let failHandlers: Array<() => void> = [];
    return {
      panels: [],
      toJSON: () => validDockLayout(),
      fromJSON: () => {},
      onDidOpenPopoutWindowFail: callback => {
        failHandlers.push(callback);
        return { dispose: () => { failHandlers = failHandlers.filter(h => h !== callback); } };
      },
      failPopout: () => failHandlers.forEach(h => h()),
    };
  }

  it('stays unblocked through a restore where nothing fails', () => {
    const api = fakeDockApi();
    const onBlocked = vi.fn();
    const guard = createRestoreGuard(api, onBlocked);

    expect(guard.blocked).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it('flags a restore as blocked the moment a popout fails to open, and says so once', () => {
    const api = fakeDockApi();
    const onBlocked = vi.fn();
    const guard = createRestoreGuard(api, onBlocked);

    api.failPopout();
    expect(guard.blocked).toBe(true);
    expect(onBlocked).toHaveBeenCalledTimes(1);

    // A saved Workspace can carry more than one Daughter Window; every one of
    // them failing during the same restore must still read as one blocked
    // restore, not one retry-prompt per failed window.
    api.failPopout();
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it('clears on reset, so a retry starts from a clean slate', () => {
    const api = fakeDockApi();
    const guard = createRestoreGuard(api, vi.fn());

    api.failPopout();
    expect(guard.blocked).toBe(true);

    guard.reset();
    expect(guard.blocked).toBe(false);
  });

  it('can flag a second, later restore as blocked again after a reset', () => {
    const api = fakeDockApi();
    const onBlocked = vi.fn();
    const guard = createRestoreGuard(api, onBlocked);

    api.failPopout();
    guard.reset();

    api.failPopout();
    expect(guard.blocked).toBe(true);
    expect(onBlocked).toHaveBeenCalledTimes(2);
  });

  it('stops reacting to failures once disposed', () => {
    const api = fakeDockApi();
    const onBlocked = vi.fn();
    const guard = createRestoreGuard(api, onBlocked);

    guard.dispose();
    api.failPopout();

    expect(guard.blocked).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();
  });
});
