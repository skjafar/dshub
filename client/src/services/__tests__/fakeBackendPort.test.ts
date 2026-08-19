import { describe, it, expect } from 'vitest';
import { createFakeBackendPort } from '../fakeBackendPort';
import { ControlInterfaceState, InterfaceType } from '../../types/shared';
import type {
  DeviceConnection,
  DiscoveredDevice,
  LogEntry,
  PlotDataPoint,
  RegisterData,
} from '../../types/shared';
import { int32ToFloat } from '../../utils/floatConversion';

/**
 * The fake is driven exactly as the application drives it — commands in through
 * `device`, values out through `events`. Nothing here reaches into its internals,
 * so these tests hold whatever the fake's implementation becomes.
 *
 * `deliver: fn => fn()` makes event delivery synchronous, which removes timing
 * from every assertion below without changing what is being asserted.
 */
function immediate() {
  return createFakeBackendPort({ deliver: fn => fn() });
}

describe('fake backend port — discovery', () => {
  it('announces a Device and then reports the scan complete', async () => {
    const port = immediate();
    const found: DiscoveredDevice[] = [];
    let completed = 0;

    await port.events.on('deviceDiscovered', device => found.push(device));
    await port.events.on('scanComplete', () => { completed += 1; });

    await port.device.startScan();

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      ip_address: expect.stringMatching(/^\d+\.\d+\.\d+\.\d+$/),
      board_name: expect.stringMatching(/\S/),
      tcp_port: 2009,
      udp_port: 2011,
    });
    expect(completed).toBe(1);
  });
});

describe('fake backend port — the link', () => {
  it('reports a live link on connect and a closed one on disconnect', async () => {
    const port = immediate();
    const statuses: DeviceConnection[] = [];
    await port.events.on('connectionStatus', status => statuses.push(status));

    await port.device.connect('10.0.0.7', InterfaceType.UDP, 'BENCH-02');
    expect(statuses.at(-1)).toMatchObject({
      ip: '10.0.0.7',
      port: 2011,
      interface: InterfaceType.UDP,
      connected: true,
      reconnecting: false,
      deviceName: 'BENCH-02',
    });

    await port.device.disconnect();
    expect(statuses.at(-1)).toMatchObject({ connected: false, reconnecting: false });
  });
});

describe('fake backend port — Control', () => {
  it('reports the claiming interface on CONTROL_INTERFACE once Control is taken', async () => {
    // The interface learns it holds Control by reading System Register 2, not
    // from the command's own result — so that is what has to change.
    const port = immediate();
    const sysUpdates: RegisterData[] = [];
    await port.events.on('sysRegisterUpdate', r => sysUpdates.push(r));

    await port.device.connect('10.0.0.7', InterfaceType.TCP);
    await port.device.takeControl();

    expect(sysUpdates.at(-1)).toMatchObject({
      address: 2,
      name: 'CONTROL_INTERFACE',
      value: ControlInterfaceState.TCP_DATASTREAM,
      valid: true,
    });
  });
});

