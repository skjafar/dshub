// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { DSHubProvider, useDSHub } from '../../contexts/DSHubContext';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';
import { DEFAULT_SETTINGS } from '../../types/settings';
import AutoConnectManager from '../AutoConnectManager';

/**
 * Settings' "Auto-connect to the last device on startup" (and its retry
 * fields) previously had no consumer at all — enabling it in Settings did
 * nothing. These exercise the manager against the real `DSHubContext` and
 * `SettingsContext`, the same seam `DSHubContext.listeners.test.tsx` uses,
 * rather than mocking either away.
 */

const STORAGE_KEY = 'dshub_settings';

function seedSettings(overrides: Partial<typeof DEFAULT_SETTINGS> = {}): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...overrides }));
}

/** A port whose `connect` rejects the first `failures` calls before delegating to the fake. */
function flakyPort(failures: number): { readonly port: BackendPort; readonly calls: () => number } {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  let calls = 0;
  const port: BackendPort = {
    ...fake,
    device: {
      ...fake.device,
      connect: async (ip, interfaceType, deviceName) => {
        calls += 1;
        if (calls <= failures) throw new Error('unreachable');
        return fake.device.connect(ip, interfaceType, deviceName);
      },
    },
  };
  return { port, calls: () => calls };
}

function Harness(): React.JSX.Element {
  const { state } = useDSHub();
  return <span data-testid="connected">{String(state.connection?.connected ?? false)}</span>;
}

function renderApp(port: BackendPort) {
  return render(
    <BackendPortProvider port={port}>
      <SettingsProvider>
        <DSHubProvider>
          <AutoConnectManager />
          <Harness />
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
}

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
  vi.useRealTimers();
});

describe('AutoConnectManager', () => {
  it('does nothing when auto-connect is disabled', async () => {
    seedSettings({ autoConnect: false, lastDeviceIP: '10.0.0.5' });
    const { port, calls } = flakyPort(0);
    renderApp(port);

    await wait(600);
    expect(calls()).toBe(0);
    expect(screen.getByTestId('connected')).toHaveTextContent('false');
  });

  it('does nothing when there is no remembered device address', async () => {
    seedSettings({ autoConnect: true, lastDeviceIP: '' });
    const { port, calls } = flakyPort(0);
    renderApp(port);

    await wait(600);
    expect(calls()).toBe(0);
  });

  it('connects to the last device on startup', async () => {
    seedSettings({ autoConnect: true, lastDeviceIP: '10.0.0.5', lastInterfaceType: 'TCP' });
    const { port, calls } = flakyPort(0);
    renderApp(port);

    await waitFor(() => expect(screen.getByTestId('connected')).toHaveTextContent('true'), { timeout: 2000 });
    expect(calls()).toBe(1);
  });

  it('retries a failed first attempt and succeeds within the configured retry count', async () => {
    seedSettings({
      autoConnect: true,
      lastDeviceIP: '10.0.0.5',
      autoConnectRetries: 3,
      autoConnectRetryDelay: 30,
    });
    const { port, calls } = flakyPort(2);
    renderApp(port);

    await waitFor(() => expect(screen.getByTestId('connected')).toHaveTextContent('true'), { timeout: 3000 });
    expect(calls()).toBe(3);
  });

  it('gives up once its retries are exhausted', async () => {
    seedSettings({
      autoConnect: true,
      lastDeviceIP: '10.0.0.5',
      autoConnectRetries: 1,
      autoConnectRetryDelay: 30,
    });
    const { port, calls } = flakyPort(99);
    renderApp(port);

    await wait(800);
    expect(calls()).toBe(2); // one attempt plus one retry
    expect(screen.getByTestId('connected')).toHaveTextContent('false');
  });
});
