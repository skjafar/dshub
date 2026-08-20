import { describe, it, expect } from 'vitest';
import {
  DAUGHTER_WINDOW_WARNING_THRESHOLD,
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

function locations(entries: Record<string, readonly string[]>): ReadonlyMap<WindowId, readonly string[]> {
  return new Map(Object.entries(entries));
}

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

describe('windowLabel', () => {
  it('names the Main Window plainly', () => {
    expect(windowLabel(MAIN_WINDOW_ID, [])).toBe('Main Window');
  });

  it('numbers a Daughter Window by its position among the open ones', () => {
    expect(windowLabel('popout-a', ['popout-a', 'popout-b'])).toBe('Daughter Window 1');
    expect(windowLabel('popout-b', ['popout-a', 'popout-b'])).toBe('Daughter Window 2');
  });

  it('falls back plainly for a Daughter Window id not in the open list', () => {
    expect(windowLabel('popout-gone', [])).toBe('a Daughter Window');
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
    const entries = paneMenuEntries([inspector], locations({}), MAIN_WINDOW_ID, []);
    expect(entries).toEqual([{ kind: 'inspector', title: inspector.title, disabledLocation: null }]);
  });

  it('never disables a non-singleton kind, open or not', () => {
    const entries = paneMenuEntries([register], locations({ [MAIN_WINDOW_ID]: ['register#1'] }), MAIN_WINDOW_ID, []);
    expect(entries[0]?.disabledLocation).toBeNull();
  });

  it('leaves a singleton open in the same Window as the menu clickable', () => {
    const entries = paneMenuEntries([inspector], locations({ [MAIN_WINDOW_ID]: ['inspector'] }), MAIN_WINDOW_ID, []);
    expect(entries[0]?.disabledLocation).toBeNull();
  });

  it('disables and labels a singleton open in a different Window', () => {
    const entries = paneMenuEntries(
      [inspector],
      locations({ 'popout-1': ['inspector'] }),
      MAIN_WINDOW_ID,
      ['popout-1']
    );
    expect(entries[0]?.disabledLocation).toBe('Daughter Window 1');
  });

  it("labels the same singleton as open in Main Window, from a Daughter Window's own menu", () => {
    const entries = paneMenuEntries(
      [inspector],
      locations({ [MAIN_WINDOW_ID]: ['inspector'] }),
      'popout-1',
      ['popout-1']
    );
    expect(entries[0]?.disabledLocation).toBe('Main Window');
  });

  it('offers a singleton normally when no Window currently reports it open', () => {
    const entries = paneMenuEntries([inspector], locations({ 'popout-1': ['register#1'] }), MAIN_WINDOW_ID, ['popout-1']);
    expect(entries[0]?.disabledLocation).toBeNull();
  });
});

describe('moveTargets', () => {
  const registerPane = { kind: 'register' as const, singleton: false };
  const inspectorPane = { kind: 'inspector' as const, singleton: true };

  it('lists every open Window except the one the Pane is already in', () => {
    const targets = moveTargets(registerPane, MAIN_WINDOW_ID, locations({}), ['daughter-1', 'daughter-2']);
    expect(targets).toEqual([
      { windowId: 'daughter-1', label: 'Daughter Window 1' },
      { windowId: 'daughter-2', label: 'Daughter Window 2' },
    ]);
  });

  it('includes the Main Window as a target from a Daughter Window', () => {
    const targets = moveTargets(registerPane, 'daughter-1', locations({}), ['daughter-1']);
    expect(targets).toEqual([{ windowId: MAIN_WINDOW_ID, label: 'Main Window' }]);
  });

  it('is empty when no other Window is open', () => {
    expect(moveTargets(registerPane, MAIN_WINDOW_ID, locations({}), [])).toEqual([]);
  });

  it('never excludes a target for a non-singleton kind, whatever is open there', () => {
    const targets = moveTargets(
      registerPane,
      MAIN_WINDOW_ID,
      locations({ 'daughter-1': ['register#1'] }),
      ['daughter-1']
    );
    expect(targets).toEqual([{ windowId: 'daughter-1', label: 'Daughter Window 1' }]);
  });

  it('excludes a Window that already has this singleton open — moving there would collide', () => {
    const targets = moveTargets(
      inspectorPane,
      MAIN_WINDOW_ID,
      locations({ 'daughter-1': ['inspector'] }),
      ['daughter-1', 'daughter-2']
    );
    expect(targets).toEqual([{ windowId: 'daughter-2', label: 'Daughter Window 2' }]);
  });

  it('still offers a Window that has other Panes open but not this singleton', () => {
    const targets = moveTargets(
      inspectorPane,
      MAIN_WINDOW_ID,
      locations({ 'daughter-1': ['register#1'] }),
      ['daughter-1']
    );
    expect(targets).toEqual([{ windowId: 'daughter-1', label: 'Daughter Window 1' }]);
  });
});
