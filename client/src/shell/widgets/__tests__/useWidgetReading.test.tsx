// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { BackendPortProvider } from '../../../contexts/BackendPortContext';
import { DSHubProvider } from '../../../contexts/DSHubContext';
import { SettingsProvider } from '../../../contexts/SettingsContext';
import { mapManager } from '../../../maps/mapManager';
import { createFakeBackendPort } from '../../../services/fakeBackendPort';
import type { BackendPort } from '../../../services/backendPort';
import { DataForm } from '../../../maps/mapParser';
import { DEFAULT_SETTINGS } from '../../../types/settings';
import type { MapProfile } from '../../../types/settings';
import { snapshotFromEntry } from '../../bindingIdentity';
import { announceMapEdited } from '../../useMapEntries';
import { useWidgetReading } from '../useWidgetReading';
import type { WidgetBinding } from '../widgetConfig';

/**
 * `useWidgetReading`'s live "needs review" status
 * (`.scratch/map-binding-drift/issues/03-live-needs-review-status.md`),
 * mirroring the hook/decode-level testing the ticket itself calls for —
 * feeding a mismatched snapshot against a fake active Map and asserting the
 * resulting status, the same as the existing `'not-found'` case.
 */

const STORAGE_KEY = 'dshub_settings';

const REGISTERS_MAP = `
uint32_t  SPINDLE_RPM;
float     COOLANT_TEMP;
`;
const SPINDLE_RPM_ADDRESS = 0;

const PROFILE: MapProfile = {
  id: 'needs-review-test-board',
  name: 'Needs review test board',
  isDefault: false,
  registersMap: REGISTERS_MAP,
  parametersMap: '',
  createdAt: 0,
};

function seedActiveProfile(): void {
  const settings = { ...DEFAULT_SETTINGS, mapProfiles: [PROFILE], activeMapProfileId: PROFILE.id };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function bindingToSpindle(): WidgetBinding {
  return {
    space: 'register',
    address: SPINDLE_RPM_ADDRESS,
    snapshot: snapshotFromEntry({
      address: SPINDLE_RPM_ADDRESS,
      name: 'SPINDLE_RPM',
      type: DataForm.UINT,
      isArray: false,
      accessPermit: 'READ_WRITE' as never,
      showAsHex: false,
    }),
  };
}

function renderReading(binding: WidgetBinding | null) {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  const wrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
    <BackendPortProvider port={fake as BackendPort}>
      <SettingsProvider>
        <DSHubProvider>{children}</DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );
  const view = renderHook(({ b }) => useWidgetReading(b, 'decimal'), { wrapper, initialProps: { b: binding } });
  return { fake, view };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  localStorage.removeItem(STORAGE_KEY);
  seedActiveProfile();
  await mapManager.initialize(PROFILE);
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
});

describe('needs-review status', () => {
  it('does not flag a binding that has not drifted at all', async () => {
    const { view } = renderReading(bindingToSpindle());
    await settle();
    expect(view.result.current.status).not.toBe('needs-review');
    expect(view.result.current.entry?.name).toBe('SPINDLE_RPM');
  });

  it('reports needs-review once the bound entry moves to a different address', async () => {
    const { view } = renderReading(bindingToSpindle());
    await settle();

    await act(async () => {
      announceMapEdited({
        ...PROFILE,
        registersMap: `
float     COOLANT_TEMP;
uint32_t  SPINDLE_RPM;
`,
      });
    });

    await waitFor(() => expect(view.result.current.status).toBe('needs-review'));
  });

  it('reports needs-review once the bound entry’s name is gone entirely, even though another entry now occupies its address', async () => {
    const { view } = renderReading(bindingToSpindle());
    await settle();

    await act(async () => {
      announceMapEdited({ ...PROFILE, registersMap: 'uint32_t REPLACEMENT;\nfloat COOLANT_TEMP;' });
    });

    await waitFor(() => expect(view.result.current.status).toBe('needs-review'));
  });

  it('reports needs-review once the bound entry’s type changes at the same name and address', async () => {
    const { view } = renderReading(bindingToSpindle());
    await settle();

    await act(async () => {
      announceMapEdited({ ...PROFILE, registersMap: 'float SPINDLE_RPM;\nfloat COOLANT_TEMP;' });
    });

    await waitFor(() => expect(view.result.current.status).toBe('needs-review'));
  });

  it('reports needs-review, not not-found, when an earlier entry’s deletion shifts the bound entry down and leaves its old address genuinely vacant', async () => {
    // COOLANT_TEMP starts at address 1. Deleting SPINDLE_RPM (address 0)
    // shifts COOLANT_TEMP down to address 0 and leaves address 1 held by
    // nothing at all — mapParser.ts's own sequential, no-gaps addressing —
    // which is the routine case a by-address-first lookup would misread as
    // plain "not found" instead of "needs review".
    const binding: WidgetBinding = {
      space: 'register',
      address: 1,
      snapshot: snapshotFromEntry({
        address: 1,
        name: 'COOLANT_TEMP',
        type: DataForm.FLOAT,
        isArray: false,
        accessPermit: 'READ_WRITE' as never,
        showAsHex: false,
      }),
    };
    const { view } = renderReading(binding);
    await settle();

    await act(async () => {
      announceMapEdited({ ...PROFILE, registersMap: 'float COOLANT_TEMP;' });
    });

    await waitFor(() => expect(view.result.current.status).toBe('needs-review'));
  });

  it('keeps the pre-existing not-found status for an address with nothing at it at all, rather than needs-review', async () => {
    const binding: WidgetBinding = { space: 'register', address: 99, snapshot: null };
    const { view } = renderReading(binding);
    await settle();

    expect(view.result.current.status).toBe('not-found');
  });
});
