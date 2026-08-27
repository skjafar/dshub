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
import type { MapProfile, SysCommand } from '../../types/settings';
import { retainPaneState } from '../paneState';
import { DashboardPane } from '../panes/DashboardPane';
import { createDashboardId, createWidgetId } from '../widgets/dashboardStore';
import type { ProfileDashboards, StoredDashboard, StoredWidget } from '../widgets/dashboardStore';
import {
  defaultButtonWidgetConfig,
  defaultDirectionalControlWidgetConfig,
  defaultDropdownWidgetConfig,
  defaultValueWriteWidgetConfig,
} from '../widgets/widgetConfig';
import type { WidgetConfig } from '../widgets/widgetConfig';
import type { WidgetKind } from '../widgets/widgetRegistry';

/**
 * The four Control-family Widgets — Button, Dropdown, Value Write and
 * Directional Control — driven through the fake port exactly as ticket 07's
 * write-path contracts and ticket 11's Command confirmations were: nothing
 * mocks the transport, so what is asserted here is what the interface really
 * sends. Each inherits its write path from the same `useWidgetWrite` hook
 * `AddressSpacePane`/`CommandPane` were built on, so a rejected or unanswered
 * send settles the same way here as it does there.
 */

const STORAGE_KEY = 'dshub_settings';

/** Read/Write, so the write path is actually reachable — a plain register Map defaults to read-only. */
const REGISTERS_MAP = `
// Read/Write
uint32_t  SPEED;
`;
const SPEED_ADDRESS = 0;

const COMMANDS: readonly SysCommand[] = [
  { code: 10, name: 'JOG_UP', description: 'Jog up' },
  { code: 11, name: 'JOG_DOWN', description: 'Jog down' },
];

const PROFILE: MapProfile = {
  id: 'control-widgets-board',
  name: 'Control widgets board',
  isDefault: false,
  registersMap: REGISTERS_MAP,
  parametersMap: '',
  sysCommands: [...COMMANDS],
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
  return { id: createWidgetId(), kind, layout: { x, y, w: 3, h: 2 }, config };
}

function seedDashboard(widgets: readonly StoredWidget[]): void {
  const dashboard: StoredDashboard = { id: createDashboardId(), name: 'Dashboard 1', widgets };
  seedActiveProfile({ [PROFILE.id]: { dashboards: [dashboard] } });
}

type FakePort = ReturnType<typeof createFakeBackendPort>;
type UserEvent = ReturnType<typeof userEvent.setup>;

interface RecordedWrite {
  readonly space: 'register' | 'parameter';
  readonly address: number;
  readonly value: number;
}
interface RecordedCommand {
  readonly command: number;
  readonly address: number;
  readonly value: number;
}

/**
 * Wraps the fake exactly as `writeRecorder.ts` and `CommandPane.test.tsx`'s
 * own `recordCommands` do — observing, not replacing, the same fake browser
 * development runs against — but combined, since a single Widget under test
 * here can reach for either a write or a Command.
 */
function recordAll(fake: FakePort): { readonly port: BackendPort; readonly writes: RecordedWrite[]; readonly commands: RecordedCommand[] } {
  const writes: RecordedWrite[] = [];
  const commands: RecordedCommand[] = [];
  const port: BackendPort = {
    ...fake,
    device: {
      ...fake.device,
      writeRegister: async (address, value) => {
        writes.push({ space: 'register', address, value });
        return fake.device.writeRegister(address, value);
      },
      writeParameter: async (address, value) => {
        writes.push({ space: 'parameter', address, value });
        return fake.device.writeParameter(address, value);
      },
      sendCommand: async (command, address, value) => {
        commands.push({ command, address, value });
        return fake.device.sendCommand(command, address, value);
      },
    },
  };
  return { port, writes, commands };
}

interface Harness {
  readonly fake: FakePort;
  readonly writes: RecordedWrite[];
  readonly commands: RecordedCommand[];
}