describe('fake backend port — reads', () => {
  /** A port whose clock the caller drives, so value movement is observable. */
  function withClock(start = 1_700_000_000_000) {
    const clock = { ms: start };
    const port = createFakeBackendPort({
      deliver: fn => fn(),
      now: () => clock.ms,
    });
    return { port, clock };
  }

  it('serves a Register value that holds steady within an instant but moves over time', async () => {
    const { port, clock } = withClock();
    const updates: RegisterData[] = [];
    await port.events.on('registerUpdate', r => updates.push(r));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.readRegister(4, 'SPINDLE_RPM');
    const first = updates.at(-1);
    expect(first).toMatchObject({ address: 4, name: 'SPINDLE_RPM', valid: true });
    expect(first?.value).toBeTypeOf('number');
    expect(Number.isFinite(first?.value)).toBe(true);

    // Read again at the same instant: a value is a reading, not random noise.
    await port.device.readRegister(4, 'SPINDLE_RPM');
    expect(updates.at(-1)?.value).toBe(first?.value);

    // Time passes: a live runtime value must not sit still, or nothing that
    // updates on screen can be judged honestly.
    clock.ms += 5_000;
    await port.device.readRegister(4, 'SPINDLE_RPM');
    expect(updates.at(-1)?.value).not.toBe(first?.value);
  });

  it('carries a float-typed Parameter as its IEEE-754 bit pattern', async () => {
    // Float entries travel over the protocol as their bits, and the interface
    // reinterprets them. A fake that emitted a plain small integer for a gain
    // would render as ~1e-44 on screen — believable data has to survive that
    // reinterpretation.
    const port = immediate();
    const params: RegisterData[] = [];
    await port.events.on('parameterUpdate', p => params.push(p));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.readParameter(20, 'MOTOR_X_KP');

    const decoded = int32ToFloat(params.at(-1)?.value ?? 0);
    expect(decoded).toBeGreaterThan(0.01);
    expect(decoded).toBeLessThan(100);
  });

  it('keeps an error tally rare and a packet tally busy', async () => {
    // These two sit next to each other in every System Register map. When both
    // matched the same "ends in _COUNT" rule they showed identical numbers and
    // the board read as being in permanent failure.
    const { port, clock } = withClock();
    const sys: RegisterData[] = [];
    await port.events.on('sysRegisterUpdate', r => sys.push(r));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    clock.ms += 15_000;
    await port.device.readSystemRegister(0, 'DS_PACKET_COUNT');
    const packets = sys.at(-1)?.value ?? 0;
    await port.device.readSystemRegister(1, 'DS_ERROR_COUNT');
    const errors = sys.at(-1)?.value ?? 0;

    expect(packets).toBeGreaterThan(100);
    expect(errors).toBe(0);
  });

  it('rejects a read while the link is closed, in the backend\'s own words', async () => {
    const port = immediate();
    await expect(port.device.readRegister(4, 'SPINDLE_RPM')).rejects.toThrow(
      'Not connected to device'
    );
  });
});

describe('fake backend port — writes', () => {
  it('takes a written Register value and reflects it back on later reads', async () => {
    const clock = { ms: 1_700_000_000_000 };
    const port = createFakeBackendPort({ deliver: fn => fn(), now: () => clock.ms });
    const updates: RegisterData[] = [];
    await port.events.on('registerUpdate', r => updates.push(r));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.writeRegister(11, 4242);
    expect(updates.at(-1)).toMatchObject({ address: 11, value: 4242, valid: true });

    // The value has to stick, not merely echo: time passes and the underlying
    // signal moves on, but a written setpoint is what the Device now holds.
    clock.ms += 30_000;
    await port.device.readRegister(11, 'MOTOR_X_SETPOINT');
    expect(updates.at(-1)).toMatchObject({
      address: 11,
      name: 'MOTOR_X_SETPOINT',
      value: 4242,
    });
  });

  it('names a write confirmation the way the backend names it, per space', async () => {
    // The write commands carry no name, and the backend's fallback differs by
    // space: `addr_<n>` for Registers, `param_<n>` for Parameters.
    const port = immediate();
    const registers: RegisterData[] = [];
    const parameters: RegisterData[] = [];
    await port.events.on('registerUpdate', r => registers.push(r));
    await port.events.on('parameterUpdate', p => parameters.push(p));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.writeRegister(9, 1);
    await port.device.writeParameter(9, 2);

    expect(registers.at(-1)?.name).toBe('addr_9');
    expect(parameters.at(-1)?.name).toBe('param_9');
  });

  it('keeps the three Address Spaces separate', async () => {
    // A bare address is meaningless without its space; writing Register 5 must
    // not move Parameter 5.
    const port = immediate();
    const registers: RegisterData[] = [];
    const parameters: RegisterData[] = [];
    await port.events.on('registerUpdate', r => registers.push(r));
    await port.events.on('parameterUpdate', p => parameters.push(p));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.writeRegister(5, 111);
    await port.device.writeParameter(5, 222);

    await port.device.readRegister(5, 'R');
    await port.device.readParameter(5, 'P');

    expect(registers.at(-1)?.value).toBe(111);
    expect(parameters.at(-1)?.value).toBe(222);
  });

  it('refuses a System Register write, which the protocol never permits', async () => {
    const port = immediate();
    const sysUpdates: RegisterData[] = [];
    const logs: LogEntry[] = [];
    await port.events.on('sysRegisterUpdate', r => sysUpdates.push(r));
    await port.events.on('logEntry', e => logs.push(e));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.writeSystemRegister(3, 99_999);
    await port.device.readSystemRegister(3, 'COUNTER_1HZ');

    expect(sysUpdates.at(-1)?.value).not.toBe(99_999);
    expect(logs.at(-1)).toMatchObject({ level: 'warning' });
  });
});

