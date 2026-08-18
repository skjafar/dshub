// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
import { createDashboardId, createWidgetId } from '../widgets/dashboardStore';
import type { ProfileDashboards, StoredDashboard, StoredWidget } from '../widgets/dashboardStore';
import {
  defaultAlarmListWidgetConfig,
  defaultBoundWidgetConfig,
  defaultContainerWidgetConfig,
  defaultDataTableWidgetConfig,
  defaultDeviceInfoWidgetConfig,
  defaultMiniPlotWidgetConfig,
} from '../widgets/widgetConfig';
import type { WidgetConfig } from '../widgets/widgetConfig';
import type { WidgetKind } from '../widgets/widgetRegistry';

/**
 * The five composite Widget kinds — Data Table, Alarm List, Device Info,
 * Container and Mini-Plot — driven through `DashboardPane` and the fake
 * port, the same harness `DashboardPane.test.tsx` and `ControlWidgets.test.tsx`
 * use. A separate file rather than another section of either: Data Table's
 * write cell needs the same write-recording harness as the Control family,
 * while Alarm List, Device Info and Container are read/structural, closer in
 * kind to ticket 15's own coverage — the combination fits neither existing
 * file cleanly.
 *
 * Mini-Plot's own chart is not exercised here. `PlotPane.test.tsx` mocks
 * `uplot` at the module boundary because jsdom has no canvas 2D context for
 * it to draw into; this file does not, so only Mini-Plot's unbound state
 * (the one path that never constructs a chart) is pinned. The bound,
 * streaming state was verified by hand in a real browser, per this
 * project's testing policy for the same reason dockview drag and
 * react-grid-layout's own drag/resize are.
 */

const STORAGE_KEY = 'dshub_settings';

/** TEMP is read-only (address 0, before the boundary); SPEED is writable (address 1, after it). */
const REGISTERS_MAP = `
uint32_t  TEMP;
// Read/Write
uint32_t  SPEED;
`;
const TEMP_ADDRESS = 0;
const SPEED_ADDRESS = 1;

