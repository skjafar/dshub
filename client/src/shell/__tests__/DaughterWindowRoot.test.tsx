// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { DSHubProvider } from '../../contexts/DSHubContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { mapManager } from '../../maps/mapManager';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type { MapProfile } from '../../types/settings';
import { TooltipProvider } from '../../ui';
import { DaughterWindowRoot } from '../DaughterWindowRoot';
import { createDashboardId } from '../widgets/dashboardStore';
import type { ProfileDashboards, StoredDashboard } from '../widgets/dashboardStore';
import type { PaneMenuEntry } from '../daughterWindows';

/**
 * A Daughter Window's own root, specifically its Focus Mode composition
 * (spec.md story 36: "a Daughter Window in Focus Mode hides its add-Pane
 * control, so that a locked panel really is locked"). The chrome itself —
 * link/Control state, the add-Pane menu's own contents — is
 * `DaughterWindowChrome.test.tsx`'s concern; this only pins how the two
 * compose.
 */

const STORAGE_KEY = 'dshub_settings';

const PROFILE: MapProfile = {
  id: 'daughter-window-root-test-board',
  name: 'Daughter Window Root test board',
  isDefault: false,
  registersMap: '',
  parametersMap: '',
  createdAt: 0,
};

function seedDashboard(name: string): StoredDashboard {
  const dashboard: StoredDashboard = { id: createDashboardId(), name, widgets: [] };
  const dashboardsByProfile: Record<string, ProfileDashboards> = { [PROFILE.id]: { dashboards: [dashboard] } };
  const settings = {
    ...DEFAULT_SETTINGS,
    mapProfiles: [PROFILE],
    activeMapProfileId: PROFILE.id,
    dashboardsByProfile,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  return dashboard;
}

const ENTRIES: readonly PaneMenuEntry[] = [{ kind: 'overview', title: 'Overview', disabledLocation: null }];

function renderRoot(focusDashboardId: string | null): { onExitFocusMode: ReturnType<typeof vi.fn> } {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  const onExitFocusMode = vi.fn();
  render(
    <BackendPortProvider port={fake as BackendPort}>
      <SettingsProvider>
        <DSHubProvider>
          <TooltipProvider>
            <DaughterWindowRoot
              windowId="popout-1"
              portalContainer={document.body}
              entries={ENTRIES}
              onOpenPane={vi.fn()}
              focusDashboardId={focusDashboardId}
              onExitFocusMode={onExitFocusMode}
            />
          </TooltipProvider>
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );
  return { onExitFocusMode };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  localStorage.removeItem(STORAGE_KEY);
  await mapManager.initialize(PROFILE);
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
});

describe('DaughterWindowRoot', () => {
  it('shows its own chrome, reachably, when not in Focus Mode', async () => {
    renderRoot(null);
    await settle();

    expect(screen.getByRole('button', { name: 'Add a pane' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exit Focus Mode' })).not.toBeInTheDocument();
  });

  it('hides the add-Pane control from both pointer and keyboard/AT while in Focus Mode', async () => {
    const dashboard = seedDashboard('Motion');
    renderRoot(dashboard.id);
    await settle();

    // `getByRole` (unlike a plain DOM query) already excludes anything
    // `hidden` — this is the assertion that closes the gap the fix
    // addresses: visual coverage alone left the button in the accessibility
    // tree and tab order even though the FocusModeView overlay sat on top of it.
    expect(screen.queryByRole('button', { name: 'Add a pane' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit Focus Mode' })).toBeInTheDocument();
  });

  it('exits Focus Mode for just this Window via the callback the overlay is given', async () => {
    const dashboard = seedDashboard('Motion');
    const { onExitFocusMode } = renderRoot(dashboard.id);
    await settle();

    screen.getByRole('button', { name: 'Exit Focus Mode' }).click();
    expect(onExitFocusMode).toHaveBeenCalledTimes(1);
  });
});
