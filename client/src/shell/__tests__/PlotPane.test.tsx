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
import { floatToInt32 } from '../../utils/floatConversion';
import { InterfaceType } from '../../types/shared';
import type { PlotDataPoint } from '../../types/shared';
import type { MapProfile } from '../../types/settings';
import { retainPaneState } from '../paneState';
import { __resetPlotStreamForTests } from '../plotStream';
import { PlotPane } from '../panes/PlotPane';

/**
 * The Plot Pane, driven through the fake port.
 *
 * `uplot` is mocked at the module boundary rather than driven for real: it
 * draws to a canvas 2D context jsdom does not implement (there is no `canvas`
 * package in this project, matching the "added: the plotting engine" line in
 * the dependency list — nothing pulls in a native canvas backend just for
 * tests). What that leaves to verify by hand, in a real browser, is exactly
 * what the project's own testing policy already carves out for dock drag —
 * genuinely visual behaviour. Everything else — which series a Pane is
 * plotting, that a name is claimed by one Pane at a time, poll interval and
 * export — is ordinary container logic and is pinned here.
 */

/**
 * Every constructed `FakeUPlot`, in construction order — so a test can reach
 * the instance a Pane's chart is actually driving and inspect what `setData`
 * was called with, the same way `recordCommands` in `CommandPane.test.tsx`
 * reaches into a call the component made rather than only its visible result.
 */
const { chartInstances } = vi.hoisted(() => ({ chartInstances: [] as FakeUPlotInstance[] }));

interface FakeUPlotInstance {
  readonly setData: ReturnType<typeof vi.fn>;
  readonly setScale: ReturnType<typeof vi.fn>;
  readonly setSize: ReturnType<typeof vi.fn>;
  readonly destroy: ReturnType<typeof vi.fn>;
}

vi.mock('uplot', () => {
  class FakeUPlot {
    setData = vi.fn();
    setScale = vi.fn();
    setSize = vi.fn();
    destroy = vi.fn();
    constructor() {
      chartInstances.push(this as unknown as FakeUPlotInstance);
    }
    batch(fn: () => void): void {
      fn();
    }
    static join(tables: unknown[]): unknown {
      return tables[0] ?? [[]];
    }
  }
  return { default: FakeUPlot };
});

const REGISTERS_MAP = `
uint32_t  SPINDLE_RPM;
float     COOLANT_TEMP;
`;

const SYSTEM_REGISTERS_MAP = `
uint32_t  UPTIME_SECONDS;
`;

const PROFILE: MapProfile = {
  id: 'plot-test-board',
  name: 'Plot test board',
  isDefault: false,
  registersMap: REGISTERS_MAP,
  parametersMap: '',
  systemRegistersMap: SYSTEM_REGISTERS_MAP,
  createdAt: 0,
};

const PANE_A = 'plot#1';
const PANE_B = 'plot#2';

type FakePort = ReturnType<typeof createFakeBackendPort>;
type UserEvent = ReturnType<typeof userEvent.setup>;

interface Harness {
  readonly fake: FakePort;
  readonly port: BackendPort;
}

function renderPanes(port?: BackendPort): Harness & { titleA: ReturnType<typeof vi.fn>; titleB: ReturnType<typeof vi.fn> } {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  const usedPort = port ?? (fake as BackendPort);
  const titleA = vi.fn();
  const titleB = vi.fn();

  render(
    <BackendPortProvider port={usedPort}>
      <SettingsProvider>
        <DSHubProvider>
          <section aria-label="Pane A">
            <PlotPane paneId={PANE_A} setTitle={titleA} />
          </section>
          <section aria-label="Pane B">
            <PlotPane paneId={PANE_B} setTitle={titleB} />
          </section>
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );

  return { fake, port: usedPort, titleA, titleB };
}

const paneA = (): HTMLElement => screen.getByRole('region', { name: 'Pane A' });
const paneB = (): HTMLElement => screen.getByRole('region', { name: 'Pane B' });