const PROFILE: MapProfile = {
  id: 'composite-widgets-board',
  name: 'Composite widgets board',
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

function storedWidget(kind: WidgetKind, config: WidgetConfig, x = 0, y = 0): StoredWidget {
  return { id: createWidgetId(), kind, layout: { x, y, w: 4, h: 3 }, config };
}

function seedDashboard(widgets: readonly StoredWidget[]): void {
  const dashboard: StoredDashboard = { id: createDashboardId(), name: 'Dashboard 1', widgets };
  seedActiveProfile({ [PROFILE.id]: { dashboards: [dashboard] } });
}

type FakePort = ReturnType<typeof createFakeBackendPort>;

interface RecordedWrite {
  readonly space: 'register' | 'parameter';
  readonly address: number;
  readonly value: number;
}

/** Mirrors `ControlWidgets.test.tsx`'s own `recordAll` — observing, not replacing, the fake. */
function recordWrites(fake: FakePort): { readonly port: BackendPort; readonly writes: RecordedWrite[] } {
  const writes: RecordedWrite[] = [];
  const port: BackendPort = {
    ...fake,
    device: {
      ...fake.device,
      writeRegister: async (address, value) => {
        writes.push({ space: 'register', address, value });
        return fake.device.writeRegister(address, value);
      },
    },
  };
  return { port, writes };
}

interface Harness {
  readonly fake: FakePort;
  readonly writes: RecordedWrite[];
}

function renderDashboard(paneId = 'dashboard#1'): Harness {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  const { port, writes } = recordWrites(fake);

  render(
    <BackendPortProvider port={port}>
      <SettingsProvider>
        <DSHubProvider>
          <DashboardPane paneId={paneId} setTitle={vi.fn()} />
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );

  return { fake, writes };
}

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

async function connectAndTakeControl(fake: FakePort): Promise<void> {
  await connect(fake);
  await act(async () => {
    await fake.device.takeControl();
  });
}

async function writeRegister(fake: FakePort, address: number, value: number): Promise<void> {
  await act(async () => {
    await fake.device.writeRegister(address, value);
  });
}

beforeEach(async () => {
  await mapManager.initialize(PROFILE);
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
  retainPaneState([]);
});

// ── Data Table ───────────────────────────────────────────────────────────

describe('Data Table', () => {
  const CONFIG = {
    ...defaultDataTableWidgetConfig('Readings'),
    rows: [
      { ...defaultBoundWidgetConfig('Temp'), binding: { space: 'register' as const, address: TEMP_ADDRESS } },
      { ...defaultBoundWidgetConfig('Speed'), binding: { space: 'register' as const, address: SPEED_ADDRESS } },
    ],
  };

  it('renders each row from its own bound address', async () => {
    seedDashboard([storedWidget('dataTable', CONFIG)]);
    const harness = renderDashboard();
    await settle();
    await connect(harness.fake);
    await writeRegister(harness.fake, TEMP_ADDRESS, 42);
    await writeRegister(harness.fake, SPEED_ADDRESS, 7);

    expect(screen.getByText('Temp')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('offers a write cell only for the writable row', async () => {
    seedDashboard([storedWidget('dataTable', CONFIG)]);
    renderDashboard();
    await settle();

    expect(screen.getByRole('textbox', { name: 'Write Speed' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Write Temp' })).not.toBeInTheDocument();
  });

  it('produces the same write from Enter and from the Send button', async () => {
    const results: number[] = [];

    for (const path of ['keyboard', 'pointer'] as const) {
      const user = userEvent.setup();
      seedDashboard([storedWidget('dataTable', CONFIG)]);
      const harness = renderDashboard();
      await settle();
      await connectAndTakeControl(harness.fake);

      const field = screen.getByRole('textbox', { name: 'Write Speed' });
      await user.clear(field);
      await user.type(field, '1234');
      if (path === 'keyboard') {
        await user.type(field, '{Enter}');
      } else {
        await user.click(screen.getByRole('button', { name: 'Send Speed' }));
      }

      expect(harness.writes).toEqual([{ space: 'register', address: SPEED_ADDRESS, value: 1234 }]);
      results.push(harness.writes[0].value);
      cleanup();
      retainPaneState([]);
    }

    expect(results[0]).toBe(results[1]);
  });

  it('is not overwritten by a reading that arrives mid-edit — the legacy write-cell regression', async () => {
    const user = userEvent.setup();
    seedDashboard([storedWidget('dataTable', CONFIG)]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);

    const field = screen.getByRole('textbox', { name: 'Write Speed' });
    await user.clear(field);
    await user.type(field, '99');

    // A live update lands mid-edit — the regression the legacy `DataTableWriteCell`
    // test pinned wrote this stale value back instead of what was typed.
    await writeRegister(harness.fake, SPEED_ADDRESS, 55);
    expect(field).toHaveValue('99');

    await user.click(screen.getByRole('button', { name: 'Send Speed' }));
    expect(harness.writes).toEqual([{ space: 'register', address: SPEED_ADDRESS, value: 99 }]);
  });

  it('colours a row by its own threshold rule', async () => {
    seedDashboard([
      storedWidget('dataTable', {
        ...defaultDataTableWidgetConfig('Readings'),
        rows: [
          {
            ...defaultBoundWidgetConfig('Speed'),
            binding: { space: 'register', address: SPEED_ADDRESS },
            thresholds: [{ id: 'hot', comparator: '>', value: 1000, role: 'error' }],
          },
        ],
      }),
    ]);
    const harness = renderDashboard();
    await settle();
    await connect(harness.fake);
    await writeRegister(harness.fake, SPEED_ADDRESS, 1500);

    expect(screen.getByText('1500')).toHaveAttribute('title', 'Status: error');
  });
});

// ── Alarm List ───────────────────────────────────────────────────────────

describe('Alarm List', () => {
  function alarmConfig(showInactive: boolean) {
    return {
      ...defaultAlarmListWidgetConfig('Alarms'),
      showInactive,
      alarms: [
        {
          ...defaultBoundWidgetConfig('High Speed'),
          binding: { space: 'register' as const, address: SPEED_ADDRESS },
          thresholds: [{ id: 'hot', comparator: '>' as const, value: 1000, role: 'error' as const }],
        },
      ],
    };
  }

  it('reads OK while every alarm is clear, and reports the count once one is active', async () => {
    seedDashboard([storedWidget('alarmList', alarmConfig(true))]);
    const harness = renderDashboard();
    await settle();
    await connect(harness.fake);
    // SPEED's own default signal already sits well above the threshold below,
    // so "clear" has to be established with an explicit reading rather than
    // asserted against whatever the very first poll happens to return.
    await writeRegister(harness.fake, SPEED_ADDRESS, 10);

    expect(screen.getByText('OK')).toBeInTheDocument();

    await writeRegister(harness.fake, SPEED_ADDRESS, 1500);
    expect(screen.getByText('1 ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('High Speed')).toBeInTheDocument();
  });

  it('hides a clear alarm when showInactive is off, and shows it again once active', async () => {
    seedDashboard([storedWidget('alarmList', alarmConfig(false))]);
    const harness = renderDashboard();
    await settle();
    await connect(harness.fake);
    await writeRegister(harness.fake, SPEED_ADDRESS, 10);

    expect(screen.queryByText('High Speed')).not.toBeInTheDocument();

    await writeRegister(harness.fake, SPEED_ADDRESS, 1500);
    expect(screen.getByText('High Speed')).toBeInTheDocument();
  });
});

// ── Device Info ──────────────────────────────────────────────────────────

describe('Device Info', () => {
  it('reports nothing discovered before a connection exists', async () => {
    seedDashboard([storedWidget('deviceInfo', defaultDeviceInfoWidgetConfig('Device'))]);
    renderDashboard();
    await settle();

    expect(screen.getByText(/nothing discovered/i)).toBeInTheDocument();
    expect(screen.getByText('no device')).toBeInTheDocument();
  });

  it('reports the connected Device’s name, address and link state', async () => {
    seedDashboard([storedWidget('deviceInfo', defaultDeviceInfoWidgetConfig('Device'))]);
    const harness = renderDashboard();
    await settle();
    await connect(harness.fake);

    expect(screen.getByText('SESAME-CTRL-01')).toBeInTheDocument();
    expect(screen.getByText(/192\.168\.1\.42/)).toBeInTheDocument();
    expect(screen.getByText('online')).toBeInTheDocument();
  });
});

// ── Container ────────────────────────────────────────────────────────────

/** A Container pre-seeded with one bound child — building the child through a live add-then-configure UI flow is deliberately avoided here; see the note below. */
function containerWithChild(): StoredWidget {
  const child: StoredWidget = {
    id: createWidgetId(),
    kind: 'valueRead',
    layout: { x: 0, y: 0, w: 3, h: 2 },
    config: { ...defaultBoundWidgetConfig('Speed'), binding: { space: 'register', address: SPEED_ADDRESS } },
  };
  return storedWidget('container', { ...defaultContainerWidgetConfig('Group'), childWidgets: [child] });
}

describe('Container', () => {
  it('renders a nested child Widget from its own stored config, reading through the same shared surface', async () => {
    seedDashboard([containerWithChild()]);
    const harness = renderDashboard();
    await settle();
    await connect(harness.fake);
    await writeRegister(harness.fake, SPEED_ADDRESS, 321);

    const container = screen.getByRole('group', { name: 'Group' });
    const child = within(container).getByRole('group', { name: 'Speed' });
    expect(within(child).getByText('321')).toBeInTheDocument();
  });

  /**
   * Adding and configuring a child through Container's own live menu and the
   * shared dialog is not exercised here, on purpose. Both routes reuse the
   * exact same `Menu`/`MenuItem` and `WidgetConfigDialog` components
   * `DashboardPane.test.tsx` already drives successfully — the interaction
   * itself is proven there. What is specific to Container is that its own
   * grid sits nested inside `DashboardPane`'s own, and jsdom's `mousedown`/
   * `mouseup` simulation of a pointer sequence through two levels of
   * `react-draggable` triggers that library's own internal "onDragEnd called
   * before onDragStart" assertion — a jsdom-vs-real-browser event-ordering
   * artifact, not an application bug, and exactly the genuinely-visual
   * territory this project's testing policy already carves react-grid-
   * layout's own drag/resize out of for the same reason dockview drag is.
   * `fireEvent.click` (a bare `click`, none of the pointer/mouse pairs
   * `react-draggable` listens for) reaches this component's own click
   * handler without tripping it, which is what the removal below uses.
   */
  it('removes a child Widget from directly within itself', async () => {
    const user = userEvent.setup();
    seedDashboard([containerWithChild()]);
    renderDashboard();
    await settle();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const container = screen.getByRole('group', { name: 'Group' });
    const child = within(container).getByRole('group', { name: 'Speed' });

    fireEvent.click(within(child).getByRole('button', { name: 'Remove Speed' }));
    expect(within(container).queryByRole('group', { name: 'Speed' })).not.toBeInTheDocument();
  });

  it('does not offer nesting another Container inside itself', async () => {
    const user = userEvent.setup();
    seedDashboard([storedWidget('container', defaultContainerWidgetConfig('Group'))]);
    renderDashboard();
    await settle();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const container = screen.getByRole('group', { name: 'Group' });
    await user.click(within(container).getByRole('button', { name: /add widget/i }));

    expect(screen.queryByRole('menuitem', { name: 'Container' })).not.toBeInTheDocument();
  });
});

// ── Mini-Plot ────────────────────────────────────────────────────────────

describe('Mini-Plot', () => {
  it('shows a plain unbound notice until an address is picked, without constructing a chart', async () => {
    seedDashboard([storedWidget('miniPlot', defaultMiniPlotWidgetConfig('Trend'))]);
    renderDashboard();
    await settle();

    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
  });
});

// ── Configured through the shared dialog ────────────────────────────────

describe('the composite family configures through the same shared dialog', () => {
  it('offers a Rows section for Data Table', async () => {
    const user = userEvent.setup();
    seedDashboard([]);
    renderDashboard();
    await settle();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: /add widget/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Data Table' }));

    await user.click(screen.getByRole('button', { name: /^Configure/ }));
    const dialog = screen.getByRole('dialog', { name: 'Configure Widget' });

    expect(within(dialog).getByText('Rows')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /add row/i })).toBeInTheDocument();
  });

  it('offers a Layout section for Container', async () => {
    const user = userEvent.setup();
    seedDashboard([]);
    renderDashboard();
    await settle();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: /add widget/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Container' }));

    await user.click(screen.getByRole('button', { name: /^Configure/ }));
    const dialog = screen.getByRole('dialog', { name: 'Configure Widget' });

    expect(within(dialog).getByText('Layout')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Padding' })).toBeInTheDocument();
  });

  it('offers nothing beyond Label for Device Info', async () => {
    const user = userEvent.setup();
    seedDashboard([]);
    renderDashboard();
    await settle();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: /add widget/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Device Info' }));

    await user.click(screen.getByRole('button', { name: /^Configure/ }));
    const dialog = screen.getByRole('dialog', { name: 'Configure Widget' });

    expect(within(dialog).getByRole('textbox', { name: 'Label' })).toBeInTheDocument();
    expect(within(dialog).queryByText('Binding')).not.toBeInTheDocument();
  });
});
