import { describe, it, expect } from 'vitest';
import {
  DAUGHTER_WINDOW_WARNING_THRESHOLD,
  customWindowNames,
  deriveDaughterWindowLabel,
  dragOutTarget,
  knownWindowIds,
  moveTargets,
  paneMenuEntries,
  shouldWarnBeforeNewDaughterWindow,
  windowLabel,
} from '../daughterWindows';
import { MAIN_WINDOW_ID } from '../focusMode';
import type { WindowId } from '../focusMode';
import { PANES } from '../paneRegistry';
import type { StoredDaughterWindow } from '../workspaceStore';

function locations(entries: Record<string, readonly string[]>): ReadonlyMap<WindowId, readonly string[]> {
  return new Map(Object.entries(entries));
}

function names(entries: Record<string, string> = {}): ReadonlyMap<WindowId, string> {
  return new Map(Object.entries(entries));
}

const NO_NAMES = names();

describe('shouldWarnBeforeNewDaughterWindow', () => {
  it('does not warn below the threshold', () => {
    expect(shouldWarnBeforeNewDaughterWindow(0)).toBe(false);
    expect(shouldWarnBeforeNewDaughterWindow(DAUGHTER_WINDOW_WARNING_THRESHOLD - 1)).toBe(false);
  });

  it('warns once creating one more would be the fifth', () => {
    expect(shouldWarnBeforeNewDaughterWindow(DAUGHTER_WINDOW_WARNING_THRESHOLD)).toBe(true);
  });

  it('keeps warning past the threshold — a soft limit, not a hard one', () => {
    expect(shouldWarnBeforeNewDaughterWindow(DAUGHTER_WINDOW_WARNING_THRESHOLD + 10)).toBe(true);
  });
});

describe('dragOutTarget', () => {
  const mainWindow = { left: 0, top: 0, width: 1200, height: 800 };

  it('is null for a point inside an open Window — dockview\'s own drop handles it', () => {
    expect(dragOutTarget({ x: 600, y: 400 }, [mainWindow])).toBeNull();
  });

  it('is null for a point exactly on a Window\'s edge', () => {
    expect(dragOutTarget({ x: 1200, y: 800 }, [mainWindow])).toBeNull();
    expect(dragOutTarget({ x: 0, y: 0 }, [mainWindow])).toBeNull();
  });

  it('returns a position centred on the release point for a drag outside every Window', () => {
    const target = dragOutTarget({ x: 1400, y: 300 }, [mainWindow]);
    expect(target).not.toBeNull();
    expect(target?.left).toBeLessThan(1400);
    expect(target?.top).toBeLessThan(300);
  });

  it('checks against every open Window, not just the first', () => {
    const secondWindow = { left: 1300, top: 0, width: 600, height: 600 };
    // Inside the second Window, outside the first.
    expect(dragOutTarget({ x: 1500, y: 200 }, [mainWindow, secondWindow])).toBeNull();
    // Outside both.
    expect(dragOutTarget({ x: 5, y: 900 }, [mainWindow, secondWindow])).not.toBeNull();
  });
});

describe('deriveDaughterWindowLabel', () => {
  it('is null for a Window with nothing open yet', () => {
    expect(deriveDaughterWindowLabel([])).toBeNull();
  });

  it('names one open Pane by its title', () => {
    expect(deriveDaughterWindowLabel(['register#1'])).toBe('Registers');
  });

  it('joins several distinct kinds, in the order they appear', () => {
    expect(deriveDaughterWindowLabel(['plot#1', 'register#1'])).toBe('Plot, Registers');
  });

  it('deduplicates by kind — three Register Panes still read as one "Registers"', () => {
    expect(deriveDaughterWindowLabel(['register#1', 'register#2', 'register#3'])).toBe('Registers');
  });

  it('ignores a panel id naming no known Pane kind', () => {
    expect(deriveDaughterWindowLabel(['not-a-real-kind'])).toBeNull();
  });
});

