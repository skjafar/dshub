// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SettingsProvider, useSettings } from '../SettingsContext';
import { DEFAULT_SETTINGS } from '../../types/settings';

/**
 * `justMigrated` is what a one-time UI notice (ticket 21) is seeded from —
 * this pins it through the real provider, on top of `settingsMigration.ts`'s
 * own unit tests for the migration logic itself.
 */

const STORAGE_KEY = 'dshub_settings';

function Probe(): React.JSX.Element {
  const { settings, justMigrated, profilesCarriedOver } = useSettings();
  return (
    <dl>
      <dt>justMigrated</dt>
      <dd data-testid="probe-just-migrated">{String(justMigrated)}</dd>
      <dt>profilesCarriedOver</dt>
      <dd data-testid="probe-profiles-carried-over">{String(profilesCarriedOver)}</dd>
      <dt>profiles</dt>
      <dd data-testid="probe-profile-count">{settings.mapProfiles.length}</dd>
    </dl>
  );
}

function renderProbe(): void {
  render(
    <SettingsProvider>
      <Probe />
    </SettingsProvider>
  );
}

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
});

describe('SettingsContext — schema migration', () => {
  it('reports no migration on a fresh install', () => {
    renderProbe();
    expect(screen.getByTestId('probe-just-migrated')).toHaveTextContent('false');
  });

  it('reports no migration for a blob already on the current schema', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS }));
    renderProbe();
    expect(screen.getByTestId('probe-just-migrated')).toHaveTextContent('false');
  });

  it('reports a migration and preserves Profiles for an old, unversioned blob', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        colorThemeId: 'kinetic-monolith',
        mapProfiles: [
          {
            id: 'p1',
            name: 'My board',
            isDefault: false,
            registersMap: 'uint32_t FOO;',
            parametersMap: 'uint32_t BAR;',
            createdAt: 1000,
          },
        ],
        activeMapProfileId: 'p1',
        // no schemaVersion — the shape every blob had before ticket 21
      })
    );
    renderProbe();

    expect(screen.getByTestId('probe-just-migrated')).toHaveTextContent('true');
    expect(screen.getByTestId('probe-profiles-carried-over')).toHaveTextContent('true');
    expect(screen.getByTestId('probe-profile-count')).toHaveTextContent('1');
  });

  it('reports Profiles as lost, not carried over, for a corrupt blob', () => {
    localStorage.setItem(STORAGE_KEY, 'not { valid json');
    renderProbe();

    expect(screen.getByTestId('probe-just-migrated')).toHaveTextContent('true');
    expect(screen.getByTestId('probe-profiles-carried-over')).toHaveTextContent('false');
    expect(screen.getByTestId('probe-profile-count')).toHaveTextContent('0');
  });
});