describe('fake backend port — plotting', () => {
  /** A port whose repeating timers the test fires by hand. */
  function withTimers() {
    const clock = { ms: 1_700_000_000_000 };
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const port = createFakeBackendPort({
      deliver: fn => fn(),
      now: () => clock.ms,
      scheduleRepeating: (fn, ms) => {
        const timer = { fn, ms };
        timers.push(timer);
        return () => { timers.splice(timers.indexOf(timer), 1); };
      },
    });
    return { port, clock, timers };
  }

  it('emits a point per tick at the requested interval, and stops when told', async () => {
    const { port, clock, timers } = withTimers();
    const points: Array<{ seriesName: string; point: PlotDataPoint }> = [];
    await port.events.on('plotData', p => points.push(p));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.startPlotting('SPINDLE_RPM', 250, 4);
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(250);

    clock.ms += 250;
    timers[0].fn();

    expect(points).toHaveLength(1);
    expect(points[0].seriesName).toBe('SPINDLE_RPM');
    // The backend timestamps plot points in seconds, not milliseconds.
    expect(points[0].point.x).toBeCloseTo(clock.ms / 1000, 3);
    expect(Number.isFinite(points[0].point.y)).toBe(true);

    await port.device.stopPlotting('SPINDLE_RPM');
    expect(timers).toHaveLength(0);
  });

  it('stops every series on disconnect, as an explicit disconnect does', async () => {
    // The backend clears its plot registrations when the host disconnects, and
    // only an automatic reconnect of the same connection resumes them. A fake
    // that kept its timers would emit points into a closed link forever.
    const { port, timers } = withTimers();
    await port.device.connect('10.0.0.7', InterfaceType.TCP);
    await port.device.startPlotting('SPINDLE_RPM', 250, 4);
    await port.device.startPlottingSysRegister('COUNTER_1HZ', 500, 3);
    expect(timers).toHaveLength(2);

    await port.device.disconnect();

    expect(timers).toHaveLength(0);
  });

  it('holds the backend\'s 10 ms floor on the poll interval', async () => {
    const { port, timers } = withTimers();
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.startPlotting('SPINDLE_RPM', 1, 4);

    expect(timers[0]?.ms).toBe(10);
  });

  it('plots a System Register on its own series', async () => {
    const { port, timers } = withTimers();
    const points: Array<{ seriesName: string; point: PlotDataPoint }> = [];
    await port.events.on('plotData', p => points.push(p));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.startPlottingSysRegister('COUNTER_1HZ', 500, 3);
    timers[0].fn();

    expect(points.at(-1)?.seriesName).toBe('COUNTER_1HZ');
  });
});

