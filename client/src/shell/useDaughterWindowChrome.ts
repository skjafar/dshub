import { useEffect, useState } from 'react';
import type { AppTheme } from '../appThemes';
import { applyThemeVariables } from '../design/themeVariables';

interface OpenPopout {
  readonly id: string;
  readonly window: Window;
}

/**
 * Everything a Daughter Window's own chrome portal needs that isn't the
 * chrome's own content: a place in that popout's document to portal into,
 * and the theme kept in step with the rest of the app.
 *
 * Split out of `AppShell.tsx`: "which Windows exist and how each one hosts
 * its chrome" is a different concern from Workspace persistence, Focus Mode
 * or popout creation/destruction, not because either effect here is complex
 * on its own.
 */
export function useDaughterWindowChrome(
  openPopouts: readonly OpenPopout[],
  theme: AppTheme
): ReadonlyMap<string, HTMLElement> {
  // State, not a ref: a newly created container has to be visible to the
  // very next render — the one that portals `DaughterWindowRoot` into it —
  // and mutating a ref gives React no reason to schedule that render on its
  // own. A `Map` mutated by reference would only be picked up by luck, on
  // whichever later render some *other* state change happened to trigger.
  const [containers, setContainers] = useState<ReadonlyMap<string, HTMLElement>>(new Map());

  useEffect(() => {
    setContainers(previous => {
      const liveIds = new Set(openPopouts.map(p => p.id));
      let changed = false;
      const next = new Map(previous);

      // Drop containers for Windows that closed. Nothing to clean up on the
      // DOM side — the whole native window is already gone.
      for (const id of next.keys()) {
        if (!liveIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }

      for (const popout of openPopouts) {
        if (next.has(popout.id)) continue;
        // Inserted ahead of dockview's own adopted container (appended
        // separately, outside React's knowledge) so the chrome renders as a
        // top bar rather than below the dock — `popout.html`'s stylesheet
        // is what actually lays the two out as a column.
        const container = popout.window.document.createElement('div');
        popout.window.document.body.insertBefore(container, popout.window.document.body.firstChild);
        next.set(popout.id, container);
        changed = true;
      }

      return changed ? next : previous;
    });
  }, [openPopouts]);

  // Theme reaches every open Window at once (spec.md, story 37): the Main
  // Window publishes to its own document already (`App.tsx`); this is the
  // other half, applied directly to each popout document's own root since a
  // Daughter Window has no un-themed surface for `ThemeScope` to scope
  // around — see `ui/ThemeScope.tsx`'s `PortalContainerScope` doc comment.
  useEffect(() => {
    for (const popout of openPopouts) {
      applyThemeVariables(theme, popout.window.document.documentElement);
    }
  }, [openPopouts, theme]);

  return containers;
}
