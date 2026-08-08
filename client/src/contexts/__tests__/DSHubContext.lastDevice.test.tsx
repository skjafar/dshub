// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { BackendPortProvider } from '../BackendPortContext';
import { SettingsProvider, useSettings } from '../SettingsContext';
import { DSHubProvider, useDSHub } from '../DSHubContext';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import { InterfaceType } from '../../types/shared';

/**
 * A successful connection is the one place "the last device" can honestly be
 * learned from — see `AutoConnectManager`, which reads these fields back on a
 * later startup. Before this, nothing ever wrote them: Settings' "last device
 * address" only ever held whatever someone had typed into the Settings dialog
 * by hand.
 */

afterEach(cleanup);

function Harness(): React.JSX.Element {
  const { state } = useDSHub();
  const { settings } = useSettings();
  return (
    <>
      <span data-testid="connected">{String(state.connection?.connected ?? false)}</span>
      <span data-testid="last-ip">{settings.lastDeviceIP}</span>
      <span data-testid="last-name">{settings.lastDeviceName ?? ''}</span>
      <span data-testid="last-interface">{settings.lastInterfaceType}</span>
    </>
  );
}

function renderApp(port: ReturnType<typeof createFakeBackendPort>) {
  return render(
    <BackendPortProvider port={port}>
      <SettingsProvider>
        <DSHubProvider>
          <Harness />
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

describe('DSHubContext remembering the last connected device', () => {
  it('records IP, board name and interface once the device answers', async () => {
    const port = createFakeBackendPort({ deliver: fn => fn() });
    renderApp(port);
    await settle();

    await act(async () => {
      await port.device.connect('10.0.0.5', InterfaceType.TCP, 'Test Board');
    });

    expect(screen.getByTestId('connected')).toHaveTextContent('true');
    expect(screen.getByTestId('last-ip')).toHaveTextContent('10.0.0.5');
    expect(screen.getByTestId('last-name')).toHaveTextContent('Test Board');
    expect(screen.getByTestId('last-interface')).toHaveTextContent('TCP');
  });

  it('records UDP as the interface when that is how it connected', async () => {
    const port = createFakeBackendPort({ deliver: fn => fn() });
    renderApp(port);
    await settle();

    await act(async () => {
      await port.device.connect('10.0.0.9', InterfaceType.UDP);
    });

    expect(screen.getByTestId('last-ip')).toHaveTextContent('10.0.0.9');
    expect(screen.getByTestId('last-interface')).toHaveTextContent('UDP');
  });
});
