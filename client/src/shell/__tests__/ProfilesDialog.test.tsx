// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type { MapProfile } from '../../types/settings';
import { ProfilesDialog } from '../ProfilesDialog';

/**
 * Creating, switching, deleting, importing and exporting Profiles, driven
 * through the real `SettingsContext` (the logic already lived there, carried
 * over from the pre-rebuild editor) and the fake port. The one behaviour that
 * is new here rather than inherited is the guarantee ticket 19 names
 * explicitly: a malformed or unversioned import applies nothing.
 *
 * The built-in Default and CNC demo Profiles load from `fetch('/maps/...')`
 * in `SettingsContext`, which has nothing to answer it in this environment —
 * so, like `CommandPane.test.tsx` and `AddressSpacePane.test.tsx`, every case
 * here seeds its own custom Profile rather than exercising a built-in one.
 */

const STORAGE_KEY = 'dshub_settings';

const CUSTOM_PROFILE: MapProfile = {
  id: 'custom-board',
  name: 'Custom board',
  isDefault: false,
  registersMap: '',
  parametersMap: '',
  createdAt: 0,
};

function seedSettings(overrides: Partial<typeof DEFAULT_SETTINGS> = {}): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...overrides }));
}

interface Harness {
  readonly onBeforeProfileChange: ReturnType<typeof vi.fn>;
  readonly onOpenChange: ReturnType<typeof vi.fn>;
  readonly saveText: ReturnType<typeof vi.fn>;
}

/** The dialog's `open` prop is a fixed `true` rather than wired to `onOpenChange`, so a test can inspect the list after an action that requests a close. */
function renderDialog(): Harness {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  const saveText = vi.fn(fake.files.saveText);
  const port: BackendPort = { ...fake, files: { ...fake.files, saveText } };
  const onBeforeProfileChange = vi.fn();
  const onOpenChange = vi.fn();

  render(
    <BackendPortProvider port={port}>
      <SettingsProvider>
        <ProfilesDialog open onOpenChange={onOpenChange} onBeforeProfileChange={onBeforeProfileChange} />
      </SettingsProvider>
    </BackendPortProvider>
  );

  return { onBeforeProfileChange, onOpenChange, saveText };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

/**
 * Dispatches a file input change and waits for `FileReader`'s asynchronous
 * read to complete, rather than a fixed tick — `readAsText` in jsdom does not
 * reliably settle within exactly one macrotask, and a fixed wait made this
 * flaky under load where the other, synchronous-effect tests here are not.
 */
async function importFile(content: string, name: string): Promise<void> {
  const file = new File([content], name, { type: 'application/json' });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
});

describe('ProfilesDialog', () => {
  it("marks the active Profile's own row inert, so switching to it is not offered", async () => {
    seedSettings({ mapProfiles: [CUSTOM_PROFILE], activeMapProfileId: CUSTOM_PROFILE.id });
    renderDialog();
    await settle();

    expect(screen.getByRole('button', { name: /^Custom board/ })).toBeDisabled();
  });

  it('creates a new Profile, activates it, flushes the outgoing Workspace first, and requests the dialog close', async () => {
    seedSettings();
    const user = userEvent.setup();
    const { onBeforeProfileChange, onOpenChange } = renderDialog();
    await settle();

    await user.type(screen.getByLabelText('New Profile'), 'Production Config');
    await user.click(screen.getByRole('button', { name: /Create/ }));

    expect(onBeforeProfileChange).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: /^Production Config/ })).toBeDisabled();
  });

  it('switches Profile, flushing the outgoing Workspace first, and requests the dialog close', async () => {
    const other: MapProfile = { ...CUSTOM_PROFILE, id: 'other-board', name: 'Other board' };
    seedSettings({ mapProfiles: [CUSTOM_PROFILE, other], activeMapProfileId: CUSTOM_PROFILE.id });
    const user = userEvent.setup();
    const { onBeforeProfileChange, onOpenChange } = renderDialog();
    await settle();

    await user.click(screen.getByRole('button', { name: 'Other board' }));

    expect(onBeforeProfileChange).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: /^Other board/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Custom board/ })).toBeEnabled();
  });

  it('deletes a custom Profile only after the delete action is confirmed a second time', async () => {
    seedSettings({ mapProfiles: [CUSTOM_PROFILE], activeMapProfileId: DEFAULT_SETTINGS.activeMapProfileId });
    const user = userEvent.setup();
    renderDialog();
    await settle();

    const deleteButton = screen.getByRole('button', { name: 'Delete Custom board' });
    await user.click(deleteButton);
    expect(screen.getByText('Custom board')).toBeInTheDocument(); // still present, not yet deleted

    const confirmButton = screen.getByRole('button', { name: 'Confirm deleting Custom board' });
    await user.click(confirmButton);

    expect(screen.queryByText('Custom board')).not.toBeInTheDocument();
  });

  it('exports a Profile through the port as a .dshub file', async () => {
    seedSettings({ mapProfiles: [CUSTOM_PROFILE], activeMapProfileId: CUSTOM_PROFILE.id });
    const user = userEvent.setup();
    const { saveText } = renderDialog();
    await settle();

    await user.click(screen.getByRole('button', { name: 'Export Custom board' }));

    expect(saveText).toHaveBeenCalledTimes(1);
    const request = saveText.mock.calls[0][0];
    expect(request.suggestedName).toBe('Custom_board.dshub');
    expect(JSON.parse(request.content)).toMatchObject({ dshub_profile: 1, name: 'Custom board' });
  });

  it('imports a well-formed Profile file, activates it, and requests the dialog close', async () => {
    seedSettings();
    const { onBeforeProfileChange, onOpenChange } = renderDialog();
    await settle();

    await importFile(
      JSON.stringify({
        dshub_profile: 1,
        name: 'Imported board',
        exportedAt: new Date().toISOString(),
        maps: { registers: 'uint32_t SPEED;\n', parameters: '', sysCommands: [] },
        metadata: { registers: {}, parameters: {} },
      }),
      'board.dshub'
    );

    await waitFor(() => {
      expect(onBeforeProfileChange).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(screen.getByRole('button', { name: /^Imported board/ })).toBeDisabled();
  });

  it('rejects a malformed (invalid JSON) import with a clear reason and applies nothing', async () => {
    seedSettings({ mapProfiles: [CUSTOM_PROFILE], activeMapProfileId: CUSTOM_PROFILE.id });
    renderDialog();
    await settle();

    await importFile('{ not json', 'broken.dshub');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/import failed/i);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid json/i);
    // The only row is still the one seeded — nothing was created or activated.
    expect(screen.getByRole('button', { name: /^Custom board/ })).toBeDisabled();
  });

  it('rejects an unversioned import file with a clear reason and applies nothing', async () => {
    seedSettings({ mapProfiles: [CUSTOM_PROFILE], activeMapProfileId: CUSTOM_PROFILE.id });
    renderDialog();
    await settle();

    await importFile(JSON.stringify({ name: 'No version field' }), 'legacy.json');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/does not appear to be a dshub profile/i);
    });
    expect(screen.queryByText('No version field')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Custom board/ })).toBeDisabled();
  });
});
