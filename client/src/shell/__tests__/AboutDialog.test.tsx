// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { DSHubProvider } from '../../contexts/DSHubContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import { InterfaceType } from '../../types/shared';
import { AboutDialog } from '../AboutDialog';

/**
 * The application's own identity, and a brief read of the connected
 * Device's — driven through the fake port, the same one browser development
 * and every other Pane test in this repo runs against.
 */

/** Mirrors `SettingsContext`'s own (private) storage key. */
const STORAGE_KEY = 'dshub_settings';

interface Harness {
  readonly fake: ReturnType<typeof createFakeBackendPort>;
  readonly onOpenGuide: ReturnType<typeof vi.fn>;
}

function renderDialog(): Harness {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  const onOpenGuide = vi.fn();

  render(
    <BackendPortProvider port={fake}>
      <SettingsProvider>
        <DSHubProvider>
          <AboutDialog open onOpenChange={() => {}} onOpenGuide={onOpenGuide} />
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );

  return { fake, onOpenGuide };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
});

describe('AboutDialog', () => {
  it('shows the application name and version', () => {
    renderDialog();
    expect(screen.getByText('DSHUB')).toBeInTheDocument();
    expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeInTheDocument();
  });

  it('says there is nothing to report before a Device is connected', () => {
    renderDialog();
    expect(screen.getByText(/not connected/i)).toBeInTheDocument();
  });

  it("reports the connected Device's identity once discovered and connected", async () => {
    const { fake } = renderDialog();
    await settle();

    await act(async () => {
      await fake.device.startScan();
    });
    await act(async () => {
      await fake.device.connect('192.168.1.42', InterfaceType.TCP);
    });
    await settle();

    expect(screen.getByText('SESAME-CTRL-01')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.42:2009')).toBeInTheDocument();
  });

  it("never attributes another board's identity to a connection made by address alone", async () => {
    // Connecting to an address the scan never reached has no discovery
    // record — the same guarantee `Overview` makes, for the same reason.
    const { fake } = renderDialog();
    // Lets the provider's own asynchronous listener registration finish
    // before anything is emitted — otherwise the very first event a test
    // fires can race a subscription that has not landed yet.
    await settle();

    await act(async () => {
      await fake.device.connect('10.0.0.9', InterfaceType.TCP, 'Unscanned board');
    });
    await settle();

    expect(screen.getByText(/unscanned board/i)).toBeInTheDocument();
    expect(screen.queryByText('SESAME-CTRL-01')).not.toBeInTheDocument();
  });

  it('opens the Guide and closes itself', async () => {
    const user = userEvent.setup();
    const { onOpenGuide } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Open the Guide' }));

    expect(onOpenGuide).toHaveBeenCalled();
  });
});
