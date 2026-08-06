// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { DSHubProvider } from '../../contexts/DSHubContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';
import { InterfaceType } from '../../types/shared';
import { TooltipProvider } from '../../ui';
import { AppChrome } from '../AppChrome';
import type { AppChromeProps } from '../AppChrome';

/**
 * The unread activity badge specifically. Everything else the chrome does —
 * link state, Control, the Workspaces dialog — is unrelated to this ticket and
 * stays unpinned here rather than duplicating what a future chrome suite would
 * own.
 */

/** Mirrors `SettingsContext`'s own (private) storage key. */
const STORAGE_KEY = 'dshub_settings';

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
});

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

function renderChrome(
  port: ReturnType<typeof createFakeBackendPort>,
  overrides: Partial<AppChromeProps> = {}
): void {
  render(
    <BackendPortProvider port={port as BackendPort}>
      <SettingsProvider>
        <DSHubProvider>
          <TooltipProvider>
            <AppChrome
              openKinds={[]}
              onOpenPane={vi.fn()}
              workspaces={[]}
              activeWorkspaceId=""
              defaultWorkspaceId=""
              onSwitchWorkspace={vi.fn()}
              onSaveWorkspaceAs={vi.fn()}
              onRenameWorkspace={vi.fn()}
              onDeleteWorkspace={vi.fn()}
              focusTargetDashboardId={null}
              onEnterFocusMode={vi.fn()}
              {...overrides}
            />
          </TooltipProvider>
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );
}

describe('AppChrome unread activity badge', () => {
  it('carries no badge while nothing is unread', async () => {
    const port = createFakeBackendPort({ deliver: fn => fn() });
    renderChrome(port);
    await settle();

    expect(screen.getByRole('button', { name: 'Panes' })).toBeInTheDocument();
  });

  it('makes a new alert noticeable on the Panes trigger, closed or not', async () => {
    // The whole point: an Engineer working in a different Pane, or with the
    // Activity Log Pane not open at all, still sees that something needs
    // attention without having to go and check.
    const port = createFakeBackendPort({ deliver: fn => fn() });
    renderChrome(port);
    await settle();

    await act(async () => {
      await port.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });
    await act(async () => {
      await port.device.disconnect();
    });

    const panesButton = screen.getByRole('button', { name: /1 unread activity log entry/i });
    expect(within(panesButton).getByText('1')).toBeInTheDocument();
  });
});

describe('AppChrome Focus Mode trigger', () => {
  it('is disabled when the Profile has no Dashboard to open', async () => {
    const port = createFakeBackendPort({ deliver: fn => fn() });
    renderChrome(port, { focusTargetDashboardId: null });
    await settle();

    expect(screen.getByRole('button', { name: 'Focus Mode' })).toBeDisabled();
  });

  it('enters Focus Mode on the resolved Dashboard, in one click', async () => {
    const user = userEvent.setup();
    const port = createFakeBackendPort({ deliver: fn => fn() });
    const onEnterFocusMode = vi.fn();
    renderChrome(port, { focusTargetDashboardId: 'dashboard-1', onEnterFocusMode });
    await settle();

    const button = screen.getByRole('button', { name: 'Focus Mode' });
    expect(button).toBeEnabled();
    await user.click(button);

    expect(onEnterFocusMode).toHaveBeenCalledWith('dashboard-1');
  });
});

describe('AppChrome settings reset notice', () => {
  it('opens automatically when the stored settings predate schema versioning (ticket 21)', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mapProfiles: [], activeMapProfileId: 'default' }));
    const port = createFakeBackendPort({ deliver: fn => fn() });
    renderChrome(port);
    await settle();

    expect(screen.getByRole('dialog', { name: 'This is the rebuilt interface' })).toBeInTheDocument();
  });

  it('stays closed on a fresh install with nothing stored yet', async () => {
    const port = createFakeBackendPort({ deliver: fn => fn() });
    renderChrome(port);
    await settle();

    expect(screen.queryByRole('dialog', { name: 'This is the rebuilt interface' })).not.toBeInTheDocument();
  });

  it('tells the truth about Profiles when the stored blob was corrupt, not merely old-shaped', async () => {
    // A corrupt blob loses Profiles too -- the notice must not reuse the
    // old-shape copy that reassures someone their Profiles survived.
    localStorage.setItem(STORAGE_KEY, 'not { valid json');
    const port = createFakeBackendPort({ deliver: fn => fn() });
    renderChrome(port);
    await settle();

    expect(screen.getByRole('dialog', { name: 'This is the rebuilt interface' })).toBeInTheDocument();
    expect(screen.queryByText(/carried across untouched/i)).not.toBeInTheDocument();
    expect(screen.getByText(/nothing could be carried forward, including profiles/i)).toBeInTheDocument();
  });

  it('opens Profiles from the reset notice, in one click', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mapProfiles: [], activeMapProfileId: 'default' }));
    const user = userEvent.setup();
    const port = createFakeBackendPort({ deliver: fn => fn() });
    renderChrome(port);
    await settle();

    await user.click(screen.getByRole('button', { name: 'Open Profiles' }));

    expect(screen.getByRole('dialog', { name: 'Profiles' })).toBeInTheDocument();
  });
});
