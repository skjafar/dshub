// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Window as TauriWindow, getCurrentWindow } from '@tauri-apps/api/window';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { DSHubProvider } from '../../contexts/DSHubContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';
import { DaughterWindowShell } from '../DaughterWindowShell';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  Window: { getByLabel: vi.fn() },
  getCurrentWindow: vi.fn(),
}));

const STORAGE_KEY = 'dshub_settings';

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(getCurrentWindow).mockReturnValue({ label: 'daughter-1' } as never);
  vi.mocked(listen).mockResolvedValue(vi.fn());
  vi.mocked(invoke).mockResolvedValue([]); // list_daughter_windows' default
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
  vi.clearAllMocks();
  window.history.pushState({}, '', '/');
});

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

function renderShell(query: string): { fake: ReturnType<typeof createFakeBackendPort> } {
  window.history.pushState({}, '', `/${query}`);
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  render(
    <BackendPortProvider port={fake as BackendPort}>
      <SettingsProvider>
        <DSHubProvider ownsDeviceLifecycle={false}>
          <DaughterWindowShell />
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );
  return { fake };
}

describe('DaughterWindowShell', () => {
  it('opens with the one Pane named by the ?pane= query string', async () => {
    renderShell('?pane=register');
    await settle();

    // "Registers" is non-singleton (paneRegistry.ts), so even its first
    // instance carries an instance number — "Registers 1", not "Registers".
    expect(screen.getByRole('tab', { name: 'Registers 1' })).toBeInTheDocument();
  });

  it('shows the read-only chrome — link/Control state plus exactly one add-Pane control', async () => {
    renderShell('?pane=overview');
    await settle();

    expect(screen.getByRole('button', { name: 'Add a pane' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect/i })).not.toBeInTheDocument();
  });

  it('adds a second Pane through the add-Pane menu', async () => {
    const user = userEvent.setup();
    renderShell('?pane=overview');
    await settle();

    await user.click(screen.getByRole('button', { name: 'Add a pane' }));
    await user.click(await screen.findByText('Registers'));

    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Registers 1' })).toBeInTheDocument();
  });

  it('closes itself once its one Pane is closed', async () => {
    const tauriClose = vi.fn();
    vi.mocked(TauriWindow.getByLabel).mockResolvedValue({ close: tauriClose } as never);

    renderShell('?pane=overview');
    await settle();

    // Delete/Backspace closes the focused tab — dockview's own keyboard
    // contract, exercised the same way `Workspace.test.tsx` pins it.
    const tab = screen.getByRole('tab', { name: 'Overview' });
    fireEvent.keyDown(tab, { key: 'Delete' });
    await settle();

    expect(TauriWindow.getByLabel).toHaveBeenCalledWith('daughter-1');
    expect(tauriClose).toHaveBeenCalledTimes(1);
  });

  it('ignores an unknown or missing ?pane= value and opens with nothing seeded', async () => {
    renderShell('?pane=not-a-real-kind');
    await settle();

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});
