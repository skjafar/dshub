// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { DSHubProvider } from '../../contexts/DSHubContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { mapManager } from '../../maps/mapManager';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import { InterfaceType } from '../../types/shared';
import type { MapProfile } from '../../types/settings';
import { SelectionProvider } from '../SelectionContext';
import type { AddressSpace } from '../addressSpace';
import { retainPaneState } from '../paneState';
import { announceMapEdited } from '../useMapEntries';
import { InspectorPane } from '../panes/InspectorPane';
import { ParameterPane } from '../panes/ParameterPane';
import { RegisterPane } from '../panes/RegisterPane';
import { SystemRegisterPane } from '../panes/SystemRegisterPane';
import type { PaneProps } from '../paneRegistry';
import { recordSubscriptions } from './subscriptionRecorder';
import { recordWrites } from './writeRecorder';
import type { RecordedWrite } from './writeRecorder';

/**
 * The three Address Space Panes, driven through the fake port.
 *
 * Two things are under test and they pull in opposite directions. The three
 * Panes must behave alike wherever the space makes no difference — filtering,
 * selection, empty and disconnected states, and two instances staying
 * independent — which is why those cases are one table run three times rather
 * than three suites that could drift. And they must differ visibly wherever the
 * space *does* make a difference, which is what the per-space suites below pin:
 * a Parameter is written the same way a Register is, a System Register cannot be
 * written at all, and no Pane leaves an Engineer guessing which space a bare
 * address belongs to.
 */

/** Three Maps with no name in common, so listing the wrong space is visible. */
const REGISTERS_MAP = `
// Read only
uint32_t  SPINDLE_RPM;
float     COOLANT_TEMP;
// Read/Write
int32_t   MOTOR_X_TARGET;
`;

const PARAMETERS_MAP = `
uint32_t  ACCEL_LIMIT;
float     AXIS_X_KP;
int32_t   HOME_OFFSET;
`;

/** Addresses match the protocol's own: Control lives at System Register 2. */
const SYSTEM_REGISTERS_MAP = `
uint32_t  PROTOCOL_VERSION;
uint32_t  BOARD_TYPE;
uint32_t  CONTROL_INTERFACE;
uint32_t  UPTIME_SECONDS;
`;

const PROFILE: MapProfile = {
  id: 'space-test-board',
  name: 'Space test board',
  isDefault: false,
  registersMap: REGISTERS_MAP,
  parametersMap: PARAMETERS_MAP,
  systemRegistersMap: SYSTEM_REGISTERS_MAP,
  createdAt: 0,
};

/** What each space's Pane is called, filtered by, and lists. */
interface SpaceCase {
  readonly space: AddressSpace;
  readonly Pane: (props: PaneProps) => React.JSX.Element;
  /** The Pane kind's panel-id prefix, so two instances get distinct ids. */
  readonly kind: string;
  /** The heading the Pane names its own space with. */
  readonly heading: string;
  /** The Pane's filter, by its accessible name. */
  readonly filterLabel: RegExp;
  readonly entryNames: readonly string[];
  /** An entry whose name is worth filtering to, and a fragment matching it. */
  readonly filterTo: { readonly fragment: string; readonly name: string };
  /** An entry and the address the parser gives it. */
  readonly atAddress: { readonly address: number; readonly name: string };
}

const CASES: readonly SpaceCase[] = [
  {
    space: 'register',
    Pane: RegisterPane,
    kind: 'register',
    heading: 'Registers',
    filterLabel: /filter registers/i,
    entryNames: ['SPINDLE_RPM', 'COOLANT_TEMP', 'MOTOR_X_TARGET'],
    filterTo: { fragment: 'motor', name: 'MOTOR_X_TARGET' },
    atAddress: { address: 1, name: 'COOLANT_TEMP' },
  },
  {
    space: 'parameter',
    Pane: ParameterPane,
    kind: 'parameter',
    heading: 'Parameters',
    filterLabel: /filter parameters/i,
    entryNames: ['ACCEL_LIMIT', 'AXIS_X_KP', 'HOME_OFFSET'],
    filterTo: { fragment: 'accel', name: 'ACCEL_LIMIT' },
    atAddress: { address: 2, name: 'HOME_OFFSET' },
  },
  {
    space: 'sysRegister',
    Pane: SystemRegisterPane,
    kind: 'sysRegister',
    heading: 'System Registers',
    filterLabel: /filter system registers/i,
    entryNames: ['PROTOCOL_VERSION', 'BOARD_TYPE', 'CONTROL_INTERFACE', 'UPTIME_SECONDS'],
    filterTo: { fragment: 'uptime', name: 'UPTIME_SECONDS' },
    atAddress: { address: 1, name: 'BOARD_TYPE' },
  },
];

