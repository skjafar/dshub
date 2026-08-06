// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { DSHubProvider } from '../../contexts/DSHubContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { mapManager } from '../../maps/mapManager';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';
import { InterfaceType } from '../../types/shared';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type { MapProfile } from '../../types/settings';
import { TooltipProvider } from '../../ui';
import { FocusModeView } from '../FocusModeView';
import { createDashboardId, createWidgetId } from '../widgets/dashboardStore';
import type { ProfileDashboards, StoredDashboard, StoredWidget } from '../widgets/dashboardStore';
import { defaultBoundWidgetConfig, defaultDropdownWidgetConfig, defaultValueWriteWidgetConfig } from '../widgets/widgetConfig';

/**
 * Focus Mode's own view: one Dashboard, full-canvas, layout locked, chrome
 * minimised to link and Control state plus a single way out (ticket 18).
 *
 * The grid itself — binding, formatting, thresholds, the stale state — is
 * `DashboardGrid`'s own concern and already pinned end to end by
 * `DashboardPane.test.tsx`. What is specific to this view: the layout is
 * never editable regardless of what a Dashboard Pane elsewhere might be
 * doing, link/Control stay visible despite the minimised chrome, and leaving
 * is available both by pointer and by keyboard.
 */

const STORAGE_KEY = 'dshub_settings';

/** Read/Write, so the write path is reachable — a plain register Map defaults to read-only. */
const REGISTERS_MAP = `
// Read/Write
uint32_t  SPINDLE_RPM;
`;
const SPINDLE_RPM_ADDRESS = 0;

const PROFILE: MapProfile = {
  id: 'focus-mode-test-board',
  name: 'Focus Mode test board',
  isDefault: false,
  registersMap: REGISTERS_MAP,
  parametersMap: '',
  createdAt: 0,
};

