/**
 * A fake {@link BackendPort} that serves believable Device data with no Tauri and
 * no hardware, so the interface can be built, reviewed and screenshotted in a
 * plain browser.
 *
 * The same fake is what the behaviour tests drive, which is the point: what the
 * interface is developed against and what it is verified against cannot drift
 * apart.
 */

import {
  ControlInterfaceState,
  DEFAULT_TCP_PORT,
  DEFAULT_UDP_PORT,
  InterfaceType,
} from '../types/shared';
import type { DeviceConnection, DiscoveredDevice, RegisterData } from '../types/shared';
import type { DataSource } from '../types/dashboard';
import { floatToInt32 } from '../utils/floatConversion';
import type {
  BackendEventMap,
  BackendEventName,
  BackendPort,
  Unsubscribe,
} from './backendPort';

/** Runs a delivery. Injected so tests can make event delivery synchronous. */
export type Deliver = (emit: () => void) => void;

/** Starts a repeating timer and returns its canceller. */
export type ScheduleRepeating = (tick: () => void, intervalMs: number) => () => void;

export interface FakeBackendPortOptions {
  /** How event deliveries are scheduled. Defaults to a microtask. */
  readonly deliver?: Deliver;
  /** Overrides on the announced Device. */
  readonly device?: Partial<DiscoveredDevice>;
  /** Wall clock, for response timestamps. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Drives plot series. Defaults to `setInterval`, so tests can fire by hand. */
  readonly scheduleRepeating?: ScheduleRepeating;
}

/** System Register 2. The interface reads this to learn who holds Control. */
const CONTROL_INTERFACE_ADDRESS = 2;
const CONTROL_INTERFACE_NAME = 'CONTROL_INTERFACE';

/** The real backend's wording when no link is open. Matched so the UI's error
 *  handling is exercised against the same string it sees in production. */
const NOT_CONNECTED = 'Not connected to device';

/** The backend floors a plot's poll interval at this, so the fake does too. */
const PLOT_INTERVAL_FLOOR_MS = 10;

/**
 * The three Address Spaces, as the fake keys its stored values. The member
 * strings match the `DataSource` discriminants the poll registry already uses,
 * which is why `sysRegister` appears here rather than the glossary's spelling.
 */
type AddressSpace = 'register' | 'parameter' | 'sysRegister';

/**
 * How one address behaves over time. Movement is what makes the fake worth
 * looking at: a board whose values sit still cannot tell you whether a
 * live-updating surface actually updates.
 */
type SignalShape = 'counter' | 'sine' | 'ramp' | 'toggle' | 'step' | 'steady';

/** Shapes an entry whose name says nothing is drawn from, seeded by address. */
const UNNAMED_SHAPES = ['sine', 'ramp', 'counter', 'toggle', 'step'] as const;

interface Signal {
  readonly shape: SignalShape;
  /** Centre of the range, or the starting count for a counter. */
  readonly base: number;
  /** Half-range for the oscillating shapes; the modulus for `step`. */
  readonly span: number;
  readonly periodMs: number;
  /**
   * True when the entry is carried as an IEEE-754 bit pattern rather than a
   * plain integer. Float entries go over the wire as their bits, so a fake that
   * emitted a small integer for one would render as ~1e-44 on screen.
   */
  readonly float: boolean;
}

/** Stable value in [0,1) from an integer seed — same address, same character. */
function hash01(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
}

/**
 * Picks a plausible signal for an entry.
 *
 * The name is the better clue and is tried first — an entry called
 * `SPINDLE_RPM` should read in thousands and one called `MOTOR_X_ENABLED`
 * should read 0 or 1, because a reviewer judging the interface is judging
 * whether the numbers look like a machine. Where the name says nothing, the
 * address seeds the choice so each entry still keeps a distinct, stable
 * character.
 */