function renderDashboard(paneId = 'dashboard#1'): Harness {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  const { port, writes, commands } = recordAll(fake);

  render(
    <BackendPortProvider port={port}>
      <SettingsProvider>
        <DSHubProvider>
          <DashboardPane paneId={paneId} setTitle={vi.fn()} />
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );

  return { fake, writes, commands };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

async function connectAndTakeControl(fake: FakePort): Promise<void> {
  await act(async () => {
    await fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
  });
  await act(async () => {
    await fake.device.takeControl();
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

// ── Button ───────────────────────────────────────────────────────────────

describe('Button', () => {
  it('writes its configured value to its address target on click, once Control is held', async () => {
    const user = userEvent.setup();
    seedDashboard([
      storedWidget('button', {
        ...defaultButtonWidgetConfig('Home'),
        target: { kind: 'address', space: 'register', address: SPEED_ADDRESS },
        value: 42,
      }),
    ]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);

    await user.click(screen.getByRole('button', { name: /^send$/i }));

    expect(harness.writes).toEqual([{ space: 'register', address: SPEED_ADDRESS, value: 42 }]);
  });

  it('sends its configured value as a Command when bound to one', async () => {
    const user = userEvent.setup();
    seedDashboard([
      storedWidget('button', { ...defaultButtonWidgetConfig('Jog'), target: { kind: 'command', code: 10 }, value: 7 }),
    ]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);

    await user.click(screen.getByRole('button', { name: /^send$/i }));

    expect(harness.commands).toEqual([{ command: 0, address: 10, value: 7 }]);
  });

  it('arms a confirmation before sending when configured to require one', async () => {
    const user = userEvent.setup();
    seedDashboard([
      storedWidget('button', {
        ...defaultButtonWidgetConfig('Reset'),
        target: { kind: 'command', code: 10 },
        value: 0,
        confirmationRequired: true,
      }),
    ]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);

    await user.click(screen.getByRole('button', { name: /^send$/i }));
    expect(harness.commands).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /confirm/i }));
    expect(harness.commands).toEqual([{ command: 0, address: 10, value: 0 }]);
  });

  it('is unavailable, with the reason visible, when Control is not held', async () => {
    seedDashboard([
      storedWidget('button', {
        ...defaultButtonWidgetConfig('Home'),
        target: { kind: 'address', space: 'register', address: SPEED_ADDRESS },
        value: 1,
      }),
    ]);
    const harness = renderDashboard();
    await settle();
    await act(async () => {
      await harness.fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });
    // Control is never claimed.

    expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled();
    expect(screen.getByText(/holds control/i)).toBeInTheDocument();
    expect(harness.writes).toHaveLength(0);
  });

  it('reports a rejected write plainly rather than appearing to succeed', async () => {
    const user = userEvent.setup();
    seedDashboard([
      storedWidget('button', {
        ...defaultButtonWidgetConfig('Home'),
        target: { kind: 'address', space: 'register', address: SPEED_ADDRESS },
        value: 1,
      }),
    ]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);
    harness.fake.faults.refuseWrites(true);

    await user.click(screen.getByRole('button', { name: /^send$/i }));
    await settle();

    expect(screen.getByRole('alert')).toHaveTextContent(/refused/i);
  });

  it('is fully operable by keyboard', async () => {
    const user = userEvent.setup();
    seedDashboard([
      storedWidget('button', {
        ...defaultButtonWidgetConfig('Home'),
        target: { kind: 'address', space: 'register', address: SPEED_ADDRESS },
        value: 5,
      }),
    ]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);

    screen.getByRole('button', { name: /^send$/i }).focus();
    await user.keyboard('{Enter}');

    expect(harness.writes).toEqual([{ space: 'register', address: SPEED_ADDRESS, value: 5 }]);
  });
});

// ── Dropdown ─────────────────────────────────────────────────────────────

describe('Dropdown', () => {
  const CONFIG = {
    ...defaultDropdownWidgetConfig('Mode'),
    binding: { space: 'register' as const, address: SPEED_ADDRESS },
    options: [
      { value: 0, label: 'Stop' },
      { value: 1, label: 'Run' },
    ],
  };

  it('mirrors the Device’s own reading as the current selection', async () => {
    seedDashboard([storedWidget('dropdown', CONFIG)]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);
    await act(async () => {
      await harness.fake.device.writeRegister(SPEED_ADDRESS, 1);
    });

    expect(screen.getByRole('combobox', { name: 'Mode' })).toHaveTextContent('Run');
  });

  it('writes the picked option’s value to the bound address', async () => {
    const user = userEvent.setup();
    seedDashboard([storedWidget('dropdown', CONFIG)]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);
    await act(async () => {
      await harness.fake.device.writeRegister(SPEED_ADDRESS, 0);
    });

    screen.getByRole('combobox', { name: 'Mode' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(harness.writes).toEqual([{ space: 'register', address: SPEED_ADDRESS, value: 1 }]);
  });

  it('is unavailable, with the reason visible, when Control is not held', async () => {
    seedDashboard([storedWidget('dropdown', CONFIG)]);
    const harness = renderDashboard();
    await settle();
    await act(async () => {
      await harness.fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });

    expect(screen.getByRole('combobox', { name: 'Mode' })).toBeDisabled();
    expect(screen.getByText(/holds control/i)).toBeInTheDocument();
  });
});

// ── Value Write ──────────────────────────────────────────────────────────

describe('Value Write', () => {
  const CONFIG = {
    ...defaultValueWriteWidgetConfig('Feed'),
    binding: { space: 'register' as const, address: SPEED_ADDRESS },
  };

  const fieldFor = (label: string): HTMLElement => screen.getByRole('textbox', { name: label });
  const sendButton = (): HTMLElement => screen.getByRole('button', { name: /^send$/i });

  it('produces the same write from Enter and from the Send button', async () => {
    const results: number[] = [];

    for (const path of ['keyboard', 'pointer'] as const) {
      const user = userEvent.setup();
      seedDashboard([storedWidget('valueWrite', CONFIG)]);
      const harness = renderDashboard();
      await settle();
      await connectAndTakeControl(harness.fake);

      const field = fieldFor('Feed');
      await user.clear(field);
      await user.type(field, '1234');
      if (path === 'keyboard') {
        await user.type(field, '{Enter}');
      } else {
        await user.click(sendButton());
      }

      expect(harness.writes).toEqual([{ space: 'register', address: SPEED_ADDRESS, value: 1234 }]);
      results.push(harness.writes[0].value);
      cleanup();
      retainPaneState([]);
    }

    expect(results[0]).toBe(results[1]);
  });

  it('is not overwritten by a reading that arrives mid-edit', async () => {
    const user = userEvent.setup();
    seedDashboard([storedWidget('valueWrite', CONFIG)]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);

    const field = fieldFor('Feed');
    await user.clear(field);
    await user.type(field, '777');

    await act(async () => {
      await harness.fake.device.writeRegister(SPEED_ADDRESS, 55);
    });

    expect(field).toHaveValue('777');

    await user.click(sendButton());
    expect(harness.writes).toEqual([{ address: SPEED_ADDRESS, value: 777, space: 'register' }]);
  });

  it('follows the Device again once the write has gone', async () => {
    const user = userEvent.setup();
    seedDashboard([storedWidget('valueWrite', CONFIG)]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);

    const field = fieldFor('Feed');
    await user.clear(field);
    await user.type(field, '4242');
    await user.click(sendButton());
    await settle();

    expect(fieldFor('Feed')).toHaveValue('4242');

    await act(async () => {
      await harness.fake.device.writeRegister(SPEED_ADDRESS, 99);
    });

    expect(fieldFor('Feed')).toHaveValue('99');
  });

  it('reports a write the Device refuses, at the field, rather than reporting success', async () => {
    const user = userEvent.setup();
    seedDashboard([storedWidget('valueWrite', CONFIG)]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);
    harness.fake.faults.refuseWrites(true);

    const field = fieldFor('Feed');
    await user.clear(field);
    await user.type(field, '1234{Enter}');
    await settle();

    expect(screen.getByRole('alert')).toHaveTextContent(/refused the write/i);
  });

  it('is unavailable, with the reason visible, when not connected', async () => {
    seedDashboard([storedWidget('valueWrite', CONFIG)]);
    renderDashboard();
    await settle();

    expect(fieldFor('Feed')).toBeDisabled();
    expect(screen.getByText(/not connected/i)).toBeInTheDocument();
  });
});

// ── Directional Control ─────────────────────────────────────────────────

describe('Directional Control', () => {
  const CONFIG = {
    ...defaultDirectionalControlWidgetConfig('Jog'),
    directions: [
      { direction: 'up' as const, command: 10 },
      { direction: 'down' as const, command: 11 },
    ],
  };

  it('sends its bound Command on press, and again while held', async () => {
    seedDashboard([storedWidget('directionalControl', CONFIG)]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);

    // Fake timers only from here — the connect/takeControl round trip above is
    // the same real-timer flow every other test in this file uses, and there is
    // no reason for it to run any differently just because this test also
    // exercises the repeat interval.
    vi.useFakeTimers();
    try {
      const up = screen.getByRole('button', { name: /up/i });
      fireEvent.pointerDown(up);
      expect(harness.commands).toEqual([{ command: 0, address: 10, value: 0 }]);

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(harness.commands).toHaveLength(2);

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(harness.commands).toHaveLength(3);

      fireEvent.pointerUp(up);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      // Stopped: no further sends past release, however long the pointer stays up.
      expect(harness.commands).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops on focus loss, not only on release', async () => {
    seedDashboard([storedWidget('directionalControl', CONFIG)]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);

    vi.useFakeTimers();
    try {
      const up = screen.getByRole('button', { name: /up/i });
      fireEvent.pointerDown(up);
      expect(harness.commands).toHaveLength(1);

      fireEvent.blur(up);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(harness.commands).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops on link loss, not only on release or focus loss', async () => {
    seedDashboard([storedWidget('directionalControl', CONFIG)]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);

    vi.useFakeTimers();
    try {
      const up = screen.getByRole('button', { name: /up/i });
      fireEvent.pointerDown(up);
      expect(harness.commands).toHaveLength(1);

      await act(async () => {
        await harness.fake.device.disconnect();
      });

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      // The link dropping is what has to stop the repeat here — neither
      // release nor blur ever fired.
      expect(harness.commands).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drives the held repeat from the keyboard, ignoring the browser’s own key-repeat, and stops on keyup', async () => {
    seedDashboard([storedWidget('directionalControl', CONFIG)]);
    const harness = renderDashboard();
    await settle();
    await connectAndTakeControl(harness.fake);

    vi.useFakeTimers();
    try {
      const up = screen.getByRole('button', { name: /up/i });
      up.focus();
      fireEvent.keyDown(up, { key: 'Enter' });
      expect(harness.commands).toEqual([{ command: 0, address: 10, value: 0 }]);

      // A held key fires repeated keydown events with `repeat: true`; that must
      // not restart or duplicate the hold — only the interval may.
      fireEvent.keyDown(up, { key: 'Enter', repeat: true });
      expect(harness.commands).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(harness.commands).toHaveLength(2);

      fireEvent.keyUp(up, { key: 'Enter' });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(harness.commands).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is unavailable, with the reason visible, when Control is not held', async () => {
    seedDashboard([storedWidget('directionalControl', CONFIG)]);
    const harness = renderDashboard();
    await settle();
    await act(async () => {
      await harness.fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });

    expect(screen.getByRole('button', { name: /up/i })).toBeDisabled();
    expect(screen.getByText(/holds control/i)).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: /up/i }));
    expect(harness.commands).toHaveLength(0);
  });

  it('renders only the four cardinal directions in the default 4-way layout', async () => {
    seedDashboard([storedWidget('directionalControl', CONFIG)]);
    renderDashboard();
    await settle();

    expect(screen.queryByRole('button', { name: /upleft/i })).not.toBeInTheDocument();
  });
});

// ── Configured through the shared dialog ────────────────────────────────

describe('the control family configures through the same shared dialog', () => {
  it('offers an Address/Command Target section for Button', async () => {
    const user = userEvent.setup();
    seedDashboard([]);
    renderDashboard();
    await settle();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: /add widget/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Button' }));

    await user.click(screen.getByRole('button', { name: /^Configure/ }));
    const dialog = screen.getByRole('dialog', { name: 'Configure Button' });

    expect(within(dialog).getByText('Target')).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Target kind' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Value' })).toBeInTheDocument();
  });

  it('offers a Directions section, sized to the Profile’s own Command catalogue, for Directional Control', async () => {
    const user = userEvent.setup();
    seedDashboard([]);
    renderDashboard();
    await settle();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: /add widget/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Directional Control' }));

    await user.click(screen.getByRole('button', { name: /^Configure/ }));
    const dialog = screen.getByRole('dialog', { name: 'Configure Directional Control' });

    expect(within(dialog).getByText('Directions')).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Up Command' })).toBeInTheDocument();
  });
});
