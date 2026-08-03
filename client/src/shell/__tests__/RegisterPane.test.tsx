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
 * The Register Pane and the shared Inspector, driven through the fake port.
 *
 * Nothing here mocks a module or stubs the transport: the fake is the same
 * implementation browser development runs against, so what the interface is
 * built against and what it is verified against cannot drift apart.
 *
 * The Panes are rendered directly rather than through dockview. What is under
 * test is that two Panes of a kind are independent and that one Inspector
 * follows both — none of which is the dock engine's behaviour.
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

const filterIn = (pane: HTMLElement): HTMLElement =>
  within(pane).getByRole('textbox', { name: /filter registers/i });

const rowNames = (pane: HTMLElement): string[] =>
  within(pane)
    .getAllByRole('row')
    // The header row has no data cells, and the "nothing matched" row is one
    // cell spanning the table rather than an entry.
    .filter(row => within(row).queryAllByRole('cell').length > 1)
    .map(row => within(row).getAllByRole('cell')[1].textContent ?? '');

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
  it('lists entries by name, type and access from the Map', async () => {
    renderPanes();
    await settle();

    expect(rowNames(paneA())).toEqual([
      'FIRMWARE_VERSION',
      'SPINDLE_RPM',
      'COOLANT_TEMP',
      'MOTOR_X_TARGET',
      'FAULT_FLAGS',
    ]);

    const motorRow = within(paneA()).getByRole('row', { name: /MOTOR_X_TARGET/ });
    expect(motorRow).toHaveTextContent('int32_t');
    expect(motorRow).toHaveTextContent('read/write');

    // Access comes from the Map's own read-only boundary, not from a guess.
    const firmwareRow = within(paneA()).getByRole('row', { name: /FIRMWARE_VERSION/ });
    expect(firmwareRow).toHaveTextContent('read-only');
  });

  it('filters by name, whatever case it was typed in', async () => {
    const user = userEvent.setup();
    renderPanes();
    await settle();

    await user.type(filterIn(paneA()), 'motor');

    expect(rowNames(paneA())).toEqual(['MOTOR_X_TARGET']);
  });

  it('filters by address, in decimal and in hexadecimal', async () => {
    const user = userEvent.setup();
    renderPanes();
    await settle();

    await user.type(filterIn(paneA()), '4');
    expect(rowNames(paneA())).toEqual(['FAULT_FLAGS']);

    await user.clear(filterIn(paneA()));
    await user.type(filterIn(paneA()), '0x04');
    expect(rowNames(paneA())).toEqual(['FAULT_FLAGS']);
  });

  it('says a filter matched nothing rather than falling back to the whole Map', async () => {
    // An empty result that renders as the full list is how someone reads a value
    // off a register they never asked for.
    const user = userEvent.setup();
    renderPanes();
    await settle();

    await user.type(filterIn(paneA()), 'NO_SUCH_ENTRY');

    expect(rowNames(paneA())).toEqual([]);
    expect(within(paneA()).getByText(/no register matches/i)).toBeInTheDocument();
  });

  it('keeps two Panes independent in what they are filtered to', async () => {
    const user = userEvent.setup();
    renderPanes();
    await settle();

    await user.type(filterIn(paneA()), 'MOTOR');
    await user.type(filterIn(paneB()), 'COOLANT');

    expect(rowNames(paneA())).toEqual(['MOTOR_X_TARGET']);
    expect(rowNames(paneB())).toEqual(['COOLANT_TEMP']);
  });

  it('keeps two Panes independent in what each has selected', async () => {
    const user = userEvent.setup();
    renderPanes();
    await settle();

    await user.click(within(paneA()).getByText('SPINDLE_RPM'));
    await user.click(within(paneB()).getByText('COOLANT_TEMP'));

    const selectedInA = within(paneA()).getByRole('row', { selected: true });
    const selectedInB = within(paneB()).getByRole('row', { selected: true });

    // Selecting in the second Pane must not move the first Pane's highlight:
    // the point of two Panes is to hold two places at once.
    expect(selectedInA).toHaveTextContent('SPINDLE_RPM');
    expect(selectedInB).toHaveTextContent('COOLANT_TEMP');
  });

  it('names its tab after its filter, so two Panes are not an identical pair', async () => {
    const user = userEvent.setup();
    const { titleA, titleB } = renderPanes();
    await settle();

    expect(titleA).toHaveBeenLastCalledWith('Registers 1');
    expect(titleB).toHaveBeenLastCalledWith('Registers 2');

    await user.type(filterIn(paneA()), 'MOTOR');

    expect(titleA).toHaveBeenLastCalledWith('Registers 1 · MOTOR');
    expect(titleB).toHaveBeenLastCalledWith('Registers 2');
  });

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

  it('offers no way to read while there is no link, and says so', async () => {
    renderPanes();
    await settle();

    expect(within(paneA()).getByRole('button', { name: 'Read' })).toBeDisabled();
    expect(within(paneA()).getByRole('switch', { name: /live/i })).toBeDisabled();
    expect(within(paneA()).getByText(/connect from the chrome/i)).toBeInTheDocument();
  });

  it('says values have stopped being current once the link drops', async () => {
    // The failure this exists to prevent: a value that stopped updating read as
    // a current one. It is said in words, not by changing a colour.
    const user = userEvent.setup();
    const harness = renderPanes();
    await settle();
    await connect(harness);

    await user.click(within(paneA()).getByRole('button', { name: 'Read' }));
    expect(within(paneA()).getByRole('row', { name: /SPINDLE_RPM/ })).not.toHaveTextContent('—');

    await act(async () => {
      await harness.port.device.disconnect();
    });

    expect(within(paneA()).getByText(/nothing below is being updated/i)).toBeInTheDocument();
    expect(within(paneA()).getByRole('button', { name: 'Read' })).toBeDisabled();
  });

  it('shows a dash for an entry nobody has asked about yet', async () => {
    // Never read is not the same as read and found to be zero. A column of
    // zeroes for a Device nobody has questioned is a confident lie.
    renderPanes();
    await settle();

    expect(within(paneA()).getByRole('row', { name: /SPINDLE_RPM/ })).toHaveTextContent('—');
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

    await user.type(filterIn(paneA()), 'SPIN');
    await user.click(within(paneA()).getByText('SPINDLE_RPM'));
    expect(within(inspector()).getByText(/Registers 1 · SPIN/)).toBeInTheDocument();

    await user.clear(filterIn(paneA()));
    await user.type(filterIn(paneA()), 'SPINDLE_RPM');

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