/** Lets the provider's asynchronous listener registration finish. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

async function connect(fake: FakePort): Promise<void> {
  await act(async () => {
    await fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
  });
}

async function addSeriesViaPicker(user: UserEvent, pane: HTMLElement, name: string): Promise<void> {
  await user.click(within(pane).getByRole('button', { name: /add series/i }));
  const filter = await screen.findByRole('textbox', { name: /filter series to add/i });
  await user.clear(filter);
  await user.type(filter, name);
  await user.click(await screen.findByText(name));
  await user.keyboard('{Escape}');
}

/** Switches the picker's source to System Register, driven from the keyboard —
 *  jsdom implements no pointer capture, which is what Radix's select uses to
 *  track a press (see `RegisterPane.test.tsx` for the same reasoning). */
async function selectSystemRegisterSource(user: UserEvent, pane: HTMLElement): Promise<void> {
  await user.click(within(pane).getByRole('button', { name: /add series/i }));
  const combo = await screen.findByRole('combobox', { name: /series source/i });
  combo.focus();
  await user.keyboard('{Enter}');
  await screen.findByRole('listbox');
  await user.keyboard('{ArrowDown}{Enter}');
}

/**
 * Wraps a fake port so a test can hand `plotStream`'s single `plotData`
 * subscriber an exact point on demand, rather than waiting on the fake
 * Device's own simulated waveform or real elapsed time. `startPlotting` and
 * `stopPlotting` still reach the fake underneath, so what is *asked for* is
 * still pinned — only delivery is taken over.
 */
function withControlledPlotData(fake: FakePort): { port: BackendPort; emit: (seriesName: string, point: PlotDataPoint) => void } {
  let handler: ((payload: { seriesName: string; point: PlotDataPoint }) => void) | null = null;
  const port: BackendPort = {
    ...fake,
    events: {
      ...fake.events,
      on: async (event, listener) => {
        if (event !== 'plotData') return fake.events.on(event, listener);
        handler = listener as (payload: { seriesName: string; point: PlotDataPoint }) => void;
        return () => {
          handler = null;
        };
      },
    },
  };
  return { port, emit: (seriesName, point) => handler?.({ seriesName, point }) };
}

beforeEach(async () => {
  await mapManager.initialize(PROFILE);
});

afterEach(() => {
  cleanup();
  retainPaneState([]);
  __resetPlotStreamForTests();
  chartInstances.length = 0;
});

/** Lets one real 200 ms redraw tick (`PlotChart.tsx`'s own interval) run. */
async function waitForRedraw(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
  });
}

