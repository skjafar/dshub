// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { DSHubProvider } from '../../contexts/DSHubContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { mapManager } from '../../maps/mapManager';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';
import { InterfaceType } from '../../types/shared';
import type { MapProfile } from '../../types/settings';
import { SelectionProvider } from '../SelectionContext';
import { retainPaneState } from '../paneState';
import { InspectorPane } from '../panes/InspectorPane';
import { RegisterPane } from '../panes/RegisterPane';

/**
 * What is specific to the Register Pane, and to the shared Inspector, once the
 * behaviour every data Pane holds in common has moved to
 * `AddressSpacePane.test.tsx`.
 *
 * Filtering, selection, tab naming, link states and multi-instance independence
 * are pinned once, across all three Address Spaces, in that file — repeating
 * them here for the Register Pane specifically would be two suites asserting
 * the same thing, which is exactly the drift risk `AddressSpacePane.test.tsx`'s
 * own docblock exists to prevent. What is left is what genuinely does not
 * generalise: switching display format on one of two open Panes, and the
 * Inspector's own decoding, renaming and staleness behaviour, none of which the
 * cross-space suite exercises.
 *
 * Nothing here mocks a module or stubs the transport: the fake is the same
 * implementation browser development runs against, so what the interface is
 * built against and what it is verified against cannot drift apart.
 */

/** Five entries, spanning both access halves and every type the parser accepts. */
const REGISTERS_MAP = `
// Read only
uint32_t  FIRMWARE_VERSION;
uint32_t  SPINDLE_RPM;
float     COOLANT_TEMP;
// Read/Write
int32_t   MOTOR_X_TARGET;
hex       FAULT_FLAGS;
`;

const PROFILE: MapProfile = {
  id: 'test-board',
  name: 'Test board',
  isDefault: false,
  registersMap: REGISTERS_MAP,
  parametersMap: '',
  createdAt: 0,
};

/** The address the parser assigns `FAULT_FLAGS`, fifth in declaration order. */
const FAULT_FLAGS = 4;

const PANE_A = 'register#1';
const PANE_B = 'register#2';

interface Harness {
  readonly port: ReturnType<typeof createFakeBackendPort>;
  readonly titleA: ReturnType<typeof vi.fn>;
  readonly titleB: ReturnType<typeof vi.fn>;
}

function renderPanes(): Harness {
  // Synchronous delivery, so a read's response has arrived by the time the act()
  // that issued it returns.
  const port = createFakeBackendPort({ deliver: fn => fn() });
  const titleA = vi.fn();
  const titleB = vi.fn();

  render(
    <BackendPortProvider port={port as BackendPort}>
      <SettingsProvider>
        <DSHubProvider>
          <SelectionProvider>
            {/* Labelled so each Pane's own filter, table and selection can be
                queried apart from its twin's. */}
            <section aria-label="Pane A">
              <RegisterPane paneId={PANE_A} setTitle={titleA} />
            </section>
            <section aria-label="Pane B">
              <RegisterPane paneId={PANE_B} setTitle={titleB} />
            </section>
            <section aria-label="Inspector pane">
              <InspectorPane paneId="inspector" setTitle={vi.fn()} />
            </section>
          </SelectionProvider>
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );

  return { port, titleA, titleB };
}

const paneA = (): HTMLElement => screen.getByRole('region', { name: 'Pane A' });
const paneB = (): HTMLElement => screen.getByRole('region', { name: 'Pane B' });
const inspector = (): HTMLElement => screen.getByRole('region', { name: 'Inspector pane' });