function signalFor(space: AddressSpace, address: number, name: string): Signal {
  const n = name.toUpperCase();
  const floatSignal = (shape: SignalShape, base: number, span: number, periodMs: number): Signal =>
    ({ shape, base, span, periodMs, float: true });
  const intSignal = (shape: SignalShape, base: number, span: number, periodMs: number): Signal =>
    ({ shape, base, span, periodMs, float: false });

  // Gains and physical scale factors are float-typed in every map that has them.
  if (/_K[PID]$/.test(n)) return floatSignal('steady', 0.85, 0.4, 60_000);
  if (/PER_MM|PER_REV|SCALE|RATIO|GAIN|OFFSET/.test(n)) return floatSignal('steady', 80, 20, 60_000);

  // Errors are tested before the general counters: an error tally that climbed
  // as fast as the packet tally would read as a board in permanent failure, and
  // the two would show the same number side by side.
  if (/ERROR|FAULT/.test(n)) return intSignal('counter', 0, 1, 90_000);
  if (/COUNTER_1HZ/.test(n)) return intSignal('counter', 0, 1, 1_000);
  if (/PACKET_COUNT|TICK|UPTIME|_COUNT$/.test(n)) return intSignal('counter', 0, 1, 40);
  if (/ENABLED|ACTIVE|READY|PRESENT|VALID|LATCH/.test(n)) return intSignal('toggle', 0, 1, 9_000);
  if (/STATE|MODE|STATUS/.test(n)) return intSignal('step', 0, 5, 7_000);
  if (/TEMP/.test(n)) return intSignal('sine', 42, 6, 26_000);
  if (/RPM|SPEED/.test(n)) return intSignal('sine', 11_800, 1_400, 13_000);
  if (/LOAD|DUTY|PERCENT|_PCT/.test(n)) return intSignal('sine', 55, 30, 17_000);
  if (/VOLT/.test(n)) return intSignal('sine', 240, 8, 11_000);
  if (/CURRENT|AMP/.test(n)) return intSignal('sine', 60, 18, 8_000);
  if (/ENCODER|POSITION/.test(n)) return intSignal('ramp', 0, 40_000, 30_000);
  if (/SETPOINT|TARGET|LIMIT|DISTANCE|FEED/.test(n)) return intSignal('steady', 2_500, 500, 60_000);

  // Nothing in the name to go on. Parameters are configuration and should look
  // settled; Registers are live and should move.
  const r = hash01(address * 31 + (space === 'parameter' ? 7 : space === 'sysRegister' ? 13 : 0));
  if (space === 'parameter') return intSignal('steady', Math.round(r * 900) + 50, 0, 60_000);
  const shape = UNNAMED_SHAPES[Math.floor(r * UNNAMED_SHAPES.length)] ?? 'sine';
  return intSignal(shape, Math.round(r * 400) + 20, Math.round(r * 180) + 20, 6_000 + Math.round(r * 14_000));
}

/** Samples a signal at an elapsed time. Pure, so a read is a reading. */
function sampleSignal(signal: Signal, elapsedMs: number, seed: number): number {
  const { shape, base, span, periodMs } = signal;
  // A per-entry phase offset stops every sine on screen from moving in lockstep.
  const phase = hash01(seed) * Math.PI * 2;

  switch (shape) {
    case 'counter':
      return base + Math.floor(elapsedMs / periodMs);
    case 'sine':
      return base + span * Math.sin((elapsedMs / periodMs) * Math.PI * 2 + phase);
    case 'ramp':
      return base + span * ((elapsedMs % periodMs) / periodMs);
    case 'toggle':
      return Math.floor(elapsedMs / periodMs) % 2;
    case 'step':
      return Math.floor(elapsedMs / periodMs) % Math.max(1, Math.round(span));
    case 'steady':
      // Not literally constant: a slow wander keeps it from looking dead while
      // still reading as a settled configuration value.
      return base + span * 0.02 * Math.sin((elapsedMs / periodMs) * Math.PI * 2 + phase);
  }
}

const DEFAULT_DEVICE: DiscoveredDevice = {
  ip_address: '192.168.1.42',
  board_name: 'SESAME-CTRL-01',
  mac_address: '02:1A:2B:3C:4D:5E',
  device_id: 4201,
  board_type: 1,
  firmware_version: 0x00010407,
  tcp_port: DEFAULT_TCP_PORT,
  udp_port: DEFAULT_UDP_PORT,
};

