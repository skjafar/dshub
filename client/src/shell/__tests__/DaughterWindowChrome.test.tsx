// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { DSHubProvider } from '../../contexts/DSHubContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';
import { InterfaceType } from '../../types/shared';
import { TooltipProvider } from '../../ui';
import { DaughterWindowChrome } from '../DaughterWindowChrome';
import type { PaneMenuEntry } from '../daughterWindows';

/**
 * issue 03's checklist: "Its top bar shows link and Control state read-only
 * plus an add-Pane control, and nothing else." — the "nothing else" is the
 * point of this suite: no Connect, Control-taking, Workspace, Profile,
 * theme or Settings affordance belongs here, unlike the Main Window's chrome.
 */

const ENTRIES: readonly PaneMenuEntry[] = [
  { kind: 'overview', title: 'Overview', disabledLocation: null },
  { kind: 'register', title: 'Registers', disabledLocation: null },
  { kind: 'inspector', title: 'Inspector', disabledLocation: 'Main Window' },
];

afterEach(() => {
  cleanup();
});

function renderChrome(onOpenPane = vi.fn()): { fake: ReturnType<typeof createFakeBackendPort>; onOpenPane: typeof onOpenPane } {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  render(
    <BackendPortProvider port={fake as BackendPort}>
      <SettingsProvider>
        <DSHubProvider>
          <TooltipProvider>
            <DaughterWindowChrome entries={ENTRIES} onOpenPane={onOpenPane} />
          </TooltipProvider>
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );
  return { fake, onOpenPane };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

describe('DaughterWindowChrome', () => {
  it('shows link state, read-only, reflecting the shared Device connection', async () => {
    const { fake } = renderChrome();
    await settle();

    expect(screen.getByRole('status', { name: 'Device link' })).toHaveTextContent(/no device/i);

    await act(async () => {
      await fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });

    expect(screen.getByRole('status', { name: 'Device link' })).toHaveTextContent(/online/i);
  });

  it('shows Control state, read-only — no Take Control button anywhere', async () => {
    renderChrome();
    await settle();

    expect(screen.getByText(/no control/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /take control/i })).not.toBeInTheDocument();
  });

  it('offers exactly one control besides link/Control status: add a Pane', async () => {
    renderChrome();
    await settle();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Add a pane');

    // Nothing that belongs only to the Main Window.
    expect(screen.queryByRole('button', { name: /connect/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /workspaces/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /profiles/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
  });

  it('opens a Pane through the add-Pane menu, labelling one already open elsewhere', async () => {
    const user = userEvent.setup();
    const onOpenPane = vi.fn();
    renderChrome(onOpenPane);
    await settle();

    await user.click(screen.getByRole('button', { name: 'Add a pane' }));
    const inspectorItem = await screen.findByText(/Inspector.*already open in Main Window/);
    expect(inspectorItem.closest('[role="menuitem"]')).toHaveAttribute('data-disabled');

    await user.click(screen.getByText('Overview'));
    expect(onOpenPane).toHaveBeenCalledWith('overview');
  });
});