/** Lets the provider's asynchronous listener registration finish. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

async function connect(harness: Harness): Promise<void> {
  await act(async () => {
    await harness.port.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
  });
}

beforeEach(async () => {
  await mapManager.initialize(PROFILE);
});

afterEach(() => {
  cleanup();
  // Pane state is keyed by panel id and outlives the component on purpose, so a
  // test that left a filter behind would otherwise hand it to the next one.
  retainPaneState([]);
});

describe('Register Pane', () => {
  it('switches display format per Pane, leaving its twin alone', async () => {
    const user = userEvent.setup();
    const harness = renderPanes();
    await settle();
    await connect(harness);

    await act(async () => {
      await harness.port.device.writeRegister(FAULT_FLAGS, 0x40490fdb);
    });

    await user.click(within(paneA()).getByText('FAULT_FLAGS'));
    await user.click(within(paneB()).getByText('FAULT_FLAGS'));

    // Pane A to hexadecimal; Pane B is left as it was. Driven from the keyboard
    // because jsdom implements no pointer capture, which is what Radix's select
    // uses to track a press — the same reason the primitives suite drives it
    // this way.
    within(paneA()).getByRole('combobox', { name: /display format/i }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(within(paneA()).getByRole('row', { name: /FAULT_FLAGS/ })).toHaveTextContent(
      '0x40490FDB'
    );
    expect(within(paneB()).getByRole('row', { name: /FAULT_FLAGS/ })).toHaveTextContent(
      '1078530011'
    );
  });
});

describe('shared Inspector', () => {
  it('waits for a selection rather than showing an empty shell', async () => {
    renderPanes();
    await settle();

    expect(within(inspector()).getByText(/nothing selected/i)).toBeInTheDocument();
  });

  it('follows the most recent selection, whichever Pane made it', async () => {
    const user = userEvent.setup();
    renderPanes();
    await settle();

    await user.click(within(paneA()).getByText('SPINDLE_RPM'));
    expect(within(inspector()).getByRole('heading', { level: 2 })).toHaveTextContent('SPINDLE_RPM');

    await user.click(within(paneB()).getByText('COOLANT_TEMP'));
    expect(within(inspector()).getByRole('heading', { level: 2 })).toHaveTextContent('COOLANT_TEMP');

    // And says where it came from, which is the only way to tell two Register
    // Panes' selections apart once the Inspector is showing one of them.
    expect(within(inspector()).getByText(/Registers 2/)).toBeInTheDocument();
  });

  it('keeps naming the Pane a selection came from as that Pane renames itself', async () => {
    // A Register Pane's tab tracks its filter. The provenance line was captured
    // when the row was selected, so retyping the filter left the Inspector
    // citing a Pane by a name that was no longer on any tab.
    const user = userEvent.setup();
    renderPanes();
    await settle();

    await user.type(within(paneA()).getByRole('textbox', { name: /filter registers/i }), 'SPIN');
    await user.click(within(paneA()).getByText('SPINDLE_RPM'));
    expect(within(inspector()).getByText(/Registers 1 · SPIN/)).toBeInTheDocument();

    const filter = within(paneA()).getByRole('textbox', { name: /filter registers/i });
    await user.clear(filter);
    await user.type(filter, 'SPINDLE_RPM');

    expect(within(inspector()).getByText(/Registers 1 · SPINDLE_RPM/)).toBeInTheDocument();
  });

  it('states the Address Space, type and access of what it is showing', async () => {
    // An address on its own identifies nothing — the same number exists in all
    // three spaces and means something different in each.
    const user = userEvent.setup();
    renderPanes();
    await settle();

    await user.click(within(paneA()).getByText('MOTOR_X_TARGET'));

    const identity = within(inspector()).getByRole('region', { name: /identity/i });
    expect(identity).toHaveTextContent('Register');
    expect(identity).toHaveTextContent('int32_t');
    expect(identity).toHaveTextContent('read/write');
    expect(identity).toHaveTextContent('0x0003');
  });

  it('decodes one word as decimal, hexadecimal, binary and float at once', async () => {
    const user = userEvent.setup();
    const harness = renderPanes();
    await settle();
    await connect(harness);

    await act(async () => {
      await harness.port.device.writeRegister(FAULT_FLAGS, 0x40490fdb);
    });

    await user.click(within(paneA()).getByText('FAULT_FLAGS'));

    const readings = within(inspector()).getByRole('region', { name: /readings/i });
    expect(readings).toHaveTextContent('1078530011');
    expect(readings).toHaveTextContent('0x40490FDB');
    expect(readings).toHaveTextContent('0100 0000 0100 1001 0000 1111 1101 1011');
    expect(readings).toHaveTextContent('3.142');
  });

  it('says a reading is not current once the link drops', async () => {
    const user = userEvent.setup();
    const harness = renderPanes();
    await settle();
    await connect(harness);

    await user.click(within(paneA()).getByText('SPINDLE_RPM'));

    await act(async () => {
      await harness.port.device.disconnect();
    });

    expect(within(inspector()).getByText(/is not current/i)).toBeInTheDocument();
    expect(within(inspector()).getByRole('button', { name: 'Read' })).toBeDisabled();
  });
});
