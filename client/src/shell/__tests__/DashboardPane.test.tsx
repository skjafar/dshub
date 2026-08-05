// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
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
import { retainPaneState } from '../paneState';
import { DashboardPane } from '../panes/DashboardPane';
import {
  createDashboardId,
  createWidgetId,
} from '../widgets/dashboardStore';
import type { ProfileDashboards, StoredDashboard, StoredWidget } from '../widgets/dashboardStore';
import {
  defaultBoundWidgetConfig,
  defaultEncoderDisplayWidgetConfig,
  defaultGaugeWidgetConfig,
  defaultLedIndicatorWidgetConfig,
  defaultProgressBarWidgetConfig,
} from '../widgets/widgetConfig';
import type { BoundWidgetConfig } from '../widgets/widgetConfig';
import type { WidgetKind } from '../widgets/widgetRegistry';

/**
 * The Dashboard Pane, driven through the fake port.
 *
 * Ticket 14 proved the shared binding/format/threshold surface end to end
 * through `valueRead` alone; this file also covers ticket 15's six more
 * Widget kinds — each one's own reason to exist beyond a plain Value
 * Readout, exercised through the same shared surface rather than a
 * kind-specific reimplementation of binding, formatting or staleness.
 *
 * Placement and resize on the grid itself are not exercised here. Spec.md's
 * testing policy carves dockview drag out of the test net for exactly this
 * reason — genuinely visual, and cheaper to judge by hand than to simulate —
 * and that reasoning applies just as well to react-grid-layout's own drag and
 * resize, even though the policy was written before this Pane existed to
 * name it explicitly. What is this repo's own code — binding, formatting,
 * threshold evaluation, the stale state, and the Dashboard collection
 * operations — is pinned here and, for the collection operations, unit-tested
 * directly in `widgets/__tests__/dashboardStore.test.ts`.
 */

const STORAGE_KEY = 'dshub_settings';

/** SPINDLE_RPM lands at address 0 — first declared, per the Map parser's own ordering. */
const REGISTERS_MAP = `
uint32_t  SPINDLE_RPM;
float     COOLANT_TEMP;
`;
const SPINDLE_RPM_ADDRESS = 0;

const PROFILE: MapProfile = {
  id: 'dashboard-test-board',
  name: 'Dashboard test board',
  isDefault: false,
  registersMap: REGISTERS_MAP,
  parametersMap: '',
  createdAt: 0,
};

