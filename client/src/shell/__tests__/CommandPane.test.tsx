// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { DSHubProvider } from '../../contexts/DSHubContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';
import { InterfaceType } from '../../types/shared';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type { MapProfile } from '../../types/settings';
import { retainPaneState } from '../paneState';
import { CommandPane } from '../panes/CommandPane';

/**
 * Sending Commands to the Device, driven through the fake port.
 *
 * A Command reaching live equipment carries the same weight as a write —
 * ticket 11's own wording — so what is pinned here mirrors `AddressSpacePane`'s
 * write contract suite: the exact code and value that leave, a refusal reported
 * as a refusal rather than a success, and sending withheld with its reason
 * stated whenever Control is not held.
 *
 * Nothing here mocks a module or stubs the transport: the fake is the same
 * implementation browser development runs against, so what the interface is
 * built against and what it is verified against cannot drift apart.
 */

/** Mirrors `SettingsContext`'s own (private) storage key. */
const STORAGE_KEY = 'dshub_settings';

const PROFILE: MapProfile = {
  id: 'command-test-board',
  name: 'Command test board',
  isDefault: false,
  registersMap: '',
  parametersMap: '',
  sysCommands: [
    { code: 10, name: 'HOME_ALL_AXES', description: 'Home every axis' },
    { code: 20, name: 'ENABLE_SPINDLE', description: 'Enable the spindle motor' },
    { code: 200, name: 'RESET_FAULTS', description: 'Clear the fault latch' },
  ],
  createdAt: 0,
};

/**
 * Seeds the settings `SettingsProvider` reads on mount, since a Command
 * catalogue lives on the Profile in Settings state rather than in `mapManager`
 * — unlike a Map, there is no frozen singleton to initialize directly.
 */
function seedActiveProfile(profile: MapProfile | null): void {
  const settings = {
    ...DEFAULT_SETTINGS,
    mapProfiles: profile ? [profile] : [],
    activeMapProfileId: profile ? profile.id : DEFAULT_SETTINGS.activeMapProfileId,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

type FakePort = ReturnType<typeof createFakeBackendPort>;

interface SentCommand {
  readonly command: number;
  readonly address: number;
  readonly value: number;
}

/** Records what reaches `sendCommand`, forwarding to the same fake browser
 *  development runs against — see `writeRecorder.ts` for the write-side twin. */
function recordCommands(fake: FakePort): { port: BackendPort; sent: SentCommand[] } {
  const sent: SentCommand[] = [];
  const port: BackendPort = {
    ...fake,
    device: {
      ...fake.device,
      sendCommand: async (command: number, address: number, value: number) => {
        sent.push({ command, address, value });
        return fake.device.sendCommand(command, address, value);
      },
    },
  };
  return { port, sent };
}

interface Harness {
  readonly fake: FakePort;
  readonly sent: SentCommand[];
  readonly title: ReturnType<typeof vi.fn>;
}

function renderPane(paneId = 'sysCommand#1'): Harness {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  const { port, sent } = recordCommands(fake);
  const title = vi.fn();

  render(
    <BackendPortProvider port={port}>
      <SettingsProvider>
        <DSHubProvider>
          <CommandPane paneId={paneId} setTitle={title} />
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );

  return { fake, sent, title };
}

/** Lets the provider's asynchronous listener registration finish. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

/** Connects and claims Control, which sending requires. */
async function readyToSend(harness: Harness): Promise<void> {
  await act(async () => {
    await harness.fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
  });
  await act(async () => {
    await harness.fake.device.takeControl();
  });
}

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
  // Pane state is keyed by panel id and outlives the component on purpose, so a
  // test that left a selection behind would otherwise hand it to the next one.
  retainPaneState([]);
});