describe('customWindowNames', () => {
  function entry(overrides: Partial<StoredDaughterWindow> = {}): StoredDaughterWindow {
    return {
      label: 'daughter-1',
      dockLayout: { grid: { root: { type: 'branch', data: [] }, height: 0, width: 0, orientation: 'HORIZONTAL' }, panels: {} } as never,
      paneStates: {},
      bounds: { x: 0, y: 0, width: 640, height: 480 },
      ...overrides,
    };
  }

  it('maps a label to its own custom name', () => {
    expect(customWindowNames([entry({ label: 'daughter-1', name: 'Scope monitor' })])).toEqual(names({ 'daughter-1': 'Scope monitor' }));
  });

  it('omits a Window with no custom name set', () => {
    expect(customWindowNames([entry({ name: null }), entry({ label: 'daughter-2' })])).toEqual(NO_NAMES);
  });

  it('omits a Window whose custom name was blanked back to an empty string', () => {
    expect(customWindowNames([entry({ name: '' })])).toEqual(NO_NAMES);
  });
});

describe('windowLabel', () => {
  it('names the Main Window plainly, regardless of any custom name', () => {
    expect(windowLabel(MAIN_WINDOW_ID, [], names({ [MAIN_WINDOW_ID]: 'Ignored' }), locations({}))).toBe('Main Window');
  });

  it("prefers a Daughter Window's own custom name over anything derived or positional", () => {
    const label = windowLabel(
      'popout-a',
      ['popout-a'],
      names({ 'popout-a': 'Scope monitor' }),
      locations({ 'popout-a': ['register#1'] })
    );
    expect(label).toBe('Scope monitor');
  });

  it('falls back to a label derived from its open Panes when no custom name is set', () => {
    const label = windowLabel('popout-a', ['popout-a'], NO_NAMES, locations({ 'popout-a': ['plot#1'] }));
    expect(label).toBe('Plot');
  });

  it('numbers a Daughter Window by its position among the open ones when it has neither a custom name nor anything open', () => {
    expect(windowLabel('popout-a', ['popout-a', 'popout-b'], NO_NAMES, locations({}))).toBe('Daughter Window 1');
    expect(windowLabel('popout-b', ['popout-a', 'popout-b'], NO_NAMES, locations({}))).toBe('Daughter Window 2');
  });

  it('falls back plainly for a Daughter Window id not in the open list', () => {
    expect(windowLabel('popout-gone', [], NO_NAMES, locations({}))).toBe('a Daughter Window');
  });
});

describe('knownWindowIds', () => {
  it('always includes the Main Window, even with no Daughter Windows open', () => {
    expect(knownWindowIds([])).toEqual([MAIN_WINDOW_ID]);
  });

  it('lists the Main Window plus every open Daughter Window, in order', () => {
    expect(knownWindowIds(['daughter-1', 'daughter-2'])).toEqual([MAIN_WINDOW_ID, 'daughter-1', 'daughter-2']);
  });
});