/**
 * Hands a file to the browser as a download.
 *
 * The desktop build writes through a native save dialog, which a browser has no
 * equivalent for. A download is the closest honest stand-in: an export under
 * review produces a real file to open, rather than reporting success and writing
 * nothing. Always resolves `true` — a browser cannot tell whether the user kept
 * the file, and a dismissal is not an error either way.
 */
function offerDownload(blob: Blob, suggestedName: string): boolean {
  if (typeof document === 'undefined') return true;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName;
  // The anchor has to be in the document for the click to navigate, and the URL
  // has to outlive the click — revoking it in the same task cancels the download
  // that this function exists to guarantee.
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

function base64ToBlob(dataBase64: string, type: string): Blob {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Minimal typed event bus. Handlers are held per event name. */
class FakeEventBus {
  private handlers = new Map<BackendEventName, Set<(payload: never) => void>>();

  on<K extends BackendEventName>(
    event: K,
    handler: (payload: BackendEventMap[K]) => void
  ): Unsubscribe {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as (payload: never) => void);
    this.handlers.set(event, set);
    return () => { set.delete(handler as (payload: never) => void); };
  }

  emit<K extends BackendEventName>(event: K, payload: BackendEventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // Copied so a handler unsubscribing during dispatch cannot disturb the walk.
    for (const handler of Array.from(set)) {
      (handler as (p: BackendEventMap[K]) => void)(payload);
    }
  }
}

/** The backend's own floor (`poll.rs`'s `MIN_INTERVAL_MS`), matched here so a
 *  fast subscription behaves identically against the fake and the real link. */
const ADDRESS_POLL_FLOOR_MS = 50;

/**
 * Mirrors `src-tauri/src/poll.rs`'s per-address subscription mechanism
 * closely enough that behaviour observed against the fake matches the real
 * backend: N subscribers to one address cost one scheduled read, at the
 * fastest currently-requested interval among them; a brand-new address reads
 * immediately; and subscriber bookkeeping survives a dropped and
 * re-established link untouched — only an explicit unsubscribe removes an
 * entry, exactly as the real subscriber list outlives a reconnect.
 *
 * Deliberately its own implementation rather than an instance of
 * `PollRegistry` (`pollRegistry.ts`) wearing this shape — the two solve the
 * same coalescing problem, but this is the fake's stand-in for what Rust now
 * owns, and `pollRegistry.ts` is on its way out once every caller has moved
 * off it (`.scratch/rust-owned-polling` issue 05).
 */
class AddressSubscriptions {
  private nextId = 1;
  private subscribers = new Map<number, { addressKey: string; intervalMs: number }>();
  private addresses = new Map<
    string,
    {
      source: DataSource;
      address: number;
      name: string;
      subscriberIds: Set<number>;
      currentIntervalMs: number | null;
      cancel: (() => void) | null;
    }
  >();
  private enabled = false;

  constructor(
    private readonly emitReading: (source: DataSource, address: number, name: string) => void,
    private readonly scheduleRepeating: ScheduleRepeating
  ) {}

  /** Toggled alongside the link — connect/disconnect/dropLink all call this. */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    for (const [addressKey, entry] of this.addresses) {
      this.reschedule(addressKey, entry);
      // Resuming behaves like the real backend's task respawn: a fresh timer
      // reads at once rather than waiting out its first period.
      if (enabled) this.emitReading(entry.source, entry.address, entry.name);
    }
  }

  subscribe(source: DataSource, address: number, name: string, intervalMs: number): number {
    const addressKey = `${source}:${address}`;
    const id = this.nextId++;
    this.subscribers.set(id, { addressKey, intervalMs: Math.max(ADDRESS_POLL_FLOOR_MS, intervalMs) });

    let entry = this.addresses.get(addressKey);
    const isNewAddress = !entry;
    if (!entry) {
      entry = { source, address, name, subscriberIds: new Set(), currentIntervalMs: null, cancel: null };
      this.addresses.set(addressKey, entry);
    }
    entry.subscriberIds.add(id);

    this.reschedule(addressKey, entry);
    // A brand-new address reads immediately rather than waiting for its first
    // tick; an address that already had subscribers already has a recent
    // reading on screen, so no separate immediate read is needed for it.
    if (isNewAddress && this.enabled) this.emitReading(entry.source, entry.address, entry.name);

    return id;
  }

  unsubscribe(id: number): void {
    const sub = this.subscribers.get(id);
    if (!sub) return; // unknown or already-removed id — safe to call more than once
    this.subscribers.delete(id);

    const entry = this.addresses.get(sub.addressKey);
    if (!entry) return;
    entry.subscriberIds.delete(id);

    if (entry.subscriberIds.size === 0) {
      entry.cancel?.();
      this.addresses.delete(sub.addressKey);
      return;
    }
    this.reschedule(sub.addressKey, entry);
  }

  private fastestInterval(entry: { subscriberIds: Set<number> }): number | null {
    let fastest: number | null = null;
    for (const id of entry.subscriberIds) {
      const intervalMs = this.subscribers.get(id)?.intervalMs;
      if (intervalMs !== undefined && (fastest === null || intervalMs < fastest)) fastest = intervalMs;
    }
    return fastest;
  }

  /** Spawns, respawns or stops an address's timer to match its current
   *  fastest requested interval. A no-op when nothing has actually changed. */
  private reschedule(
    addressKey: string,
    entry: {
      source: DataSource;
      address: number;
      name: string;
      subscriberIds: Set<number>;
      currentIntervalMs: number | null;
      cancel: (() => void) | null;
    }
  ): void {
    const interval = this.enabled ? this.fastestInterval(entry) : null;
    if (interval === entry.currentIntervalMs) return;

    entry.cancel?.();
    entry.cancel = null;
    entry.currentIntervalMs = interval;
    if (interval === null) return;

    entry.cancel = this.scheduleRepeating(
      () => this.emitReading(entry.source, entry.address, entry.name),
      interval
    );
  }
}