/** Seeds the settings `SettingsProvider` reads on mount, matching `CommandPane.test.tsx`'s approach. */
function seedActiveProfile(dashboardsByProfile?: Record<string, ProfileDashboards>): void {
  const settings = {
    ...DEFAULT_SETTINGS,
    mapProfiles: [PROFILE],
    activeMapProfileId: PROFILE.id,
    ...(dashboardsByProfile ? { dashboardsByProfile } : {}),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Binds a Widget to SPINDLE_RPM, on the shared surface every kind shares. */
function boundTo(overrides: Partial<BoundWidgetConfig> = {}): BoundWidgetConfig {
  return {
    ...defaultBoundWidgetConfig('Widget'),
    binding: { space: 'register', address: SPINDLE_RPM_ADDRESS },
    ...overrides,
  };
}

type FakePort = ReturnType<typeof createFakeBackendPort>;
type UserEvent = ReturnType<typeof userEvent.setup>;

interface Harness {
  readonly fake: FakePort;
  readonly title: ReturnType<typeof vi.fn>;
}

function renderPane(paneId = 'dashboard#1'): Harness {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  const title = vi.fn();

  render(
    <BackendPortProvider port={fake as BackendPort}>
      <SettingsProvider>
        <DSHubProvider>
          <DashboardPane paneId={paneId} setTitle={title} />
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );

  return { fake, title };
}

/** Lets the provider's asynchronous listener registration finish. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

async function connect(fake: FakePort): Promise<void> {
  await act(async () => {
    await fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
  });
}

/** Enters edit mode and adds one `valueRead` Widget from the add-Widget menu. */
async function addWidget(user: UserEvent): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  await user.click(screen.getByRole('button', { name: /add widget/i }));
  await user.click(await screen.findByRole('menuitem', { name: 'Value Readout' }));
}

/** Opens the shared config dialog for the (lone) Widget under test, whatever its current label reads. */
async function openConfigDialog(user: UserEvent): Promise<void> {
  await user.click(screen.getByRole('button', { name: /^Configure/ }));
  await screen.findByRole('dialog', { name: 'Configure Widget' });
}

async function bindToEntry(user: UserEvent, name: string): Promise<void> {
  const dialog = screen.getByRole('dialog', { name: 'Configure Widget' });
  await user.click(within(dialog).getByText(name));
}

beforeEach(async () => {
  localStorage.removeItem(STORAGE_KEY);
  seedActiveProfile();
  await mapManager.initialize(PROFILE);
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
  retainPaneState([]);
});

describe('a fresh Dashboard Pane', () => {
  it('seeds a first Dashboard for the Profile and reports it has no Widgets yet', async () => {
    renderPane();
    await settle();

    expect(await screen.findByRole('tab', { name: 'Dashboard 1' })).toBeInTheDocument();
    expect(screen.getByText(/no widgets yet/i)).toBeInTheDocument();
  });
});

describe('adding, configuring and removing a Widget', () => {
  it('adds a Widget in edit mode, unconfigured until an address is bound', async () => {
    const user = userEvent.setup();
    renderPane();
    await settle();

    await addWidget(user);

    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
  });

  it('configures binding, format and thresholds through the one shared surface, and reads the result live', async () => {
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await connect(harness.fake);
    await act(async () => {
      await harness.fake.device.writeRegister(SPINDLE_RPM_ADDRESS, 1500);
    });

    await addWidget(user);
    await openConfigDialog(user);
    await bindToEntry(user, 'SPINDLE_RPM');
    await user.click(within(screen.getByRole('dialog', { name: 'Configure Widget' })).getByRole('button', { name: 'Save' }));

    // Format: decimal (the default) reads the plain integer, and the label
    // auto-adopted the bound entry's name on this first binding.
    expect(screen.getByText('1500')).toBeInTheDocument();
    expect(screen.getByText('SPINDLE_RPM')).toBeInTheDocument();

    // Reopen the same Widget to change its format and add a threshold — both
    // through the same shared surface, not a kind-specific one.
    await openConfigDialog(user);
    const dialog = screen.getByRole('dialog', { name: 'Configure Widget' });

    const formatCombo = within(dialog).getByRole('combobox', { name: 'Display format' });
    formatCombo.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{Enter}');

    await user.click(within(dialog).getByRole('button', { name: /add rule/i }));
    const valueField = within(dialog).getByRole('textbox', { name: 'Threshold value' });
    await user.clear(valueField);
    await user.type(valueField, '1000{Enter}');
    const roleCombo = within(dialog).getByRole('combobox', { name: 'Status when this rule matches' });
    roleCombo.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{Enter}');

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    // Format switched to hexadecimal, and the default '>' comparator against
    // 1000 catches 1500 — the "error" role chosen for the rule colours it,
    // supplemented (since colour itself is not a test-level concern here) by
    // the `title` `ValueReadWidget.tsx` sets alongside it.
    const value = screen.getByText('0x000005DC');
    expect(value).toHaveAttribute('title', 'Status: error');
  });

  it('shows a plain stale state, not a frozen value, once the Device stops answering', async () => {
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await connect(harness.fake);
    await act(async () => {
      await harness.fake.device.writeRegister(SPINDLE_RPM_ADDRESS, 1500);
    });

    await addWidget(user);
    await openConfigDialog(user);
    await bindToEntry(user, 'SPINDLE_RPM');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('1500')).toBeInTheDocument();

    await act(async () => {
      await harness.fake.device.disconnect();
    });

    expect(screen.getByRole('status')).toHaveTextContent(/stale.*stopped answering/i);
    expect(screen.queryByText('1500')).not.toBeInTheDocument();
  });

  it('removes a Widget, returning the Dashboard to its empty state', async () => {
    const user = userEvent.setup();
    renderPane();
    await settle();
    await addWidget(user);

    await user.click(screen.getByRole('button', { name: 'Remove Value' }));

    expect(screen.queryByText(/not configured/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no widgets yet|add a widget above/i)).toBeInTheDocument();
  });
});

