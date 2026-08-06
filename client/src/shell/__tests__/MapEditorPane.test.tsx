// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { DSHubProvider } from '../../contexts/DSHubContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { SelectionProvider } from '../SelectionContext';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type { MapProfile } from '../../types/settings';
import { retainPaneState } from '../paneState';
import { MapEditorPane } from '../panes/MapEditorPane';
import { RegisterPane } from '../panes/RegisterPane';

/**
 * Editing a Profile's Map from a Pane, driven through the fake port and the
 * real `SettingsContext` — ticket 19's own wording is "an Engineer can revise
 * entry names, types, access and metadata while watching the Registers those
 * entries name", so the save path is pinned end to end: a rename reaches the
 * Profile *and* is visible to a separate, already-open Register Pane, which
 * is only true if saving also reloads the `mapManager` singleton every other
 * Pane reads from.
 */

const STORAGE_KEY = 'dshub_settings';

function profile(overrides: Partial<MapProfile> = {}): MapProfile {
  return {
    id: 'editor-test-board',
    name: 'Editable board',
    isDefault: false,
    registersMap: 'uint32_t SPEED;\nuint32_t LOAD;\n',
    parametersMap: 'uint32_t GAIN;\n',
    sysCommands: [{ code: 10, name: 'HOME', description: 'Home the axis' }],
    createdAt: 0,
    ...overrides,
  };
}

function seedActiveProfile(active: MapProfile): void {
  const settings = {
    ...DEFAULT_SETTINGS,
    mapProfiles: [active],
    activeMapProfileId: active.id,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function renderPanes(children: React.ReactNode): { fake: ReturnType<typeof createFakeBackendPort> } {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  const port: BackendPort = fake;

  render(
    <BackendPortProvider port={port}>
      <SettingsProvider>
        <DSHubProvider>
          <SelectionProvider>{children}</SelectionProvider>
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );

  return { fake };
}

/** Lets the providers' asynchronous effects (Profile load, Map parse) finish. */
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
  retainPaneState([]);
});

describe('Map Editor Pane', () => {
  it("lists the active Profile's Registers and Parameters by name", async () => {
    seedActiveProfile(profile());
    renderPanes(<MapEditorPane paneId="mapEditor" setTitle={vi.fn()} />);
    await settle();

    expect(screen.getByDisplayValue('SPEED')).toBeInTheDocument();
    expect(screen.getByDisplayValue('LOAD')).toBeInTheDocument();
  });

  it('shows Parameters on the Parameters tab and Commands on the Commands tab', async () => {
    seedActiveProfile(profile());
    const user = userEvent.setup();
    renderPanes(<MapEditorPane paneId="mapEditor" setTitle={vi.fn()} />);
    await settle();

    await user.click(screen.getByRole('tab', { name: /Parameters/ }));
    expect(screen.getByDisplayValue('GAIN')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Commands/ }));
    expect(screen.getByDisplayValue('HOME')).toBeInTheDocument();
  });

  it('marks the draft dirty after an edit and lets Reset discard it', async () => {
    seedActiveProfile(profile());
    const user = userEvent.setup();
    renderPanes(<MapEditorPane paneId="mapEditor" setTitle={vi.fn()} />);
    await settle();

    const nameField = screen.getByLabelText('Name for SPEED');
    await user.clear(nameField);
    await user.type(nameField, 'VELOCITY');
    await user.tab();

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Save/ })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByDisplayValue('SPEED')).toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('refuses a rename that collides with another entry, reverting the field rather than leaving the rejected text standing', async () => {
    seedActiveProfile(profile());
    const user = userEvent.setup();
    renderPanes(<MapEditorPane paneId="mapEditor" setTitle={vi.fn()} />);
    await settle();

    const nameField = screen.getByLabelText('Name for SPEED');
    await user.clear(nameField);
    await user.type(nameField, 'LOAD');
    await user.tab();

    expect(screen.getByRole('alert')).toHaveTextContent(/already in use/i);
    // The refused rename must not linger in the field as if it had committed.
    expect(screen.getByDisplayValue('SPEED')).toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('shows a clear notice and withholds editing when no Profile is active', async () => {
    renderPanes(<MapEditorPane paneId="mapEditor" setTitle={vi.fn()} />);
    await settle();

    expect(screen.getByText(/no profile is active/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add entry/ })).toBeDisabled();
  });

  it('saves an edit to the Profile and reloads the Map every other open Pane reads from', async () => {
    const target = profile({ id: 'editor-save-board', name: 'Save board' });
    seedActiveProfile(target);
    const user = userEvent.setup();
    renderPanes(
      <>
        <MapEditorPane paneId="mapEditor" setTitle={vi.fn()} />
        <RegisterPane paneId="register" setTitle={vi.fn()} />
      </>
    );
    await settle();

    const nameField = screen.getByLabelText('Name for SPEED');
    await user.clear(nameField);
    await user.type(nameField, 'VELOCITY');
    await user.tab();

    await user.click(screen.getByRole('button', { name: /^Save/ }));
    await settle();

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    // A Register Pane is a separate `mapManager` subscriber; seeing the
    // rename is only possible if Save reloaded the manager and announced it.
    expect(screen.getByText('VELOCITY')).toBeInTheDocument();
  });

  it('refuses a Command code that collides with another Command, leaving the draft unchanged', async () => {
    seedActiveProfile(
      profile({
        sysCommands: [
          { code: 10, name: 'HOME' },
          { code: 20, name: 'ENABLE' },
        ],
      })
    );
    const user = userEvent.setup();
    renderPanes(<MapEditorPane paneId="mapEditor" setTitle={vi.fn()} />);
    await settle();

    await user.click(screen.getByRole('tab', { name: /Commands/ }));
    const codeField = screen.getByLabelText('Code for command 2'); // ENABLE
    await user.clear(codeField);
    await user.type(codeField, '10');
    await user.tab();

    expect(screen.getByRole('alert')).toHaveTextContent(/already used/i);
    // Reverted rather than left showing the code it was refused for — the
    // same contract `EditableRow`'s name field pins for Registers/Parameters.
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('refuses a Command code reserved for a built-in library Command', async () => {
    seedActiveProfile(profile({ sysCommands: [{ code: 10, name: 'HOME' }] }));
    const user = userEvent.setup();
    renderPanes(<MapEditorPane paneId="mapEditor" setTitle={vi.fn()} />);
    await settle();

    await user.click(screen.getByRole('tab', { name: /Commands/ }));
    const codeField = screen.getByLabelText('Code for command 1');
    await user.clear(codeField);
    await user.type(codeField, '65000'); // ds_sys_command_READ_FLASH
    await user.tab();

    expect(screen.getByRole('alert')).toHaveTextContent(/reserved/i);
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
  });

  it('imports a .map file with bad lines, applying the good entries and stating what was skipped', async () => {
    seedActiveProfile(profile());
    renderPanes(<MapEditorPane paneId="mapEditor" setTitle={vi.fn()} />);
    await settle();

    const content = 'uint32_t GOOD_ONE;\nbadtype BAD_ONE;\n';
    const file = new File([content], 'registers.map', { type: 'text/plain' });
    const input = document.querySelectorAll('input[type="file"]')[0] as HTMLInputElement;
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/imported with 1 issue/i);
    });
    expect(screen.getByDisplayValue('GOOD_ONE')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('BAD_ONE')).not.toBeInTheDocument();
  });
});