/**
 * The fake's misbehaviour switches.
 *
 * Refused Control, a dropped link and an invalid entry are all states the
 * interface has to render, so they need to be reachable on demand — in a test
 * and in a browser session alike — rather than only when real hardware happens
 * to misbehave.
 */
export interface FakeFaults {
  /** When set, Control is held by another interface and cannot be claimed. */
  refuseControl(refuse: boolean): void;
  /** Drops the link as if the Device stopped answering. */
  dropLink(): void;
  /**
   * Which addresses answer with `valid: false`. `true` invalidates every read.
   *
   * Deliberately a bare address, which crosses all three Address Spaces: this is
   * a switch for bringing an invalid entry up on screen, not a device model, and
   * naming the space at every call would make it fiddlier to reach for with no
   * gain in what it can show.
   */
  invalidate(invalid: boolean | ReadonlySet<number>): void;
  /**
   * When set, the Device refuses every write, as it does for an entry the
   * firmware will not accept or a session that does not hold Control.
   *
   * The command itself still succeeds — the backend resolves a write as soon as
   * the request is queued, long before the board answers — and the refusal
   * arrives as a confirmation carrying `valid: false`. That asymmetry is the
   * whole reason this fault exists: a write path that treats the resolved
   * command as success reports a refused write as a completed one.
   */
  refuseWrites(refuse: boolean): void;
  /**
   * When set, the Device refuses every Command with `PERMISSION_ERROR`, as it
   * does when Control is held elsewhere.
   *
   * Mirrors {@link refuseWrites}'s asymmetry: `sendCommand` still resolves — the
   * backend queues a Command before the Device has answered it — and the
   * refusal arrives afterwards, as a `commandResponse` carrying `valid: false`.
   */
  refuseCommands(refuse: boolean): void;
}

export interface FakeBackendPort extends BackendPort {
  readonly faults: FakeFaults;
}

