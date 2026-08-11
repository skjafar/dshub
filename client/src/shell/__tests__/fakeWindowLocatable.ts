import type { WindowLocatable } from '../focusMode';

/**
 * A hand-built stand-in for the live dock api's window-location surface — no
 * real dockview instance, per ADR-0001's test net. Shared by every test that
 * exercises `windowIdForPane` or anything built on it (`paneMenuEntries`,
 * Focus Mode's own window resolution), so there is one fake per interface
 * rather than one per test file.
 */
export function fakeWindowLocatable(
  panels: Record<string, { readonly window: Window }>,
  popouts: ReadonlyArray<{ readonly id: string; readonly window: Window }>
): WindowLocatable {
  return {
    getPanel: (id: string) => {
      const panel = panels[id];
      return panel === undefined ? undefined : { group: { api: { getWindow: () => panel.window } } };
    },
    getPopouts: () => popouts,
  };
}
