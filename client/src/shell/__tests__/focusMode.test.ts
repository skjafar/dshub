import { describe, it, expect } from 'vitest';
import { resolveFocusDashboard } from '../focusMode';
import type { StoredDashboard } from '../widgets/dashboardStore';

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