describe('several Dashboards per Profile, switchable within the Pane', () => {
  it('adds a second Dashboard, switches between them, and keeps each one’s Widgets independent', async () => {
    const user = userEvent.setup();
    renderPane();
    await settle();
    await addWidget(user); // one Widget on "Dashboard 1"

    await user.click(screen.getByRole('button', { name: 'New Dashboard' }));
    expect(await screen.findByRole('tab', { name: 'Dashboard 2' })).toBeInTheDocument();
    // The new Dashboard is the one now showing, and it starts empty.
    expect(screen.queryByText(/not configured/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Dashboard 1' }));
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
  });

  it('renames the active Dashboard', async () => {
    const user = userEvent.setup();
    renderPane();
    await settle();

    await user.click(screen.getByRole('button', { name: 'Rename Dashboard 1' }));
    const field = screen.getByRole('textbox', { name: 'Dashboard name' });
    await user.clear(field);
    await user.type(field, 'Motion{Enter}');

    expect(screen.getByRole('tab', { name: 'Motion' })).toBeInTheDocument();
  });

  it('deletes the active Dashboard on a second, confirming click, falling back to another', async () => {
    const user = userEvent.setup();
    renderPane();
    await settle();
    await user.click(screen.getByRole('button', { name: 'New Dashboard' }));
    expect(await screen.findByRole('tab', { name: 'Dashboard 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Dashboard 2' }));
    expect(screen.getByRole('button', { name: 'Confirm deleting Dashboard 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Dashboard 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm deleting Dashboard 2' }));

    expect(screen.queryByRole('tab', { name: 'Dashboard 2' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Dashboard 1' })).toBeInTheDocument();
  });
});

// ── Ticket 15: the six Widget kinds beyond Value Readout ─────────────────────

/** A Widget bound to SPINDLE_RPM, on the shared surface every kind shares — the kind-specific fields are the caller's. */
function withBinding<C extends BoundWidgetConfig>(config: C): C {
  return { ...config, binding: { space: 'register', address: SPINDLE_RPM_ADDRESS } };
}

function storedWidget(kind: WidgetKind, config: StoredWidget['config'], x: number, y: number): StoredWidget {
  return { id: createWidgetId(), kind, layout: { x, y, w: 3, h: 2 }, config };
}

function seedDashboard(widgets: readonly StoredWidget[]): void {
  const dashboard: StoredDashboard = { id: createDashboardId(), name: 'Dashboard 1', widgets };
  seedActiveProfile({ [PROFILE.id]: { dashboards: [dashboard] } });
}

async function writeSpindleRpm(fake: FakePort, value: number): Promise<void> {
  await act(async () => {
    await fake.device.writeRegister(SPINDLE_RPM_ADDRESS, value);
  });
}

describe('the six Value and Indicator Widget kinds beyond Value Readout', () => {
  it('each renders and updates from its own bound address, through the shared surface', async () => {
    seedDashboard([
      storedWidget('gauge', withBinding(defaultGaugeWidgetConfig('Gauge')), 0, 0),
      storedWidget('progressBar', withBinding(defaultProgressBarWidgetConfig('Progress Bar')), 3, 0),
      storedWidget('encoderDisplay', withBinding(defaultEncoderDisplayWidgetConfig('Position')), 6, 0),
      storedWidget('ledIndicator', withBinding(defaultLedIndicatorWidgetConfig('LED')), 0, 2),
      storedWidget(
        'stateLED',
        withBinding({
          ...defaultBoundWidgetConfig('State'),
          thresholds: [
            { id: 'idle', comparator: '==', value: 0, role: 'idle', label: 'Idle' },
            { id: 'run', comparator: '==', value: 1, role: 'ok', label: 'Running' },
          ],
        }),
        3,
        2
      ),
      storedWidget('statusMatrix', withBinding(defaultBoundWidgetConfig('Flags')), 6, 2),
    ]);
    const fake = createFakeBackendPort({ deliver: fn => fn() });
    render(
      <BackendPortProvider port={fake as BackendPort}>
        <SettingsProvider>
          <DSHubProvider>
            <DashboardPane paneId="dashboard#1" setTitle={vi.fn()} />
          </DSHubProvider>
        </SettingsProvider>
      </BackendPortProvider>
    );
    await settle();
    await act(async () => {
      await fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });
    await writeSpindleRpm(fake, 1);

    expect(within(screen.getByRole('group', { name: 'Gauge' })).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Progress Bar' })).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Position' })).getByText('1.00')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'LED' })).getByTitle('On — Status: ok')
    ).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'State' })).getByText('Running')).toBeInTheDocument();

    const flags = screen.getByRole('group', { name: 'Flags' });
    expect(within(flags).getByTitle('Bit 0: set — Status: warn')).toBeInTheDocument();
    expect(within(flags).getByTitle('Bit 1: clear')).toBeInTheDocument();
  });

  it('LED Indicator defaults on to ok and off to idle, overridable by an explicit threshold rule', async () => {
    seedDashboard([
      storedWidget('ledIndicator', withBinding(defaultLedIndicatorWidgetConfig('Plain LED')), 0, 0),
      storedWidget(
        'ledIndicator',
        withBinding({
          ...defaultLedIndicatorWidgetConfig('Alarm LED'),
          thresholds: [{ id: 'on-is-bad', comparator: '==', value: 1, role: 'error' }],
        }),
        3,
        0
      ),
    ]);
    const fake = createFakeBackendPort({ deliver: fn => fn() });
    render(
      <BackendPortProvider port={fake as BackendPort}>
        <SettingsProvider>
          <DSHubProvider>
            <DashboardPane paneId="dashboard#1" setTitle={vi.fn()} />
          </DSHubProvider>
        </SettingsProvider>
      </BackendPortProvider>
    );
    await settle();
    await act(async () => {
      await fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });
    await writeSpindleRpm(fake, 1);

    expect(
      within(screen.getByRole('group', { name: 'Plain LED' })).getByTitle('On — Status: ok')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Alarm LED' })).getByTitle('On — Status: error')
    ).toBeInTheDocument();
  });
});

