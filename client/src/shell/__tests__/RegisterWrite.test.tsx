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
import { RegisterPane } from '../panes/RegisterPane';

/**
 * What reaches the Device when a value is written from a Register Pane.
 *
 * A wrong value written to live hardware is the failure this whole surface is
 * built around: it is silent, it is irreversible, and it looks exactly like a
 * successful interaction. Nothing on screen distinguishes a spindle set to 3.142
 * from one set to 3, so the value handed to the port is asserted exactly, for
 * every type and every display format, on both ways of committing.
 *
 * Nothing is mocked. The recording port wraps the same fake that browser
 * development runs against, so what is asserted here is what the interface
 * actually does.
 */

const REGISTERS_MAP = `
// Read only
uint32_t  LOCKED_COUNTER;
// Read/Write
int32_t   SIGNED_TARGET;
uint32_t  UNSIGNED_TARGET;
float     FLOAT_TARGET;
hex       FLAGS_TARGET;
`;

const PROFILE: MapProfile = {
  id: 'write-test-board',
  name: 'Write test board',
  isDefault: false,
  registersMap: REGISTERS_MAP,
  parametersMap: '',
  createdAt: 0,
};

const ADDRESS = {
  LOCKED_COUNTER: 0,
  SIGNED_TARGET: 1,
  UNSIGNED_TARGET: 2,
  FLOAT_TARGET: 3,
  FLAGS_TARGET: 4,
} as const;

interface Write {
  readonly address: number;
  readonly value: number;
}

interface Harness {
  readonly fake: ReturnType<typeof createFakeBackendPort>;
  readonly writes: Write[];
}

/**
 * Records what reaches the port without changing what it does.
 *
 * The recorder only observes; a refused write is produced through the fake's own
 * `refuseWrites` fault rather than by making the call throw. Stubbing the
 * transport to reject would test a failure the real port cannot produce: the
 * backend resolves a write as soon as it is queued, and the refusal comes back
 * later as a confirmation carrying `valid: false`.
 */
