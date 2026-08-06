// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
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

afterEach(cleanup);

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
