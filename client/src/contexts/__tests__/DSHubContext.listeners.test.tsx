// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { BackendPortProvider } from '../BackendPortContext';
import { SettingsProvider } from '../SettingsContext';
import { DSHubProvider, useDSHub } from '../DSHubContext';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';

afterEach(cleanup);

/**
 * Backend event listeners are registered asynchronously, and the cleanup that
 * removes them runs synchronously. React's StrictMode mounts, unmounts and
 * remounts every effect, so the cleanup fired while the first registration was
 * still in flight — it had nothing to remove, and the completed registration was
 * then never torn down. Two live handler sets meant every device event was
 * dispatched twice: each discovery, connection and register read logged twice,
 * and every reducer ran twice per response.
 *
 * The symptom was visible in the Overview's activity list as duplicated entries.
 * It only bit in development, because StrictMode double-invokes effects only
 * there — but the same race is what happens whenever an effect is cleaned up
 * before its async setup resolves, which is not a development-only situation.
 */
function Harness(): React.JSX.Element {
  const { state } = useDSHub();
  const count = (text: string): number =>
    state.logs.filter(l => l.message.includes(text)).length;
  return (
    <>
      <span data-testid="discovery-logs">{count('Device discovered')}</span>
      <span data-testid="startup-logs">{count('DSHub started')}</span>
    </>
  );
}

/**
 * A port that records how many subscriptions were taken out and how many were
 * released. Whether the provider tears down everything it registered is the
 * actual invariant here, and it is not observable from rendered output — an
 * unmounted tree renders nothing either way.
 */
function countingPort() {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  let subscribed = 0;
  let released = 0;

  const port: BackendPort = {
    device: fake.device,
    files: fake.files,
    events: {
      on: async (event, handler) => {
        subscribed += 1;
        const off = await fake.events.on(event, handler);
        return () => {
          released += 1;
          off();
        };
      },
    },
  };

  return { port, fake, counts: () => ({ subscribed, released }) };
}

function renderApp(port: BackendPort, strict: boolean) {
  const tree = (
    <BackendPortProvider port={port}>
      <SettingsProvider>
        <DSHubProvider>
          <Harness />
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/** Lets the asynchronous listener registration settle before events are sent. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

describe('DSHubContext event listeners', () => {
  it('handles a device event once when mounted normally', async () => {
    const port = createFakeBackendPort({ deliver: fn => fn() });
    renderApp(port, false);
    await settle();

    await act(async () => {
      await port.device.startScan();
    });

    expect(screen.getByTestId('discovery-logs')).toHaveTextContent(/^1$/);
  });

  it('handles a device event once when the effect is mounted twice', async () => {
    // This is StrictMode, and it is the case that was broken: without the fix
    // the same discovery is logged twice.
    const port = createFakeBackendPort({ deliver: fn => fn() });
    renderApp(port, true);
    await settle();

    await act(async () => {
      await port.device.startScan();
    });

    expect(screen.getByTestId('discovery-logs')).toHaveTextContent(/^1$/);
  });

  it('releases every subscription it took out, however many effect runs there were', async () => {
    // The registration that completes after a cleanup has to unsubscribe
    // itself. Counting at the port is the only place this is visible: an
    // unmounted tree renders nothing whether or not its handlers are still live.
    const { port, counts } = countingPort();
    const { unmount } = renderApp(port, true);
    await settle();

    unmount();
    await settle();

    const { subscribed, released } = counts();
    expect(subscribed).toBeGreaterThan(0);
    expect(released).toBe(subscribed);
  });

  it('marks the session started once, not once per effect run', async () => {
    // Same duplicated-entry symptom, different cause: this one is dispatched in
    // the effect body, and no cleanup can take a log entry back.
    const port = createFakeBackendPort({ deliver: fn => fn() });
    renderApp(port, true);
    await settle();

    expect(screen.getByTestId('startup-logs')).toHaveTextContent(/^1$/);
  });

});