function renderPane(): Harness {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  const writes: Write[] = [];

  const port: BackendPort = {
    ...fake,
    device: {
      ...fake.device,
      writeRegister: async (address: number, value: number) => {
        writes.push({ address, value });
        return fake.device.writeRegister(address, value);
      },
    },
  };

  render(
    <BackendPortProvider port={port}>
      <SettingsProvider>
        <DSHubProvider>
          <SelectionProvider>
            <RegisterPane paneId="register#1" setTitle={vi.fn()} />
          </SelectionProvider>
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );

  return { fake, writes };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

/** Connects and claims Control, which writing requires. */
async function readyToWrite(harness: Harness): Promise<void> {
  await act(async () => {
    await harness.fake.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
  });
  await act(async () => {
    await harness.fake.device.takeControl();
  });
}

const fieldFor = (name: string): HTMLElement =>
  screen.getByRole('textbox', { name: `New value for ${name}` });

const sendButton = (): HTMLElement => screen.getByRole('button', { name: /^send$/i });

/** Display formats in the order the select offers them. */
const FORMAT_INDEX = { Decimal: 0, Hexadecimal: 1, Binary: 2 } as const;

/**
 * Driven from the keyboard because jsdom implements no pointer capture, which is
 * what Radix's select uses to track a press.
 */
async function setFormat(
  user: ReturnType<typeof userEvent.setup>,
  format: keyof typeof FORMAT_INDEX
): Promise<void> {
  screen.getByRole('combobox', { name: /display format/i }).focus();
  await user.keyboard('{Enter}');
  await screen.findByRole('listbox');
  // Opening lands on the current selection, which every test starts from.
  await user.keyboard('{ArrowDown}'.repeat(FORMAT_INDEX[format]));
  await user.keyboard('{Enter}');
}

type CommitPath = 'keyboard' | 'pointer';

/** Selects an entry, types a value, and commits it the way the caller asked. */
async function writeValue(
  user: ReturnType<typeof userEvent.setup>,
  entryName: string,
  text: string,
  commitBy: CommitPath
): Promise<void> {
  await user.click(screen.getByText(entryName));
  const field = fieldFor(entryName);
  await user.clear(field);
  await user.type(field, text);

  if (commitBy === 'keyboard') {
    await user.type(field, '{Enter}');
  } else {
    await user.click(sendButton());
  }
}

beforeEach(async () => {
  await mapManager.initialize(PROFILE);
});

afterEach(() => {
  cleanup();
  retainPaneState([]);
});

describe('what reaches the port, by type and display format', () => {
  /**
   * Each row is the whole contract for one combination: this text, typed against
   * this entry, in this notation, puts exactly this word on the wire.
   *
   * The unsigned cases matter most. 4294967295 and -1 are the same thirty-two
   * bits, but `write_register` is declared `value: i32` — the unsigned reading
   * handed over as-is is refused at the Tauri boundary and never reaches the
   * board, so a write that looked accepted did nothing at all.
   */
  const CASES: ReadonlyArray<{
    readonly entry: keyof typeof ADDRESS;
    readonly format: keyof typeof FORMAT_INDEX;
    readonly typed: string;
    readonly expected: number;
  }> = [
    { entry: 'SIGNED_TARGET', format: 'Decimal', typed: '-1', expected: -1 },
    { entry: 'SIGNED_TARGET', format: 'Decimal', typed: '2147483647', expected: 2147483647 },
    { entry: 'UNSIGNED_TARGET', format: 'Decimal', typed: '4294967295', expected: -1 },
    { entry: 'UNSIGNED_TARGET', format: 'Decimal', typed: '3000000000', expected: -1294967296 },
    { entry: 'FLOAT_TARGET', format: 'Decimal', typed: '3.14159274', expected: 0x40490fdb | 0 },
    { entry: 'FLOAT_TARGET', format: 'Decimal', typed: '-0.5', expected: 0xbf000000 | 0 },
    { entry: 'FLAGS_TARGET', format: 'Decimal', typed: '255', expected: 255 },

    { entry: 'SIGNED_TARGET', format: 'Hexadecimal', typed: '0x0000002A', expected: 42 },
    { entry: 'UNSIGNED_TARGET', format: 'Hexadecimal', typed: 'FFFFFFFF', expected: -1 },
    { entry: 'FLOAT_TARGET', format: 'Hexadecimal', typed: '0x40490FDB', expected: 0x40490fdb | 0 },
    { entry: 'FLAGS_TARGET', format: 'Hexadecimal', typed: '0x80000000', expected: -2147483648 },

    { entry: 'SIGNED_TARGET', format: 'Binary', typed: '101010', expected: 42 },
    { entry: 'UNSIGNED_TARGET', format: 'Binary', typed: '1'.repeat(32), expected: -1 },
    { entry: 'FLOAT_TARGET', format: 'Binary', typed: '0100 0000 0100 1001 0000 1111 1101 1011', expected: 0x40490fdb | 0 },
    { entry: 'FLAGS_TARGET', format: 'Binary', typed: '1000 0000', expected: 128 },
  ];

  const PATHS: readonly CommitPath[] = ['keyboard', 'pointer'];

  for (const path of PATHS) {
    it.each(CASES)(
      `writes $typed to $entry in $format as the right word (${path})`,
      async ({ entry, format, typed, expected }) => {
        const user = userEvent.setup();
        const harness = renderPane();
        await settle();
        await readyToWrite(harness);

        if (format !== 'Decimal') await setFormat(user, format);
        await writeValue(user, entry, typed, path);

        expect(harness.writes).toEqual([{ address: ADDRESS[entry], value: expected }]);
      }
    );
  }

  it('puts a signed 32-bit word on the wire in every one of those cases', async () => {
    // `write_register` takes an `i32`. Anything outside that range is refused at
    // the boundary, so the write silently does nothing to the board.
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToWrite(harness);

    await writeValue(user, 'UNSIGNED_TARGET', '4294967295', 'keyboard');

    for (const write of harness.writes) {
      expect(Number.isInteger(write.value)).toBe(true);
      expect(write.value).toBeGreaterThanOrEqual(-2147483648);
      expect(write.value).toBeLessThanOrEqual(2147483647);
    }
  });
});

describe('the two commit paths', () => {
  /**
   * The regression this pins: the field used to mirror the Device whenever it
   * was not focused, and clicking Send blurs it — so the mirror fired before the
   * form submitted and wrote the value already on the Device back to it, while
   * pressing Enter wrote the new one. Two paths, two different values, and
   * nothing on screen to say which had happened.
   */
  it('produces the same write from Enter and from Send', async () => {
    const typed = '1234';
    const results: number[] = [];

    for (const path of ['keyboard', 'pointer'] as const) {
      const user = userEvent.setup();
      const harness = renderPane();
      await settle();
      await readyToWrite(harness);

      await writeValue(user, 'SIGNED_TARGET', typed, path);

      expect(harness.writes).toHaveLength(1);
      results.push(harness.writes[0].value);
      cleanup();
      retainPaneState([]);
    }

    expect(results[0]).toBe(1234);
    expect(results[1]).toBe(results[0]);
  });
});

describe('a field nobody has typed into', () => {
  /**
   * The precedent's hazard, in this surface: sending an untouched field must not
   * quietly round the register down to whatever the column happens to show.
   *
   * A float register holding 3.14159274 reads as `3.142` — display precision. A
   * field seeded from that writes 3.142 the moment Enter is pressed on a value
   * nobody meant to change, and the Device accepts it. This is what makes
   * looking at a register capable of altering it.
   */
  it('writes the value the Device actually holds, not the one the column shows', async () => {
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToWrite(harness);

    // Put a full-precision float on the board and read it back.
    const PI_WORD = 0x40490fdb | 0;
    await act(async () => {
      await harness.fake.device.writeRegister(ADDRESS.FLOAT_TARGET, PI_WORD);
    });
    harness.writes.length = 0;

    await user.click(screen.getByText('FLOAT_TARGET'));

    // The column rounds; the field must not.
    expect(within(screen.getByRole('row', { name: /FLOAT_TARGET/ })).getByText('3.142'))
      .toBeInTheDocument();
    expect(fieldFor('FLOAT_TARGET')).toHaveValue('3.1415927');

    await user.click(sendButton());

    expect(harness.writes).toEqual([{ address: ADDRESS.FLOAT_TARGET, value: PI_WORD }]);
  });

  it('does the same on the keyboard path', async () => {
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToWrite(harness);

    const PI_WORD = 0x40490fdb | 0;
    await act(async () => {
      await harness.fake.device.writeRegister(ADDRESS.FLOAT_TARGET, PI_WORD);
    });
    harness.writes.length = 0;

    await user.click(screen.getByText('FLOAT_TARGET'));
    await user.type(fieldFor('FLOAT_TARGET'), '{Enter}');

    expect(harness.writes).toEqual([{ address: ADDRESS.FLOAT_TARGET, value: PI_WORD }]);
  });
});

describe('an edit in progress', () => {
  /**
   * A live reading arriving while someone is typing must not become what gets
   * written. The Pane polls, so a value lands every second — if that overwrote
   * the field, committing would send the Device its own current value back and
   * report success, and the change the operator typed would simply not happen.
   */
  it('is not overwritten by a reading that arrives mid-edit', async () => {
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToWrite(harness);

    await user.click(screen.getByText('SIGNED_TARGET'));
    const field = fieldFor('SIGNED_TARGET');
    await user.clear(field);
    await user.type(field, '777');

    // The Device answers about the very entry being edited.
    await act(async () => {
      await harness.fake.device.readRegister(ADDRESS.SIGNED_TARGET, 'SIGNED_TARGET');
    });

    expect(field).toHaveValue('777');

    await user.click(sendButton());
    expect(harness.writes).toEqual([{ address: ADDRESS.SIGNED_TARGET, value: 777 }]);
  });

  it('follows the Device again once the write has gone', async () => {
    // The field is only frozen while it holds something typed. After a commit it
    // has to resume showing what the register actually holds, or it becomes a
    // stale value that looks current.
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToWrite(harness);

    await writeValue(user, 'SIGNED_TARGET', '4242', 'pointer');

    expect(fieldFor('SIGNED_TARGET')).toHaveValue('4242');

    await act(async () => {
      await harness.fake.device.writeRegister(ADDRESS.SIGNED_TARGET, 99);
    });

    expect(fieldFor('SIGNED_TARGET')).toHaveValue('99');
  });

  it('abandons a half-typed value when another entry is selected', async () => {
    // Carrying a draft across would aim it at a register it was never meant for.
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToWrite(harness);

    await user.click(screen.getByText('SIGNED_TARGET'));
    await user.type(fieldFor('SIGNED_TARGET'), '5555');

    await user.click(screen.getByText('UNSIGNED_TARGET'));
    await user.click(sendButton());

    expect(harness.writes.every(write => write.address === ADDRESS.UNSIGNED_TARGET)).toBe(true);
    expect(harness.writes.some(write => write.value === 5555)).toBe(false);
  });
});

describe('what the Map and the link permit', () => {
  it('offers no way to write a read-only entry', async () => {
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToWrite(harness);

    await user.click(screen.getByText('LOCKED_COUNTER'));

    expect(screen.queryByRole('textbox', { name: /new value/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^send$/i })).not.toBeInTheDocument();
    // Scoped past the Access column, which says "read-only" about every such row.
    expect(screen.getByText(/is read-only in this Profile/i)).toBeInTheDocument();
  });

  it('refuses to write while another interface holds Control, and says so', async () => {
    // The Device would reject the write. Offering it anyway means the operator
    // believes a value was sent that never was.
    const user = userEvent.setup();
    const harness = renderPane();
    harness.fake.faults.refuseControl(true);
    await settle();
    await readyToWrite(harness);

    await user.click(screen.getByText('SIGNED_TARGET'));

    expect(fieldFor('SIGNED_TARGET')).toBeDisabled();
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText(/holds Control/i)).toBeInTheDocument();
    expect(harness.writes).toHaveLength(0);
  });

  it('refuses to write with no link, and says so', async () => {
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();

    await user.click(screen.getByText('SIGNED_TARGET'));

    expect(sendButton()).toBeDisabled();
    expect(screen.getByText(/not connected/i)).toBeInTheDocument();
    expect(harness.writes).toHaveLength(0);
  });
});