describe('adding and removing series', () => {
  it('adds a series from the picker, showing it in the legend and starting the Device stream', async () => {
    const user = userEvent.setup();
    const harness = renderPanes();
    await settle();
    await connect(harness.fake);
    const started = vi.spyOn(harness.fake.device, 'startPlotting');

    await addSeriesViaPicker(user, paneA(), 'SPINDLE_RPM');

    expect(within(paneA()).getByText('SPINDLE_RPM')).toBeInTheDocument();
    expect(started).toHaveBeenCalledWith('SPINDLE_RPM', 50, expect.any(Number));
  });

  it('adds a System Register through the source picker', async () => {
    const user = userEvent.setup();
    const harness = renderPanes();
    await settle();
    await connect(harness.fake);
    const started = vi.spyOn(harness.fake.device, 'startPlottingSysRegister');

    await selectSystemRegisterSource(user, paneA());
    const filter = await screen.findByRole('textbox', { name: /filter series to add/i });
    await user.type(filter, 'UPTIME_SECONDS');
    await user.click(await screen.findByText('UPTIME_SECONDS'));

    expect(started).toHaveBeenCalledWith('UPTIME_SECONDS', 50, expect.any(Number));
  });

  it('removes a series and stops the Device stream for it', async () => {
    const user = userEvent.setup();
    const harness = renderPanes();
    await settle();
    await connect(harness.fake);
    const stopped = vi.spyOn(harness.fake.device, 'stopPlotting');
    await addSeriesViaPicker(user, paneA(), 'SPINDLE_RPM');

    await user.click(within(paneA()).getByRole('button', { name: /remove spindle_rpm/i }));

    expect(within(paneA()).queryByText('SPINDLE_RPM')).not.toBeInTheDocument();
    expect(stopped).toHaveBeenCalledWith('SPINDLE_RPM');
  });

  it('toggles a series’ visibility without removing it', async () => {
    const user = userEvent.setup();
    const harness = renderPanes();
    await settle();
    await connect(harness.fake);
    await addSeriesViaPicker(user, paneA(), 'SPINDLE_RPM');

    const swatch = within(paneA()).getByRole('button', { name: /hide spindle_rpm/i });
    await user.click(swatch);

    expect(within(paneA()).getByRole('button', { name: /show spindle_rpm/i })).toBeInTheDocument();
    expect(within(paneA()).getByText('SPINDLE_RPM')).toBeInTheDocument();
  });

  it('shows an empty-state notice until a series is added', async () => {
    renderPanes();
    await settle();

    expect(within(paneA()).getByText(/add a series above/i)).toBeInTheDocument();
  });
});

describe('exclusive ownership across Plot Panes', () => {
  it('refuses a series another open Plot Pane is already plotting', async () => {
    const user = userEvent.setup();
    const harness = renderPanes();
    await settle();
    await connect(harness.fake);
    await addSeriesViaPicker(user, paneA(), 'SPINDLE_RPM');

    await user.click(within(paneB()).getByRole('button', { name: /add series/i }));
    const filter = await screen.findByRole('textbox', { name: /filter series to add/i });
    await user.type(filter, 'SPINDLE_RPM');
    // Scoped to the picker's own table: Pane A's legend already shows this
    // same name, so an unscoped query would be ambiguous between the two.
    const table = await screen.findByRole('table');
    await user.click(within(table).getByText('SPINDLE_RPM'));

    expect(screen.getByRole('alert')).toHaveTextContent(/already being plotted in another open Plot Pane/i);
    expect(within(paneB()).queryByText('SPINDLE_RPM')).not.toBeInTheDocument();
  });

  it('keeps two Plot Panes’ series independent once each has claimed a different one', async () => {
    const user = userEvent.setup();
    const harness = renderPanes();
    await settle();
    await connect(harness.fake);

    await addSeriesViaPicker(user, paneA(), 'SPINDLE_RPM');
    await addSeriesViaPicker(user, paneB(), 'COOLANT_TEMP');

    expect(within(paneA()).getByText('SPINDLE_RPM')).toBeInTheDocument();
    expect(within(paneA()).queryByText('COOLANT_TEMP')).not.toBeInTheDocument();
    expect(within(paneB()).getByText('COOLANT_TEMP')).toBeInTheDocument();
    expect(within(paneB()).queryByText('SPINDLE_RPM')).not.toBeInTheDocument();
  });
});

describe('poll interval and time span', () => {
  it('restarts an active series at a newly committed poll interval', async () => {
    const user = userEvent.setup();
    const harness = renderPanes();
    await settle();
    await connect(harness.fake);
    await addSeriesViaPicker(user, paneA(), 'SPINDLE_RPM');
    const started = vi.spyOn(harness.fake.device, 'startPlotting');

    const field = within(paneA()).getByRole('textbox', { name: /poll interval/i });
    await user.clear(field);
    await user.type(field, '200{Enter}');

    expect(started).toHaveBeenLastCalledWith('SPINDLE_RPM', 200, expect.any(Number));
  });
});