interface Harness {
  readonly fake: ReturnType<typeof createFakeBackendPort>;
  readonly titleA: ReturnType<typeof vi.fn>;
  readonly titleB: ReturnType<typeof vi.fn>;
  /** Every write that reached the port, whichever space it was aimed at. */
  readonly writes: readonly RecordedWrite[];
}

/** Two Panes of one kind, plus the shared Inspector. */
function renderPanes(testCase: SpaceCase): Harness {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  const { port, writes } = recordWrites(fake);
  const titleA = vi.fn();
  const titleB = vi.fn();

  const Pane = testCase.Pane;

  render(
    <BackendPortProvider port={port}>
      <SettingsProvider>
        <DSHubProvider>
          <SelectionProvider>
            {/* Labelled so each Pane's own filter, table and selection can be
                queried apart from its twin's. */}
            <section aria-label="Pane A">
              <Pane paneId={`${testCase.kind}#1`} setTitle={titleA} />
            </section>
            <section aria-label="Pane B">
              <Pane paneId={`${testCase.kind}#2`} setTitle={titleB} />
            </section>
            <section aria-label="Inspector pane">
              <InspectorPane paneId="inspector" setTitle={vi.fn()} />
            </section>
          </SelectionProvider>
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );

  return { fake, titleA, titleB, writes };
}

const paneA = (): HTMLElement => screen.getByRole('region', { name: 'Pane A' });
const paneB = (): HTMLElement => screen.getByRole('region', { name: 'Pane B' });
const inspector = (): HTMLElement => screen.getByRole('region', { name: 'Inspector pane' });

const filterIn = (pane: HTMLElement, label: RegExp): HTMLElement =>
  within(pane).getByRole('textbox', { name: label });

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
    await harness.fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
  });
}