describe('fake backend port — address subscriptions', () => {
  /** A port whose repeating timers the test fires by hand. */
  function withTimers() {
    const clock = { ms: 1_700_000_000_000 };
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const port = createFakeBackendPort({
      deliver: fn => fn(),
      now: () => clock.ms,
      scheduleRepeating: (fn, ms) => {
        const timer = { fn, ms };
        timers.push(timer);
        return () => { timers.splice(timers.indexOf(timer), 1); };
      },
    });
    return { port, clock, timers };
  }

  it('registers interest before any connection exists, and only starts reading once one does', async () => {
    // `.scratch/rust-owned-polling` issue 04: a Pane's bulk "Live" refresh (and
    // any individually-bound widget) may declare interest before the Device is
    // ever reached — `poll.rs`'s own `subscribe_address` never requires a link,
    // only `reschedule_address`'s actual read does. Every other case in this
    // describe block connects before subscribing; this one deliberately does
    // not.
    const { port, timers } = withTimers();
    const updates: RegisterData[] = [];
    await port.events.on('registerUpdate', r => updates.push(r));

    const id = await port.device.subscribeAddress('register', 4, 'SPINDLE_RPM', 500);
    expect(id).toEqual(expect.any(Number));
    expect(updates).toHaveLength(0);
    expect(timers).toHaveLength(0);

    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ address: 4, name: 'SPINDLE_RPM' });
    expect(timers).toHaveLength(1);
  });

  it('reads a brand-new subscription immediately, without waiting for the first tick', async () => {
    const { port, timers } = withTimers();
    const updates: RegisterData[] = [];
    await port.events.on('registerUpdate', r => updates.push(r));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.subscribeAddress('register', 4, 'SPINDLE_RPM', 500);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ address: 4, name: 'SPINDLE_RPM' });
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(500);
  });

  it('coalesces several subscriptions to one address into a single timer, at the fastest requested rate', async () => {
    const { port, timers } = withTimers();
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.subscribeAddress('register', 4, 'SPINDLE_RPM', 1000);
    await port.device.subscribeAddress('register', 4, 'SPINDLE_RPM', 100);
    await port.device.subscribeAddress('register', 4, 'SPINDLE_RPM', 500);

    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(100);
  });

  it('reverts to what remains once the fastest subscriber unsubscribes', async () => {
    const { port, timers } = withTimers();
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    const slow = await port.device.subscribeAddress('register', 4, 'SPINDLE_RPM', 1000);
    const fast = await port.device.subscribeAddress('register', 4, 'SPINDLE_RPM', 100);
    expect(timers[0].ms).toBe(100);

    await port.device.unsubscribeAddress(fast);
    expect(timers[0].ms).toBe(1000);

    await port.device.unsubscribeAddress(slow);
    expect(timers).toHaveLength(0);
  });

  it('unsubscribing more than once is safe', async () => {
    const { port, timers } = withTimers();
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    const id = await port.device.subscribeAddress('register', 4, 'SPINDLE_RPM', 500);
    await port.device.unsubscribeAddress(id);
    expect(timers).toHaveLength(0);

    await expect(port.device.unsubscribeAddress(id)).resolves.toBeUndefined();
    expect(timers).toHaveLength(0);
  });

  it('keeps the same numeric address on different sources independent', async () => {
    const { port, timers } = withTimers();
    const registers: RegisterData[] = [];
    const sysRegisters: RegisterData[] = [];
    await port.events.on('registerUpdate', r => registers.push(r));
    await port.events.on('sysRegisterUpdate', r => sysRegisters.push(r));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.subscribeAddress('register', 2, 'R', 500);
    await port.device.subscribeAddress('sysRegister', 2, 'S', 200);

    expect(timers).toHaveLength(2);
    expect(registers).toHaveLength(1);
    expect(sysRegisters).toHaveLength(1);
  });

  it('holds the backend\'s 50 ms floor on the subscription interval', async () => {
    const { port, timers } = withTimers();
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.subscribeAddress('register', 4, 'SPINDLE_RPM', 1);

    expect(timers[0]?.ms).toBe(50);
  });

  it('resumes a still-registered subscription after a reconnect, with no need to subscribe again', async () => {
    const { port, timers } = withTimers();
    const updates: RegisterData[] = [];
    await port.events.on('registerUpdate', r => updates.push(r));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.subscribeAddress('register', 4, 'SPINDLE_RPM', 500);
    expect(timers).toHaveLength(1);
    updates.length = 0;

    // The link drops — subscriptions stop producing, but stay registered.
    port.faults.dropLink();
    expect(timers).toHaveLength(0);

    // Reconnecting resumes it on its own: a fresh read, and its timer back.
    await port.device.connect('10.0.0.7', InterfaceType.TCP);
    expect(updates).toHaveLength(1);
    expect(timers).toHaveLength(1);
  });
});