describe('Command Pane', () => {
  it('lists Commands by name and description from the active Profile', async () => {
    seedActiveProfile(PROFILE);
    renderPane();
    await settle();

    expect(screen.getByRole('row', { name: /HOME_ALL_AXES/ })).toHaveTextContent(
      'Home every axis'
    );
    expect(screen.getByRole('row', { name: /ENABLE_SPINDLE/ })).toHaveTextContent(
      'Enable the spindle motor'
    );
  });

  it('is searchable by name', async () => {
    seedActiveProfile(PROFILE);
    const user = userEvent.setup();
    renderPane();
    await settle();

    await user.type(screen.getByRole('textbox', { name: /filter commands/i }), 'spindle');

    expect(screen.getByText('ENABLE_SPINDLE')).toBeInTheDocument();
    expect(screen.queryByText('HOME_ALL_AXES')).not.toBeInTheDocument();
  });

  it('is searchable by code', async () => {
    seedActiveProfile(PROFILE);
    const user = userEvent.setup();
    renderPane();
    await settle();

    await user.type(screen.getByRole('textbox', { name: /filter commands/i }), '200');

    expect(screen.getByText('RESET_FAULTS')).toBeInTheDocument();
    expect(screen.queryByText('HOME_ALL_AXES')).not.toBeInTheDocument();
  });

  it('withholds sending, with the reason visible, before connecting', async () => {
    seedActiveProfile(PROFILE);
    const user = userEvent.setup();
    renderPane();
    await settle();

    await user.click(screen.getByText('HOME_ALL_AXES'));

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByText(/not connected/i)).toBeInTheDocument();
  });

  it('withholds sending, with the reason visible, once connected without Control', async () => {
    seedActiveProfile(PROFILE);
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await act(async () => {
      await harness.fake.device.connect('192.168.1.42', InterfaceType.TCP);
    });

    await user.click(screen.getByText('HOME_ALL_AXES'));

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByText(/holds control/i)).toBeInTheDocument();
  });

  it('sends exactly the code selected and the value typed', async () => {
    seedActiveProfile(PROFILE);
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToSend(harness);

    await user.click(screen.getByText('RESET_FAULTS'));
    const field = screen.getByRole('textbox', { name: 'Value for RESET_FAULTS' });
    await user.clear(field);
    await user.type(field, '7{Enter}');

    // Every Profile Command travels as SYS_COMMAND (type 0), with its own code
    // in the address field — command 0 here is the wire type, not RESET_FAULTS'.
    expect(harness.sent).toEqual([{ command: 0, address: 200, value: 7 }]);
  });

  it('settles the send once the Device answers, rather than on the command resolving', async () => {
    seedActiveProfile(PROFILE);
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToSend(harness);

    await user.click(screen.getByText('HOME_ALL_AXES'));
    const field = screen.getByRole('textbox', { name: 'Value for HOME_ALL_AXES' });
    await user.clear(field);
    await user.type(field, '5{Enter}');
    await settle();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('reports a Command the Device refused rather than reporting success', async () => {
    // The backend resolves `sendCommand` as soon as it is queued, so a Pane that
    // treated the resolved call as success would report every refusal — the
    // Device answering PERMISSION_ERROR — as a completed send.
    seedActiveProfile(PROFILE);
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToSend(harness);
    harness.fake.faults.refuseCommands(true);

    await user.click(screen.getByText('HOME_ALL_AXES'));
    const field = screen.getByRole('textbox', { name: 'Value for HOME_ALL_AXES' });
    await user.clear(field);
    await user.type(field, '5{Enter}');
    await settle();

    expect(screen.getByRole('alert')).toHaveTextContent(/refused/i);
  });

  it('clears a refusal once a different Command is selected', async () => {
    seedActiveProfile(PROFILE);
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToSend(harness);
    harness.fake.faults.refuseCommands(true);

    await user.click(screen.getByText('HOME_ALL_AXES'));
    const field = screen.getByRole('textbox', { name: 'Value for HOME_ALL_AXES' });
    await user.clear(field);
    await user.type(field, '5{Enter}');
    await settle();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByText('ENABLE_SPINDLE'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a clear empty state when the Profile declares no Commands', async () => {
    seedActiveProfile({ ...PROFILE, sysCommands: [] });
    renderPane();
    await settle();

    expect(screen.getByText(/declares no Commands/i)).toBeInTheDocument();
  });

  it('shows a clear empty state when no Profile is active', async () => {
    renderPane();
    await settle();

    expect(screen.getByText(/no Profile is active/i)).toBeInTheDocument();
  });
});