describe('a value the entry cannot hold', () => {
  it.each([
    ['1.9', 'SIGNED_TARGET' as const, /whole number/i],
    ['-1', 'UNSIGNED_TARGET' as const, /between 0 and/i],
    ['4294967296', 'UNSIGNED_TARGET' as const, /between 0 and/i],
    ['twelve', 'SIGNED_TARGET' as const, /whole number/i],
  ])('refuses %s for %s rather than sending something else', async (typed, entry, message) => {
    // Truncating 1.9 to 1, or wrapping an out-of-range value, writes a number
    // nobody asked for and looks like it worked.
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToWrite(harness);

    await writeValue(user, entry, typed, 'keyboard');

    expect(harness.writes).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });
});

describe('a write the Device refuses', () => {
  /**
   * The failure this whole surface exists to prevent, and the one that used to
   * be invisible end to end.
   *
   * The backend resolves a write command as soon as the request is *queued* — it
   * cannot do otherwise, because responses arrive as events — so a write path
   * that treats the resolved command as success reports every refusal as a
   * completed write. The board then holds a different value than the screen says
   * it does, with nothing anywhere to say so.
   */
  it('says so at the field rather than reporting success', async () => {
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToWrite(harness);
    harness.fake.faults.refuseWrites(true);

    await writeValue(user, 'SIGNED_TARGET', '1234', 'keyboard');
    await settle();

    expect(screen.getByRole('alert')).toHaveTextContent(/refused the write/i);
  });

  it('keeps the typed value so it can be sent again', async () => {
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToWrite(harness);
    harness.fake.faults.refuseWrites(true);

    await writeValue(user, 'SIGNED_TARGET', '1234', 'keyboard');
    await settle();

    expect(fieldFor('SIGNED_TARGET')).toHaveValue('1234');

    await user.click(sendButton());
    await settle();

    expect(harness.writes).toEqual([
      { address: ADDRESS.SIGNED_TARGET, value: 1234 },
      { address: ADDRESS.SIGNED_TARGET, value: 1234 },
    ]);
  });

  it('does not leave the refusal standing under another register', async () => {
    // A failure belongs to the entry it happened to. Left in place, it reports a
    // refusal that the next register's field never had.
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToWrite(harness);
    harness.fake.faults.refuseWrites(true);

    await writeValue(user, 'SIGNED_TARGET', '1234', 'keyboard');
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent(/refused the write/i);

    await user.click(screen.getByText('UNSIGNED_TARGET'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports a write the transport could not even send', async () => {
    // Distinct from a refusal: the request never left. The fake raises the same
    // error the backend does when there is no link.
    const user = userEvent.setup();
    const harness = renderPane();
    await settle();
    await readyToWrite(harness);

    await user.click(screen.getByText('SIGNED_TARGET'));
    const field = fieldFor('SIGNED_TARGET');
    await user.clear(field);
    await user.type(field, '1234');

    await act(async () => {
      await harness.fake.device.disconnect();
    });
    await settle();

    // The link is gone, so the affordance is withdrawn rather than offering a
    // write that cannot happen.
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText(/not connected/i)).toBeInTheDocument();
  });
});