describe('kind-specific fields configure through the same shared dialog', () => {
  it('persists a Gauge’s range across a save and reopen', async () => {
    const user = userEvent.setup();
    renderPane();
    await settle();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: /add widget/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Gauge' }));

    await user.click(screen.getByRole('button', { name: /^Configure/ }));
    let dialog = screen.getByRole('dialog', { name: 'Configure Widget' });
    expect(within(dialog).getByRole('textbox', { name: 'Maximum' })).toHaveValue('100');

    const maxField = within(dialog).getByRole('textbox', { name: 'Maximum' });
    await user.clear(maxField);
    await user.type(maxField, '500{Enter}');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await user.click(screen.getByRole('button', { name: /^Configure/ }));
    dialog = screen.getByRole('dialog', { name: 'Configure Widget' });
    expect(within(dialog).getByRole('textbox', { name: 'Maximum' })).toHaveValue('500');
  });

  it('hides the Thresholds section for Status Matrix, which does not read it', async () => {
    const user = userEvent.setup();
    renderPane();
    await settle();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: /add widget/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Status Matrix' }));

    await user.click(screen.getByRole('button', { name: /^Configure/ }));
    const dialog = screen.getByRole('dialog', { name: 'Configure Widget' });

    expect(within(dialog).queryByText('Thresholds')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /add rule/i })).not.toBeInTheDocument();
  });

  it('shows custom on/off labels for LED Indicator', async () => {
    const user = userEvent.setup();
    seedDashboard([storedWidget('ledIndicator', withBinding(defaultLedIndicatorWidgetConfig('Lamp')), 0, 0)]);
    const fake = createFakeBackendPort({ deliver: fn => fn() });
    render(
      <BackendPortProvider port={fake as BackendPort}>
        <SettingsProvider>
          <DSHubProvider>
            <DashboardPane paneId="dashboard#1" setTitle={vi.fn()} />
          </DSHubProvider>
        </SettingsProvider>
      </BackendPortProvider>
    );
    await settle();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Configure Lamp' }));

    const dialog = screen.getByRole('dialog', { name: 'Configure Widget' });
    const onLabelField = within(dialog).getByRole('textbox', { name: 'On label (optional)' });
    await user.type(onLabelField, 'Enabled');
    const offLabelField = within(dialog).getByRole('textbox', { name: 'Off label (optional)' });
    await user.type(offLabelField, 'Disabled');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await act(async () => {
      await fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });
    await writeSpindleRpm(fake, 0);

    expect(within(screen.getByRole('group', { name: 'Lamp' })).getByText('Disabled')).toBeInTheDocument();
  });
});

describe('the add-Widget menu', () => {
  it('offers every registered Widget kind and adds whichever is chosen', async () => {
    const user = userEvent.setup();
    renderPane();
    await settle();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: /add widget/i }));

    for (const title of [
      'Value Readout',
      'Gauge',
      'Progress Bar',
      'Encoder Display',
      'LED Indicator',
      'State LED',
      'Status Matrix',
    ]) {
      expect(screen.getByRole('menuitem', { name: title })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('menuitem', { name: 'Gauge' }));
    expect(screen.getByRole('button', { name: 'Configure Gauge' })).toBeInTheDocument();
  });
});