describe('connection state', () => {
  it('says plotting is unavailable before connecting', async () => {
    renderPanes();
    await settle();

    expect(within(paneA()).getByText(/connect from the chrome above/i)).toBeInTheDocument();
  });

  it('says nothing is being plotted once the link drops', async () => {
    const user = userEvent.setup();
    const harness = renderPanes();
    await settle();
    await connect(harness.fake);
    await addSeriesViaPicker(user, paneA(), 'SPINDLE_RPM');

    await act(async () => {
      await harness.fake.device.disconnect();
    });

    expect(within(paneA()).getByText(/disconnected\. nothing is being plotted/i)).toBeInTheDocument();
  });
});

describe('export', () => {
  it('exports a float series decoded to its real value, not the raw wire word', async () => {
    const user = userEvent.setup();
    const fake = createFakeBackendPort({ deliver: fn => fn() });
    const { port, emit } = withControlledPlotData(fake);
    const saveCsv = vi.fn().mockResolvedValue(true);
    const portWithRecordedSave: BackendPort = { ...port, files: { ...port.files, saveCsv } };

    render(
      <BackendPortProvider port={portWithRecordedSave}>
        <SettingsProvider>
          <DSHubProvider>
            <PlotPane paneId={PANE_A} setTitle={vi.fn()} />
          </DSHubProvider>
        </SettingsProvider>
      </BackendPortProvider>
    );
    await settle();
    await connect(fake);

    await user.click(screen.getByRole('button', { name: /add series/i }));
    const filter = await screen.findByRole('textbox', { name: /filter series to add/i });
    await user.type(filter, 'COOLANT_TEMP');
    await user.click(await screen.findByText('COOLANT_TEMP'));
    await user.keyboard('{Escape}');

    emit('COOLANT_TEMP', { x: 1_700_000_000, y: floatToInt32(41.5) });

    await user.click(screen.getByRole('button', { name: /export/i }));

    expect(saveCsv).toHaveBeenCalledTimes(1);
    const [csv] = saveCsv.mock.calls[0];
    expect(csv).toContain(',41.5');
  });
});

describe('value decoding on the chart', () => {
  /**
   * Pins a bug from the first cut of this Pane: `plotStream` deliberately
   * retains exactly the raw wire word the Device sends — it has no notion of
   * a Map or a type — and only the CSV export path decoded it before this
   * test existed. The live chart fed that raw word straight to uPlot, so a
   * float register's IEEE-754 bit pattern was plotted as an enormous integer
   * rather than the reading it represents. `getPlotValue` has to run on the
   * chart's own read path, not only on export's.
   */
  it('feeds the chart a decoded float reading, not the raw wire word', async () => {
    const user = userEvent.setup();
    const fake = createFakeBackendPort({ deliver: fn => fn() });
    const { port, emit } = withControlledPlotData(fake);

    render(
      <BackendPortProvider port={port}>
        <SettingsProvider>
          <DSHubProvider>
            <PlotPane paneId={PANE_A} setTitle={vi.fn()} />
          </DSHubProvider>
        </SettingsProvider>
      </BackendPortProvider>
    );
    await settle();
    await connect(fake);

    await user.click(screen.getByRole('button', { name: /add series/i }));
    const filter = await screen.findByRole('textbox', { name: /filter series to add/i });
    await user.type(filter, 'COOLANT_TEMP');
    await user.click(await screen.findByText('COOLANT_TEMP'));
    await user.keyboard('{Escape}');

    const chart = chartInstances.at(-1);
    if (!chart) throw new Error('PlotChart did not construct a chart instance');

    const rawWireWord = floatToInt32(41.5);
    emit('COOLANT_TEMP', { x: 1_700_000_000, y: rawWireWord });
    await waitForRedraw();

    expect(chart.setData).toHaveBeenCalled();
    const [, ys] = chart.setData.mock.calls.at(-1)?.[0] as [number[], number[]];
    expect(ys).toContain(41.5);
    expect(ys).not.toContain(rawWireWord);
  });
});