function seedActiveProfile(dashboardsByProfile?: Record<string, ProfileDashboards>): void {
  const settings = {
    ...DEFAULT_SETTINGS,
    mapProfiles: [PROFILE],
    activeMapProfileId: PROFILE.id,
    ...(dashboardsByProfile ? { dashboardsByProfile } : {}),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function storedWidget(config: StoredWidget['config']): StoredWidget {
  return storedWidgetOfKind('valueRead', config);
}

function storedWidgetOfKind(kind: StoredWidget['kind'], config: StoredWidget['config']): StoredWidget {
  return { id: createWidgetId(), kind, layout: { x: 0, y: 0, w: 3, h: 2 }, config };
}

function seedDashboard(name: string, widgets: readonly StoredWidget[] = []): StoredDashboard {
  const dashboard: StoredDashboard = { id: createDashboardId(), name, widgets };
  seedActiveProfile({ [PROFILE.id]: { dashboards: [dashboard] } });
  return dashboard;
}

type FakePort = ReturnType<typeof createFakeBackendPort>;

function renderFocusMode(dashboardId: string, onExit = vi.fn()): { fake: FakePort; onExit: typeof onExit } {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  render(
    <BackendPortProvider port={fake as BackendPort}>
      <SettingsProvider>
        <DSHubProvider>
          <TooltipProvider>
            <FocusModeView dashboardId={dashboardId} onExit={onExit} />
          </TooltipProvider>
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );
  return { fake, onExit };
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

describe('FocusModeView', () => {
  it('shows the named Dashboard’s Widgets with no configure or remove affordance', async () => {
    const dashboard = seedDashboard('Motion', [
      storedWidget({
        ...defaultBoundWidgetConfig('RPM'),
        binding: { space: 'register', address: SPINDLE_RPM_ADDRESS },
      }),
    ]);
    const { fake } = renderFocusMode(dashboard.id);
    await settle();
    await act(async () => {
      await fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });
    await act(async () => {
      await fake.device.writeRegister(SPINDLE_RPM_ADDRESS, 1500);
    });

    expect(screen.getByText('1500')).toBeInTheDocument();
    expect(screen.getByText('Motion')).toBeInTheDocument();
    // Locked: nothing offers to configure or remove the Widget, unlike a Dashboard Pane in edit mode.
    expect(screen.queryByRole('button', { name: /^Configure/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it('keeps link and Control state visible despite the minimised chrome', async () => {
    const dashboard = seedDashboard('Motion');
    const { fake } = renderFocusMode(dashboard.id);
    await settle();

    expect(screen.getByRole('status', { name: 'Device link' })).toHaveTextContent(/no device/i);

    await act(async () => {
      await fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });

    expect(screen.getByRole('status', { name: 'Device link' })).toHaveTextContent(/online/i);
    expect(screen.getByText(/no control/i)).toBeInTheDocument();
  });

  it('falls back to the Profile’s first Dashboard when the given id no longer exists', async () => {
    seedDashboard('Overview');
    renderFocusMode('a-deleted-dashboard-id');
    await settle();

    expect(screen.getByText('Overview')).toBeInTheDocument();
  });

  it('reports plainly when the Profile has no Dashboards at all', async () => {
    seedActiveProfile({ [PROFILE.id]: { dashboards: [] } });
    renderFocusMode('anything');
    await settle();

    expect(screen.getByText(/no dashboards to show/i)).toBeInTheDocument();
  });

  it('leaves on a click of Exit Focus Mode', async () => {
    const user = userEvent.setup();
    const dashboard = seedDashboard('Motion');
    const { onExit } = renderFocusMode(dashboard.id);
    await settle();

    await user.click(screen.getByRole('button', { name: 'Exit Focus Mode' }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('leaves on Escape, so the keyboard path out never depends on finding the button', async () => {
    const user = userEvent.setup();
    const dashboard = seedDashboard('Motion');
    const { onExit } = renderFocusMode(dashboard.id);
    await settle();

    await user.keyboard('{Escape}');

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('starts with keyboard focus already on the way out', async () => {
    const dashboard = seedDashboard('Motion');
    renderFocusMode(dashboard.id);
    await settle();

    expect(screen.getByRole('button', { name: 'Exit Focus Mode' })).toHaveFocus();
  });

  it('does not leave on an Escape that only cancels a Value Write field’s own draft', async () => {
    // ValueWriteWidget's and WriteBar's own Escape ("abandon this draft")
    // does not call `preventDefault`, so a window-level listener sees the
    // exact same keypress. Without deferring to a focused text field here,
    // an Operator cancelling a half-typed setpoint would be knocked out of
    // Focus Mode by the same keystroke — leaving by accident while trying
    // only to undo an edit, which is precisely what "not accidental" rules
    // out.
    const user = userEvent.setup();
    const dashboard = seedDashboard('Motion', [
      storedWidgetOfKind('valueWrite', {
        ...defaultValueWriteWidgetConfig('Setpoint'),
        binding: { space: 'register', address: SPINDLE_RPM_ADDRESS },
      }),
    ]);
    const { fake, onExit } = renderFocusMode(dashboard.id);
    await settle();
    await act(async () => {
      await fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });
    await act(async () => {
      await fake.device.takeControl();
    });
    await act(async () => {
      await fake.device.writeRegister(SPINDLE_RPM_ADDRESS, 1500);
    });

    const field = screen.getByRole('textbox', { name: 'Setpoint' });
    await user.click(field);
    await user.type(field, '999');
    expect(field).toHaveValue('1500999');

    await user.keyboard('{Escape}');

    expect(onExit).not.toHaveBeenCalled();
    expect(field).toHaveValue('1500');

    // A second Escape, once focus has actually left the field, still leaves.
    await user.tab();
    await user.keyboard('{Escape}');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('does not leave on an Escape that only closes a Dropdown’s open picklist', async () => {
    // Radix's own Escape handling for an open `Select` (`ui/Select.tsx`) runs
    // in the capture phase and does call `preventDefault` — unlike
    // ValueWriteWidget's — so this is a second, differently-shaped way the
    // same accidental-leave could slip through: deferring only to a focused
    // text field would miss it, since the listbox itself is not one.
    const user = userEvent.setup();
    const dashboard = seedDashboard('Motion', [
      storedWidgetOfKind('dropdown', {
        ...defaultDropdownWidgetConfig('Mode'),
        binding: { space: 'register', address: SPINDLE_RPM_ADDRESS },
        options: [
          { value: 0, label: 'Idle' },
          { value: 1, label: 'Run' },
        ],
      }),
    ]);
    const { fake, onExit } = renderFocusMode(dashboard.id);
    await settle();
    await act(async () => {
      await fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });
    await act(async () => {
      await fake.device.takeControl();
    });
    await act(async () => {
      await fake.device.writeRegister(SPINDLE_RPM_ADDRESS, 0);
    });

    // Focus + Enter rather than a click: jsdom has no `hasPointerCapture`,
    // which Radix's `Select` needs on the click-to-open path.
    screen.getByRole('combobox', { name: 'Mode' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();

    // A second Escape, once the picklist is already closed, still leaves.
    await user.keyboard('{Escape}');
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