/** Connects and claims Control, which writing requires. */
async function readyToWrite(harness: Harness): Promise<void> {
  await connect(harness);
  await act(async () => {
    await harness.fake.device.takeControl();
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

describe.each(CASES)('$heading Pane', testCase => {
  it('lists its own space, and only its own', async () => {
    renderPanes(testCase);
    await settle();

    expect(rowNames(paneA())).toEqual([...testCase.entryNames]);
  });

  it('names its Address Space in the Pane itself', async () => {
    // Two Panes docked side by side show two columns of bare addresses, and the
    // same address means something different in each space. The tab is not
    // enough: it truncates, and the Pane beside it may be the one being read.
    renderPanes(testCase);
    await settle();

    expect(within(paneA()).getByRole('heading', { name: testCase.heading })).toBeInTheDocument();
  });

  it('filters by name, whatever case it was typed in', async () => {
    const user = userEvent.setup();
    renderPanes(testCase);
    await settle();

    await user.type(filterIn(paneA(), testCase.filterLabel), testCase.filterTo.fragment);

    expect(rowNames(paneA())).toEqual([testCase.filterTo.name]);
  });

  it('filters by address, in decimal and in hexadecimal', async () => {
    const user = userEvent.setup();
    renderPanes(testCase);
    await settle();
    const filter = (): HTMLElement => filterIn(paneA(), testCase.filterLabel);

    await user.type(filter(), String(testCase.atAddress.address));
    expect(rowNames(paneA())).toEqual([testCase.atAddress.name]);

    await user.clear(filter());
    await user.type(filter(), `0x${testCase.atAddress.address.toString(16)}`);
    expect(rowNames(paneA())).toEqual([testCase.atAddress.name]);
  });

  it('says a filter matched nothing rather than falling back to the whole Map', async () => {
    // An empty result that renders as the full list is how someone reads a value
    // off an entry they never asked for.
    const user = userEvent.setup();
    renderPanes(testCase);
    await settle();

    await user.type(filterIn(paneA(), testCase.filterLabel), 'NO_SUCH_ENTRY');

    expect(rowNames(paneA())).toEqual([]);
    expect(within(paneA()).getByText(/matches “NO_SUCH_ENTRY”/)).toBeInTheDocument();
  });

  it('keeps two Panes independent in what they are filtered to', async () => {
    const user = userEvent.setup();
    renderPanes(testCase);
    await settle();

    await user.type(filterIn(paneA(), testCase.filterLabel), testCase.filterTo.fragment);

    expect(rowNames(paneA())).toEqual([testCase.filterTo.name]);
    expect(rowNames(paneB())).toEqual([...testCase.entryNames]);
  });

  it('keeps two Panes independent in what each has selected', async () => {
    const user = userEvent.setup();
    renderPanes(testCase);
    await settle();

    const [first, second] = testCase.entryNames;
    await user.click(within(paneA()).getByText(first));
    await user.click(within(paneB()).getByText(second));

    // Selecting in the second Pane must not move the first Pane's highlight:
    // the point of two Panes is to hold two places at once.
    expect(within(paneA()).getByRole('row', { selected: true })).toHaveTextContent(first);
    expect(within(paneB()).getByRole('row', { selected: true })).toHaveTextContent(second);
  });

  it('names its tab after its space and its filter, so two Panes are not an identical pair', async () => {
    const user = userEvent.setup();
    const { titleA, titleB } = renderPanes(testCase);
    await settle();

    expect(titleA).toHaveBeenLastCalledWith(`${testCase.heading} 1`);
    expect(titleB).toHaveBeenLastCalledWith(`${testCase.heading} 2`);

    await user.type(filterIn(paneA(), testCase.filterLabel), testCase.filterTo.fragment);

    expect(titleA).toHaveBeenLastCalledWith(
      `${testCase.heading} 1 · ${testCase.filterTo.fragment}`
    );
    expect(titleB).toHaveBeenLastCalledWith(`${testCase.heading} 2`);
  });

  it('offers no way to read while there is no link, and says so', async () => {
    renderPanes(testCase);
    await settle();

    expect(within(paneA()).getByRole('button', { name: 'Read' })).toBeDisabled();
    expect(within(paneA()).getByRole('switch', { name: /live/i })).toBeDisabled();
    expect(within(paneA()).getByText(/connect from the chrome/i)).toBeInTheDocument();
  });

  it('shows a dash for an entry nobody has asked about yet', async () => {
    // Never read is not the same as read and found to be zero. A column of
    // zeroes for a Device nobody has questioned is a confident lie.
    renderPanes(testCase);
    await settle();

    const row = within(paneA()).getByRole('row', { name: new RegExp(testCase.entryNames[0]) });
    expect(row).toHaveTextContent('—');
  });

  it('says values have stopped being current once the link drops', async () => {
    // The failure this exists to prevent: a value that stopped updating read as
    // a current one. It is said in words, not by changing a colour.
    const user = userEvent.setup();
    const harness = renderPanes(testCase);
    await settle();
    await connect(harness);

    await user.click(within(paneA()).getByRole('button', { name: 'Read' }));
    const row = (): HTMLElement =>
      within(paneA()).getByRole('row', { name: new RegExp(testCase.entryNames[0]) });
    expect(row()).not.toHaveTextContent('—');

    await act(async () => {
      await harness.fake.device.disconnect();
    });

    expect(within(paneA()).getByText(/nothing below is being updated/i)).toBeInTheDocument();
    expect(within(paneA()).getByRole('button', { name: 'Read' })).toBeDisabled();
  });

  it('tells the Inspector which space the selection came from', async () => {
    // An address on its own identifies nothing — the same number exists in all
    // three spaces and means something different in each.
    const user = userEvent.setup();
    renderPanes(testCase);
    await settle();

    await user.click(within(paneA()).getByText(testCase.entryNames[0]));

    expect(within(inspector()).getByRole('heading', { level: 2 })).toHaveTextContent(
      testCase.entryNames[0]
    );
    const identity = within(inspector()).getByRole('region', { name: /identity/i });
    expect(identity).toHaveTextContent(testCase.heading.replace(/s$/, ''));
  });
});

/**
 * `.scratch/rust-owned-polling` issue 04: a Pane's own "Live" toggle is the
 * Registers/Parameters panel's bulk auto-refresh — it declares interest in
 * every row the filter currently leaves visible, through the same per-address
 * subscription mechanism (`subscribeAddress`/`unsubscribeAddress`) an
 * individually-bound widget uses via `usePolledTargets`. Pinned once, against
 * the Register space: the mechanism does not know which space it is serving,
 * so a second copy of this against Parameters or System Registers would only
 * prove the per-space wiring the suite above already covers.
 */
describe('bulk "Live" refresh', () => {
  const REGISTERS = CASES[0];

  function renderOnePane(port: ReturnType<typeof recordSubscriptions>['port']) {
    const titleA = vi.fn();
    render(
      <BackendPortProvider port={port}>
        <SettingsProvider>
          <DSHubProvider>
            <SelectionProvider>
              <section aria-label="Pane A">
                <RegisterPane paneId="register#live" setTitle={titleA} />
              </section>
            </SelectionProvider>
          </DSHubProvider>
        </SettingsProvider>
      </BackendPortProvider>
    );
  }

  it('subscribes every visible row when turned on, and releases every one when turned off', async () => {
    const user = userEvent.setup();
    const fake = createFakeBackendPort({ deliver: fn => fn() });
    const { port, subscriptions, unsubscribedIds } = recordSubscriptions(fake);
    renderOnePane(port);
    await settle();
    await act(async () => {
      await fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });

    await user.click(within(paneA()).getByRole('switch', { name: /live/i }));
    await settle();

    expect(subscriptions.map(s => s.name).sort()).toEqual([...REGISTERS.entryNames].sort());
    expect(unsubscribedIds).toEqual([]);

    await user.click(within(paneA()).getByRole('switch', { name: /live/i }));
    await settle();

    expect(unsubscribedIds.length).toBe(subscriptions.length);
  });

  it('drops a filtered-out row and keeps subscribing what the filter still matches', async () => {
    const user = userEvent.setup();
    const fake = createFakeBackendPort({ deliver: fn => fn() });
    const { port, subscriptions, unsubscribedIds } = recordSubscriptions(fake);
    renderOnePane(port);
    await settle();
    await act(async () => {
      await fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });

    await user.click(within(paneA()).getByRole('switch', { name: /live/i }));
    await settle();
    const subscribedBeforeFilter = subscriptions.length;
    expect(subscribedBeforeFilter).toBe(REGISTERS.entryNames.length);

    await user.type(filterIn(paneA(), REGISTERS.filterLabel), REGISTERS.filterTo.fragment);
    await settle();

    // Narrowing the filter changes the whole target set the Pane hands the
    // shared subscription hook, so every previous subscription is released...
    expect(unsubscribedIds.length).toBe(subscribedBeforeFilter);
    // ...and what is subscribed afterwards is exactly the one row that still
    // matches, not the two the filter dropped.
    const afterFilter = subscriptions.slice(subscribedBeforeFilter);
    expect(afterFilter.map(s => s.name)).toEqual([REGISTERS.filterTo.name]);
  });

  it('drops every subscription when the Map underneath a live Pane changes, and subscribes to what replaces it', async () => {
    // A Profile switch and a Map Editor save both replace the active Profile's
    // Map through the same path — `mapManager.initialize` plus the `announce()`
    // that tells a mounted Pane to re-read it (`useMapEntries.ts`). Driving a
    // real Profile switch here would mean rendering the Profiles dialog just to
    // reach the same signal this already exercises directly.
    const user = userEvent.setup();
    const fake = createFakeBackendPort({ deliver: fn => fn() });
    const { port, subscriptions, unsubscribedIds } = recordSubscriptions(fake);
    renderOnePane(port);
    await settle();
    await act(async () => {
      await fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });

    await user.click(within(paneA()).getByRole('switch', { name: /live/i }));
    await settle();
    const subscribedBeforeSwitch = subscriptions.length;
    expect(subscribedBeforeSwitch).toBe(REGISTERS.entryNames.length);

    await act(async () => {
      announceMapEdited({ ...PROFILE, id: 'space-test-board-v2', registersMap: 'uint32_t RPM_NEW;\n' });
    });
    await settle();

    // Every row from the old Map is released...
    expect(unsubscribedIds.length).toBe(subscribedBeforeSwitch);
    // ...and only the new Map's one row is subscribed in its place.
    const afterSwitch = subscriptions.slice(subscribedBeforeSwitch);
    expect(afterSwitch.map(s => s.name)).toEqual(['RPM_NEW']);
  });
});

describe('Parameter Pane', () => {
  const PARAMETERS = CASES[1];

  it('writes a Parameter through the Parameter path, not the Register one', async () => {
    // Address 0 exists in all three spaces. A Parameter write that went out as a
    // Register write would land on a different word of firmware entirely, and
    // both would report success.
    const user = userEvent.setup();
    const harness = renderPanes(PARAMETERS);
    await settle();
    await readyToWrite(harness);

    await user.click(within(paneA()).getByText('ACCEL_LIMIT'));
    const field = within(paneA()).getByRole('textbox', { name: 'New value for ACCEL_LIMIT' });
    await user.clear(field);
    await user.type(field, '4242{Enter}');

    expect(harness.writes).toEqual([{ space: 'parameter', address: 0, value: 4242 }]);
  });

  it('reports a Parameter write the Device refused rather than reporting success', async () => {
    // The backend resolves a write as soon as it is queued, so a Pane that
    // treated the resolved command as success would report every refusal as a
    // completed write — with the Device holding a different value than the
    // screen says.
    const user = userEvent.setup();
    const harness = renderPanes(PARAMETERS);
    await settle();
    await readyToWrite(harness);
    harness.fake.faults.refuseWrites(true);

    await user.click(within(paneA()).getByText('HOME_OFFSET'));
    const field = within(paneA()).getByRole('textbox', { name: 'New value for HOME_OFFSET' });
    await user.clear(field);
    await user.type(field, '-25{Enter}');
    await settle();

    expect(within(paneA()).getByRole('alert')).toHaveTextContent(/refused the write/i);
  });
});

describe('System Register Pane', () => {
  const SYSTEM = CASES[2];

  it('offers no write affordance for any entry, whatever the Map claims', async () => {
    // The absence is the point, not an oversight. A System Register map parses
    // with no read-only boundary, so every entry in it claims read/write — while
    // the protocol permits no write to the space at all. The space's rule wins.
    const user = userEvent.setup();
    const harness = renderPanes(SYSTEM);
    await settle();
    await readyToWrite(harness);

    for (const name of SYSTEM.entryNames) {
      await user.click(within(paneA()).getByText(name));

      expect(within(paneA()).queryByRole('textbox', { name: /new value/i })).not.toBeInTheDocument();
      expect(within(paneA()).queryByRole('button', { name: /^send$/i })).not.toBeInTheDocument();
    }

    expect(harness.writes).toEqual([]);
  });

  it('reports every entry as read-only rather than repeating the Map’s claim', async () => {
    const user = userEvent.setup();
    renderPanes(SYSTEM);
    await settle();

    for (const name of SYSTEM.entryNames) {
      expect(within(paneA()).getByRole('row', { name: new RegExp(name) })).toHaveTextContent(
        'read-only'
      );
    }

    await user.click(within(paneA()).getByText('BOARD_TYPE'));
    expect(within(inspector()).getByRole('region', { name: /identity/i })).toHaveTextContent(
      'read-only'
    );
  });

  it('says why the space cannot be written, so the absence reads as deliberate', async () => {
    // Scoped past the Access column, which says "read-only" about every row: the
    // claim under test is the standing one about the space itself.
    renderPanes(SYSTEM);
    await settle();

    expect(
      within(paneA()).getByText(/defined by the protocol library rather than by firmware/i)
    ).toBeInTheDocument();
    expect(within(paneA()).getByText(/refuses writes/i)).toBeInTheDocument();
  });
});

describe('a Profile whose Map declares nothing in a space', () => {
  const EMPTY_PROFILE: MapProfile = {
    ...PROFILE,
    id: 'empty-space-board',
    parametersMap: '',
    systemRegistersMap: '',
  };

  beforeEach(async () => {
    await mapManager.initialize(EMPTY_PROFILE);
  });

  it.each([
    [CASES[1], /declares no Parameters/i],
    [CASES[2], /declares no System Registers/i],
  ])('says so in that space’s own words', async (testCase, message) => {
    // "No entries" said the same way for every space sends someone hunting for a
    // device fault when the answer is that this Profile never declared any.
    renderPanes(testCase);
    await settle();

    expect(within(paneA()).getByText(message)).toBeInTheDocument();
    expect(within(paneA()).queryByRole('table')).not.toBeInTheDocument();
  });
});