describe('fake backend port — Commands', () => {
  it('acknowledges a Command with a log entry naming it', async () => {
    const port = immediate();
    const logs: LogEntry[] = [];
    await port.events.on('logEntry', e => logs.push(e));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.sendCommand(64, 12, 7);

    expect(logs.at(-1)?.message).toMatch(/64/);
    expect(logs.at(-1)?.level).not.toBe('error');
  });
});

describe('fake backend port — misbehaviour on demand', () => {
  it('refuses Control, reporting that another interface holds it', async () => {
    const port = immediate();
    const sysUpdates: RegisterData[] = [];
    await port.events.on('sysRegisterUpdate', r => sysUpdates.push(r));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    port.faults.refuseControl(true);
    await port.device.takeControl();

    // Refusal is not an error from the command — the interface finds out by
    // reading CONTROL_INTERFACE and seeing someone else there.
    const reported = sysUpdates.at(-1);
    expect(reported).toMatchObject({ address: 2, valid: true });
    expect(reported?.value).not.toBe(ControlInterfaceState.TCP_DATASTREAM);
    expect(reported?.value).toBe(ControlInterfaceState.TCP_CLI);

    // And it stays refused on a later read, not just at the moment of claiming.
    await port.device.readSystemRegister(2, 'CONTROL_INTERFACE');
    expect(sysUpdates.at(-1)?.value).toBe(ControlInterfaceState.TCP_CLI);
  });

  it('does not carry Control over into a new connection', async () => {
    // Reconnecting starts from UNDECIDED. If the previous session's holder
    // lingered, the interface would read System Register 2 straight after
    // connecting and believe it already held Control.
    const port = immediate();
    const sysUpdates: RegisterData[] = [];
    await port.events.on('sysRegisterUpdate', r => sysUpdates.push(r));

    await port.device.connect('10.0.0.7', InterfaceType.TCP);
    await port.device.takeControl();
    expect(sysUpdates.at(-1)?.value).toBe(ControlInterfaceState.TCP_DATASTREAM);

    await port.device.disconnect();
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    await port.device.readSystemRegister(2, 'CONTROL_INTERFACE');
    expect(sysUpdates.at(-1)?.value).toBe(ControlInterfaceState.UNDECIDED);
  });

  it('drops the link, reporting the Device as reconnecting and going quiet', async () => {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const port = createFakeBackendPort({
      deliver: fn => fn(),
      scheduleRepeating: (fn, ms) => {
        const timer = { fn, ms };
        timers.push(timer);
        return () => { timers.splice(timers.indexOf(timer), 1); };
      },
    });
    const statuses: DeviceConnection[] = [];
    await port.events.on('connectionStatus', s => statuses.push(s));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);
    await port.device.startPlotting('SPINDLE_RPM', 250, 4);

    port.faults.dropLink();

    // An unresponsive Device reads differently from a clean disconnect.
    expect(statuses.at(-1)).toMatchObject({ connected: false, reconnecting: true });
    // And it stops producing: a dead link must not keep drawing a live plot.
    expect(timers).toHaveLength(0);
    await expect(port.device.readRegister(4, 'SPINDLE_RPM')).rejects.toThrow(
      'Not connected to device'
    );
  });

  it('returns nominated entries as invalid while serving the rest normally', async () => {
    const port = immediate();
    const updates: RegisterData[] = [];
    await port.events.on('registerUpdate', r => updates.push(r));
    await port.device.connect('10.0.0.7', InterfaceType.TCP);

    port.faults.invalidate(new Set([7]));

    await port.device.readRegister(7, 'BROKEN');
    expect(updates.at(-1)).toMatchObject({ address: 7, valid: false });

    await port.device.readRegister(8, 'FINE');
    expect(updates.at(-1)).toMatchObject({ address: 8, valid: true });

    // Blanket invalidation covers every address, for reviewing the empty case.
    port.faults.invalidate(true);
    await port.device.readRegister(8, 'FINE');
    expect(updates.at(-1)?.valid).toBe(false);
  });
});