describe('paneMenuEntries', () => {
  const inspector = PANES.find(p => p.kind === 'inspector');
  const register = PANES.find(p => p.kind === 'register');
  if (inspector === undefined || register === undefined) throw new Error('fixture Pane kinds missing from PANES');

  it('offers a Pane normally when it is not open at all', () => {
    const entries = paneMenuEntries([inspector], locations({}), MAIN_WINDOW_ID, [], NO_NAMES);
    expect(entries).toEqual([{ kind: 'inspector', title: inspector.title, disabledLocation: null }]);
  });

  it('never disables a non-singleton kind, open or not', () => {
    const entries = paneMenuEntries([register], locations({ [MAIN_WINDOW_ID]: ['register#1'] }), MAIN_WINDOW_ID, [], NO_NAMES);
    expect(entries[0]?.disabledLocation).toBeNull();
  });

  it('leaves a singleton open in the same Window as the menu clickable', () => {
    const entries = paneMenuEntries([inspector], locations({ [MAIN_WINDOW_ID]: ['inspector'] }), MAIN_WINDOW_ID, [], NO_NAMES);
    expect(entries[0]?.disabledLocation).toBeNull();
  });

  it('disables and labels a singleton open in a different Window', () => {
    const entries = paneMenuEntries(
      [inspector],
      locations({ 'popout-1': ['inspector'] }),
      MAIN_WINDOW_ID,
      ['popout-1'],
      NO_NAMES
    );
    // "Inspector" — auto-derived from what popout-1 currently has open —
    // rather than the bare positional "Daughter Window 1", since a Window
    // with something open always has a more useful label than that now.
    expect(entries[0]?.disabledLocation).toBe('Inspector');
  });

  it("labels the same singleton as open in Main Window, from a Daughter Window's own menu", () => {
    const entries = paneMenuEntries(
      [inspector],
      locations({ [MAIN_WINDOW_ID]: ['inspector'] }),
      'popout-1',
      ['popout-1'],
      NO_NAMES
    );
    expect(entries[0]?.disabledLocation).toBe('Main Window');
  });

  it('offers a singleton normally when no Window currently reports it open', () => {
    const entries = paneMenuEntries(
      [inspector],
      locations({ 'popout-1': ['register#1'] }),
      MAIN_WINDOW_ID,
      ['popout-1'],
      NO_NAMES
    );
    expect(entries[0]?.disabledLocation).toBeNull();
  });

  it("labels a disabled location with its own custom name, when it has one", () => {
    const entries = paneMenuEntries(
      [inspector],
      locations({ 'popout-1': ['inspector'] }),
      MAIN_WINDOW_ID,
      ['popout-1'],
      names({ 'popout-1': 'Scope monitor' })
    );
    expect(entries[0]?.disabledLocation).toBe('Scope monitor');
  });
});

describe('moveTargets', () => {
  const registerPane = { kind: 'register' as const, singleton: false };
  const inspectorPane = { kind: 'inspector' as const, singleton: true };

  it('lists every open Window except the one the Pane is already in', () => {
    const targets = moveTargets(registerPane, MAIN_WINDOW_ID, locations({}), ['daughter-1', 'daughter-2'], NO_NAMES);
    expect(targets).toEqual([
      { windowId: 'daughter-1', label: 'Daughter Window 1' },
      { windowId: 'daughter-2', label: 'Daughter Window 2' },
    ]);
  });

  it('includes the Main Window as a target from a Daughter Window', () => {
    const targets = moveTargets(registerPane, 'daughter-1', locations({}), ['daughter-1'], NO_NAMES);
    expect(targets).toEqual([{ windowId: MAIN_WINDOW_ID, label: 'Main Window' }]);
  });

  it('is empty when no other Window is open', () => {
    expect(moveTargets(registerPane, MAIN_WINDOW_ID, locations({}), [], NO_NAMES)).toEqual([]);
  });

  it("labels a target by what it currently has open, when it has no custom name", () => {
    const targets = moveTargets(
      registerPane,
      MAIN_WINDOW_ID,
      locations({ 'daughter-1': ['register#1'] }),
      ['daughter-1'],
      NO_NAMES
    );
    expect(targets).toEqual([{ windowId: 'daughter-1', label: 'Registers' }]);
  });

  it("labels a target by its own custom name over what it currently has open", () => {
    const targets = moveTargets(
      registerPane,
      MAIN_WINDOW_ID,
      locations({ 'daughter-1': ['register#1'] }),
      ['daughter-1'],
      names({ 'daughter-1': 'Scope monitor' })
    );
    expect(targets).toEqual([{ windowId: 'daughter-1', label: 'Scope monitor' }]);
  });

  it('excludes a Window that already has this singleton open — moving there would collide', () => {
    const targets = moveTargets(
      inspectorPane,
      MAIN_WINDOW_ID,
      locations({ 'daughter-1': ['inspector'] }),
      ['daughter-1', 'daughter-2'],
      NO_NAMES
    );
    expect(targets).toEqual([{ windowId: 'daughter-2', label: 'Daughter Window 2' }]);
  });

  it('still offers a Window that has other Panes open but not this singleton', () => {
    const targets = moveTargets(
      inspectorPane,
      MAIN_WINDOW_ID,
      locations({ 'daughter-1': ['register#1'] }),
      ['daughter-1'],
      NO_NAMES
    );
    expect(targets).toEqual([{ windowId: 'daughter-1', label: 'Registers' }]);
  });
});
