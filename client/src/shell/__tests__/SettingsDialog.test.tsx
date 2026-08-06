// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider, useSettings } from '../../contexts/SettingsContext';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type { MapProfile } from '../../types/settings';
import { SettingsDialog } from '../SettingsDialog';

/**
 * Application preferences — ticket 20's own boundary: theme, connection
 * behaviour, plot defaults and Activity Log filtering and retention, and
 * nothing a Profile owns. Driven through the real `SettingsContext` rather
 * than a mock, matching this repo's precedent of testing against the actual
 * seam a Pane or dialog is built on.
 */

const STORAGE_KEY = 'dshub_settings';

const CUSTOM_PROFILE: MapProfile = {
  id: 'probe-board',
  name: 'Probe board',
  isDefault: false,
  registersMap: '',
  parametersMap: '',
  createdAt: 0,
};

function seedSettings(overrides: Partial<typeof DEFAULT_SETTINGS> = {}): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...overrides }));
}

/** Renders alongside the dialog so a test can read live `settings` state without touching localStorage's own debounce. */
function SettingsProbe(): React.JSX.Element {
  const { settings } = useSettings();
  return (
    <dl>
      <dt>profiles</dt>
      <dd data-testid="probe-profile-count">{settings.mapProfiles.length}</dd>
      <dt>autoScan</dt>
      <dd data-testid="probe-auto-scan">{String(settings.autoScan)}</dd>
      <dt>pollInterval</dt>
      <dd data-testid="probe-poll-interval">{settings.plotDefaults.pollInterval}</dd>
    </dl>
  );
}

function renderDialog(): void {
  render(
    <SettingsProvider>
      <SettingsDialog open onOpenChange={() => {}} />
      <SettingsProbe />
    </SettingsProvider>
  );
}

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
  vi.useRealTimers();
});

describe('SettingsDialog', () => {
  it('marks the active Theme and switches Theme on click', async () => {
    seedSettings({ colorThemeId: 'kinetic-monolith' });
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByRole('button', { name: /^Kinetic Monolith/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Blueprint/ })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: /^Blueprint/ }));

    expect(screen.getByRole('button', { name: /^Blueprint/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Kinetic Monolith/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reveals retry fields only once Auto-connect is enabled', async () => {
    seedSettings({ autoConnect: false });
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryByLabelText('Retry attempts')).not.toBeInTheDocument();

    await user.click(screen.getByText('Auto-connect to the last device on startup'));

    expect(screen.getByLabelText('Retry attempts')).toBeInTheDocument();
    expect(screen.getByLabelText('Retry delay')).toBeInTheDocument();
  });

  it('commits a Plot default within range and refuses one outside it', async () => {
    seedSettings();
    const user = userEvent.setup();
    renderDialog();

    const pollField = screen.getByLabelText('Poll interval');
    await user.clear(pollField);
    await user.type(pollField, '200');
    await user.tab();
    expect(screen.getByTestId('probe-poll-interval')).toHaveTextContent('200');

    // Refused: below the 50ms floor. The field reverts rather than commits.
    await user.clear(pollField);
    await user.type(pollField, '10');
    await user.tab();
    expect(screen.getByTestId('probe-poll-interval')).toHaveTextContent('200');
    expect(screen.getByDisplayValue('200')).toBeInTheDocument();
  });

  it("keeps 'Time span' bounded by the current 'Maximum time span', not a fixed ceiling", async () => {
    seedSettings({ plotDefaults: { ...DEFAULT_SETTINGS.plotDefaults, maxTimeSpan: 120 } });
    const user = userEvent.setup();
    renderDialog();

    const timeSpanField = screen.getByLabelText('Time span');
    await user.clear(timeSpanField);
    await user.type(timeSpanField, '119');
    await user.tab();
    expect(screen.getByDisplayValue('119')).toBeInTheDocument();

    await user.clear(timeSpanField);
    await user.type(timeSpanField, '121'); // exceeds maxTimeSpan of 120
    await user.tab();
    // Refused — reverts to the last committed value.
    expect(screen.getByDisplayValue('119')).toBeInTheDocument();
  });

  it('resets preferences to defaults after a second confirming click, without touching Profiles', async () => {
    seedSettings({
      autoScan: false,
      plotDefaults: { ...DEFAULT_SETTINGS.plotDefaults, pollInterval: 999 },
      mapProfiles: [CUSTOM_PROFILE],
    });
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByTestId('probe-auto-scan')).toHaveTextContent('false');
    expect(screen.getByTestId('probe-profile-count')).toHaveTextContent('1');

    const resetButton = screen.getByRole('button', { name: 'Reset to defaults' });
    await user.click(resetButton);
    expect(screen.getByTestId('probe-auto-scan')).toHaveTextContent('false'); // not yet applied

    await user.click(screen.getByRole('button', { name: 'Confirm reset?' }));

    expect(screen.getByTestId('probe-auto-scan')).toHaveTextContent(String(DEFAULT_SETTINGS.autoScan));
    expect(screen.getByTestId('probe-poll-interval')).toHaveTextContent(String(DEFAULT_SETTINGS.plotDefaults.pollInterval));
    // Profiles are untouched by a preferences reset.
    expect(screen.getByTestId('probe-profile-count')).toHaveTextContent('1');
  });

  it('reports a storage save failure rather than dropping it silently', async () => {
    seedSettings();
    vi.useFakeTimers();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    renderDialog();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Any change schedules SettingsContext's own debounced save.
    fireEvent.click(screen.getByText('Auto-scan for devices on startup'));
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/storage is full/i);

    setItemSpy.mockRestore();
  });
});