export function createFakeBackendPort(options: FakeBackendPortOptions = {}): FakeBackendPort {
  const deliver = options.deliver ?? (emit => { queueMicrotask(emit); });
  const device: DiscoveredDevice = { ...DEFAULT_DEVICE, ...options.device };
  const bus = new FakeEventBus();

  const now = options.now ?? Date.now;
  const scheduleRepeating: ScheduleRepeating =
    options.scheduleRepeating ??
    ((tick, intervalMs) => {
      const id = setInterval(tick, intervalMs);
      return () => clearInterval(id);
    });

  /** The link, or null while closed. Mirrors what the backend would report. */
  let link: DeviceConnection | null = null;
  let controlState: ControlInterfaceState = ControlInterfaceState.UNDECIDED;
  let refusingControl = false;
  let invalidEntries: boolean | ReadonlySet<number> = false;
  let refusingWrites = false;
  let refusingCommands = false;

  const isInvalid = (address: number): boolean =>
    typeof invalidEntries === 'boolean' ? invalidEntries : invalidEntries.has(address);

  const announceLink = (): void => {
    if (link) bus.emit('connectionStatus', link);
  };

  const startedAt = now();
  /** Values written by the host, which take precedence over the signal. */
  const written = new Map<string, number>();

  const key = (space: AddressSpace, address: number): string => `${space}:${address}`;

  /** The value an address currently reads as: what was written, else the signal. */
  const valueAt = (space: AddressSpace, address: number, name: string): number => {
    // Control is real state, not a signal — the interface reads this address to
    // decide whether it may write at all.
    if (space === 'sysRegister' && address === CONTROL_INTERFACE_ADDRESS) return controlState;

    const stored = written.get(key(space, address));
    if (stored !== undefined) return stored;

    const signal = signalFor(space, address, name);
    const seed = address * 131 + space.length;
    const raw = sampleSignal(signal, now() - startedAt, seed);
    return signal.float ? floatToInt32(raw) : Math.round(raw);
  };

  const requireLink = (): void => {
    if (!link?.connected) throw new Error(NOT_CONNECTED);
  };

  /** One read response, shaped as the backend would emit it. */
  const reading = (space: AddressSpace, address: number, name: string): RegisterData => ({
    address,
    name,
    value: valueAt(space, address, name),
    valid: !isInvalid(address),
    timestamp: now(),
  });

  /**
   * A write confirmation. The write commands carry no name, so the backend falls
   * back to a generated one — and its prefix differs by space. The fake matches
   * that rather than inventing a nicer name the real link would never send.
   *
   * A refused write answers with `valid: false`, which is how the backend now
   * reports a negative status. The stored value is left alone, because a refused
   * write did not happen.
   */
  const confirmation = (space: AddressSpace, address: number, value: number): RegisterData => ({
    address,
    name: `${space === 'parameter' ? 'param' : 'addr'}_${address}`,
    value: written.get(key(space, address)) ?? value,
    valid: !refusingWrites && !isInvalid(address),
    timestamp: now(),
  });

  /** Cancellers for the running plot series, keyed by series name. */
  const plots = new Map<string, () => void>();

  const stopAllPlots = (): void => {
    for (const cancel of plots.values()) cancel();
    plots.clear();
  };

  const beginPlot = async (
    space: AddressSpace,
    registerName: string,
    pollInterval: number,
    address: number
  ): Promise<void> => {
    requireLink();
    // Restarting an already-running series replaces it rather than doubling it.
    plots.get(registerName)?.();
    const cancel = scheduleRepeating(() => {
      bus.emit('plotData', {
        seriesName: registerName,
        // The backend timestamps plot points in seconds; the plot surfaces read
        // them as such, so milliseconds here would put every point far off-axis.
        point: { x: now() / 1000, y: valueAt(space, address, registerName) },
      });
      // The backend floors the poll interval at 10 ms; a faster series would be
      // one the real link could never deliver.
    }, Math.max(PLOT_INTERVAL_FLOOR_MS, pollInterval));
    plots.set(registerName, cancel);
  };

  const announceControlState = (): void => {
    bus.emit('sysRegisterUpdate', {
      address: CONTROL_INTERFACE_ADDRESS,
      name: CONTROL_INTERFACE_NAME,
      value: controlState,
      valid: true,
      timestamp: now(),
    });
  };

  const addressSubscriptions = new AddressSubscriptions((source, address, name) => {
    if (source !== 'register' && source !== 'parameter' && source !== 'sysRegister') {
      throw new Error(`subscribeAddress: '${source}' is a Command, not a pollable Address Space`);
    }
    deliver(() => {
      const event =
        source === 'register' ? 'registerUpdate' : source === 'parameter' ? 'parameterUpdate' : 'sysRegisterUpdate';
      bus.emit(event, reading(source, address, name));
    });
  }, scheduleRepeating);

  return {
    device: {
      startScan: async () => {
        deliver(() => {
          bus.emit('deviceDiscovered', device);
          bus.emit('scanComplete', undefined);
        });
      },
      connect: async (ip: string, interfaceType: InterfaceType, deviceName?: string) => {
        // A new connection claims nothing. Leaving the previous session's holder
        // in place would have the interface read System Register 2 straight after
        // connecting and conclude it already held Control.
        controlState = ControlInterfaceState.UNDECIDED;
        link = {
          ip,
          port: interfaceType === InterfaceType.UDP ? device.udp_port : device.tcp_port,
          interface: interfaceType,
          connected: true,
          reconnecting: false,
          controlState,
          deviceName: deviceName ?? device.board_name,
        };
        // Unlike plots (stopped on disconnect, cleared here, not resumed),
        // address subscriptions are never cleared by connect/disconnect — a
        // subscription belongs to a mounted widget, not to whichever device
        // answers it, mirroring `poll.rs`'s `resume_poll_subscriptions`. This
        // is what "resuming across a simulated reconnect" means for the fake:
        // enabling delivery again resumes every subscription still registered.
        addressSubscriptions.setEnabled(true);
        deliver(announceLink);
      },

      disconnect: async () => {
        if (!link) return;
        // An explicit disconnect discards plot registrations, as the backend's
        // does; only an automatic reconnect of the same connection resumes them.
        stopAllPlots();
        addressSubscriptions.setEnabled(false);
        link = { ...link, connected: false, reconnecting: false };
        deliver(announceLink);
      },

      takeControl: async () => {
        requireLink();
        if (!link) return;
        controlState = refusingControl
          ? // Another interface already holds Control. The command itself still
            // succeeds; the interface learns the truth from CONTROL_INTERFACE.
            ControlInterfaceState.TCP_CLI
          : link.interface === InterfaceType.UDP
            ? ControlInterfaceState.UDP_DATASTREAM
            : ControlInterfaceState.TCP_DATASTREAM;
        link = { ...link, controlState };
        deliver(announceControlState);
      },

      readRegister: async (address: number, name: string) => {
        requireLink();
        deliver(() => bus.emit('registerUpdate', reading('register', address, name)));
      },
      writeRegister: async (address: number, value: number) => {
        requireLink();
        // A refused write leaves the register as it was. Storing it and then
        // reporting the refusal would leave the fake claiming a value the board
        // never took.
        if (!refusingWrites) written.set(key('register', address), value);
        deliver(() => bus.emit('registerUpdate', confirmation('register', address, value)));
      },
      readParameter: async (address: number, name: string) => {
        requireLink();
        deliver(() => bus.emit('parameterUpdate', reading('parameter', address, name)));
      },
      writeParameter: async (address: number, value: number) => {
        requireLink();
        if (!refusingWrites) written.set(key('parameter', address), value);
        deliver(() => bus.emit('parameterUpdate', confirmation('parameter', address, value)));
      },
      readSystemRegister: async (address: number, name: string) => {
        requireLink();
        deliver(() => bus.emit('sysRegisterUpdate', reading('sysRegister', address, name)));
      },
      // System Registers are library-managed and read-only over the protocol.
      // The Device answers a write with PERMISSION_ERROR, so the fake refuses it
      // rather than storing a value no real board would accept.
      writeSystemRegister: async (address: number) => {
        requireLink();
        deliver(() => {
          bus.emit('logEntry', {
            level: 'warning',
            category: 'register',
            message: `System register ${address} is read-only — write refused by the Device`,
            timestamp: now(),
          });
        });
      },

      // The Device answers a Command with a status. For command=0 (SYS_COMMAND —
      // the wire type every Profile Command and library command uses; the actual
      // code travels in the address field) that status now crosses as a typed
      // `commandResponse`, ADR-0003's fourth amendment, mirroring the write
      // confirmations: logged only on refusal, since success is fully said by
      // `valid: true` on the event and a second line would be noise. Any other
      // command type is user-defined traffic (CNC motor control etc.) with no
      // Pane reading its outcome, so it keeps the log-line acknowledgement it
      // already had.
      sendCommand: async (command: number, address: number, value: number) => {
        requireLink();
        if (command !== 0) {
          deliver(() => {
            bus.emit('logEntry', {
              level: 'success',
              category: 'connection',
              message: `Command ${command} response: status=0, addr=${address}, value=${value}`,
              timestamp: now(),
            });
          });
          return;
        }
        const ok = !refusingCommands;
        deliver(() => {
          if (!ok) {
            bus.emit('logEntry', {
              level: 'error',
              category: 'connection',
              message: `Command ${address} refused by the device: status=-5 (PERMISSION_ERROR)`,
              timestamp: now(),
            });
          }
          bus.emit('commandResponse', {
            command: address,
            value,
            status: ok ? 0 : -5,
            valid: ok,
            timestamp: now(),
          });
        });
      },

      startPlotting: (registerName: string, pollInterval: number, address: number) =>
        beginPlot('register', registerName, pollInterval, address),

      startPlottingSysRegister: (registerName: string, pollInterval: number, address: number) =>
        beginPlot('sysRegister', registerName, pollInterval, address),

      stopPlotting: async (registerName: string) => {
        plots.get(registerName)?.();
        plots.delete(registerName);
      },

      subscribeAddress: async (source: DataSource, address: number, name: string, intervalMs: number) =>
        addressSubscriptions.subscribe(source, address, name, intervalMs),
      unsubscribeAddress: async (id: number) => {
        addressSubscriptions.unsubscribe(id);
      },

      updateLogSettings: async () => {},
    },

    files: {
      saveText: async ({ content, suggestedName }) =>
        offerDownload(new Blob([content], { type: 'text/plain' }), suggestedName),
      saveCsv: async (content: string, suggestedName: string) =>
        offerDownload(new Blob([content], { type: 'text/csv' }), suggestedName),
      savePdf: async (dataBase64: string, suggestedName: string) =>
        offerDownload(base64ToBlob(dataBase64, 'application/pdf'), suggestedName),
    },

    events: {
      on: async (event, handler) => bus.on(event, handler),
    },

    faults: {
      refuseControl: (refuse: boolean) => { refusingControl = refuse; },

      refuseWrites: (refuse: boolean) => { refusingWrites = refuse; },

      refuseCommands: (refuse: boolean) => { refusingCommands = refuse; },

      dropLink: () => {
        if (!link) return;
        // Stop the plot series first: a dropped link produces no more points,
        // and leaving them running would keep drawing through the outage.
        for (const cancel of plots.values()) cancel();
        plots.clear();
        // Address subscriptions stop producing too, but stay registered — a
        // later `connect()` resumes them, same as a real reconnect.
        addressSubscriptions.setEnabled(false);
        // The backend reports an unresponsive Device as reconnecting rather than
        // cleanly disconnected, which is a different state on screen.
        link = { ...link, connected: false, reconnecting: true };
        deliver(() => {
          bus.emit('logEntry', {
            level: 'error',
            category: 'connection',
            message: 'Device unresponsive — connection lost',
            timestamp: now(),
          });
          announceLink();
        });
      },

      invalidate: (invalid: boolean | ReadonlySet<number>) => { invalidEntries = invalid; },
    },
  };
}
