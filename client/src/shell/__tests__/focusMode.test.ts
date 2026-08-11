import { describe, it, expect } from 'vitest';
import { MAIN_WINDOW_ID, focusWidgetPaneId, resolveFocusDashboard, windowIdForPane } from '../focusMode';
import type { StoredDashboard } from '../widgets/dashboardStore';
import { fakeWindowLocatable as fakeDockApi } from './fakeWindowLocatable';

function dashboard(id: string, name: string): StoredDashboard {
  return { id, name, widgets: [] };
}

describe('resolveFocusDashboard', () => {
  it('shows the remembered Dashboard when it still exists', () => {
    const dashboards = [dashboard('a', 'Overview'), dashboard('b', 'Motion')];
    expect(resolveFocusDashboard(dashboards, 'b')).toEqual(dashboard('b', 'Motion'));
  });

  it('falls back to the first Dashboard when nothing is remembered yet', () => {
    const dashboards = [dashboard('a', 'Overview'), dashboard('b', 'Motion')];
    expect(resolveFocusDashboard(dashboards, null)).toEqual(dashboard('a', 'Overview'));
  });

  it('falls back to the first Dashboard when the remembered id was deleted', () => {
    const dashboards = [dashboard('a', 'Overview'), dashboard('b', 'Motion')];
    expect(resolveFocusDashboard(dashboards, 'deleted')).toEqual(dashboard('a', 'Overview'));
  });

  it('is null when the Profile has no Dashboards at all', () => {
    expect(resolveFocusDashboard([], 'anything')).toBeNull();
    expect(resolveFocusDashboard([], null)).toBeNull();
  });
});

describe('windowIdForPane', () => {
  it('resolves to the Main Window for a panel in the main grid', () => {
    const mainWindow = {} as Window;
    const api = fakeDockApi({ dashboard: { window: mainWindow } }, []);

    expect(windowIdForPane(api, 'dashboard')).toBe(MAIN_WINDOW_ID);
  });

  it('resolves to the owning popout for a panel rendered in a Daughter Window', () => {
    const mainWindow = {} as Window;
    const daughterWindow = {} as Window;
    const api = fakeDockApi(
      { dashboard: { window: daughterWindow } },
      [{ id: 'popout-1', window: daughterWindow }]
    );

    expect(windowIdForPane(api, 'dashboard')).toBe('popout-1');
    // A second Daughter Window's popout entry never matches the Main Window's own panel.
    expect(windowIdForPane(fakeDockApi({ other: { window: mainWindow } }, []), 'other')).toBe(MAIN_WINDOW_ID);
  });

  it('picks the right Daughter Window out of several open at once', () => {
    const first = {} as Window;
    const second = {} as Window;
    const api = fakeDockApi(
      { a: { window: first }, b: { window: second } },
      [
        { id: 'popout-1', window: first },
        { id: 'popout-2', window: second },
      ]
    );

    expect(windowIdForPane(api, 'a')).toBe('popout-1');
    expect(windowIdForPane(api, 'b')).toBe('popout-2');
  });

  it('falls back to the Main Window for a panel id the api does not recognise', () => {
    const api = fakeDockApi({}, []);
    expect(windowIdForPane(api, 'closed-or-never-opened')).toBe(MAIN_WINDOW_ID);
  });
});

describe('focusWidgetPaneId', () => {
  it('gives each Window a distinct owner key, so two Windows in Focus Mode at once never collide', () => {
    expect(focusWidgetPaneId(MAIN_WINDOW_ID)).not.toBe(focusWidgetPaneId('popout-1'));
  });
});
