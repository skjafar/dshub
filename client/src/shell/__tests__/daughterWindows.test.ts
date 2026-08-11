import { describe, it, expect } from 'vitest';
import {
  DAUGHTER_WINDOW_WARNING_THRESHOLD,
  dragOutTarget,
  paneMenuEntries,
  shouldWarnBeforeNewDaughterWindow,
  windowLabel,
} from '../daughterWindows';
import { MAIN_WINDOW_ID } from '../focusMode';
import { PANES } from '../paneRegistry';
import { fakeWindowLocatable as fakeDockApi } from './fakeWindowLocatable';

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

describe('paneMenuEntries', () => {
  const inspector = PANES.find(p => p.kind === 'inspector');
  const register = PANES.find(p => p.kind === 'register');
  if (inspector === undefined || register === undefined) throw new Error('fixture Pane kinds missing from PANES');

  it('offers a Pane normally when it is not open at all', () => {
    const api = fakeDockApi({}, []);
    const entries = paneMenuEntries([inspector], [], api, MAIN_WINDOW_ID, []);
    expect(entries).toEqual([{ kind: 'inspector', title: inspector.title, disabledLocation: null }]);
  });

  it('never disables a non-singleton kind, open or not', () => {
    const main = {} as Window;
    const api = fakeDockApi({ register: { window: main } }, []);
    const entries = paneMenuEntries([register], ['register'], api, MAIN_WINDOW_ID, []);
    expect(entries[0]?.disabledLocation).toBeNull();
  });

  it('leaves a singleton open in the same Window as the menu clickable', () => {
    const main = {} as Window;
    const api = fakeDockApi({ inspector: { window: main } }, []);
    const entries = paneMenuEntries([inspector], ['inspector'], api, MAIN_WINDOW_ID, []);
    expect(entries[0]?.disabledLocation).toBeNull();
  });

  it('disables and labels a singleton open in a different Window', () => {
    const main = {} as Window;
    const daughter = {} as Window;
    const api = fakeDockApi({ inspector: { window: daughter } }, [{ id: 'popout-1', window: daughter }]);
    const entries = paneMenuEntries([inspector], ['inspector'], api, MAIN_WINDOW_ID, ['popout-1']);
    expect(entries[0]?.disabledLocation).toBe('Daughter Window 1');
  });

  it('labels the same singleton as open in Main Window, from a Daughter Window\'s own menu', () => {
    const main = {} as Window;
    const daughter = {} as Window;
    const api = fakeDockApi({ inspector: { window: main } }, [{ id: 'popout-1', window: daughter }]);
    const entries = paneMenuEntries([inspector], ['inspector'], api, 'popout-1', ['popout-1']);
    expect(entries[0]?.disabledLocation).toBe('Main Window');
  });
});
