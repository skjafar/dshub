import type { DataSource } from '../types/dashboard';

/**
 * Coalesces device reads.
 *
 * Every widget used to own a `setInterval` and issue its own `invoke`, so ten
 * widgets bound to the same address at 500 ms produced ten identical round-trips
 * per second — on a link that services requests strictly one at a time. A second,
 * independent timer in `DSHubContext` polled the same device for the Registers and
 * Parameters panels.
 *
 * This registry replaces both. Subscribers declare *what* they need and *how
 * fresh* they need it; the registry issues exactly one read per distinct address
 * per tick, at the fastest interval any subscriber asked for.
 */

export type PollKey = `${DataSource}:${number}`;

export interface PollTarget {
  source: DataSource;
  address: number;
  /** Resolved register/parameter name, required by the backend read commands. */
  name: string;
}

interface Subscription extends PollTarget {
  intervalMs: number;
}

/** Issues the actual device read. Injected so the registry stays testable. */
export type ReadFn = (source: DataSource, address: number, name: string) => void;

const MIN_INTERVAL_MS = 50;

export class PollRegistry {
  private subscriptions = new Map<symbol, Subscription>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentPeriod = 0;
  private enabled = false;
  private read: ReadFn | null = null;
  /** Last dispatch time per address, so slower subscribers are not over-polled. */
  private lastPolled = new Map<PollKey, number>();

  /** Supplies the read implementation. Called once, from the provider. */
  setReader(read: ReadFn): void {
    this.read = read;
  }

  /** Polling only runs while the device is connected. */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.lastPolled.clear();
    this.reschedule();
  }

  /**
   * Registers interest in an address. Returns an unsubscribe function.
   * Multiple subscribers to the same address share a single device read.
   */
  subscribe(target: PollTarget, intervalMs: number): () => void {
    const token = Symbol('poll');
    this.subscriptions.set(token, {
      ...target,
      intervalMs: Math.max(MIN_INTERVAL_MS, intervalMs),
    });
    this.reschedule();
    // Read once immediately so a newly mounted widget is not blank until the
    // next tick, but only if nothing else just read this address.
    this.pollOne(target, Date.now());
    return () => {
      this.subscriptions.delete(token);
      this.reschedule();
    };
  }

  /** Distinct addresses currently being polled — used by the status bar. */
  get activeAddressCount(): number {
    return new Set(
      Array.from(this.subscriptions.values(), s => `${s.source}:${s.address}`)
    ).size;
  }

  /** Fastest interval any subscriber requested, or 0 when idle. */
  get effectiveIntervalMs(): number {
    return this.currentPeriod;
  }

  private pollOne(target: PollTarget, now: number): void {
    if (!this.enabled || !this.read) return;
    const key: PollKey = `${target.source}:${target.address}`;
    this.lastPolled.set(key, now);
    this.read(target.source, target.address, target.name);
  }

  private tick = (): void => {
    if (!this.enabled || !this.read) return;
    const now = Date.now();

    // One read per distinct address, honouring each address's fastest requested
    // interval rather than the global tick rate.
    const due = new Map<PollKey, PollTarget>();
    for (const sub of this.subscriptions.values()) {
      const key: PollKey = `${sub.source}:${sub.address}`;
      const last = this.lastPolled.get(key) ?? 0;
      // Allow a small slack so a 500ms subscriber on a 500ms tick is not
      // skipped by sub-millisecond timer jitter.
      if (now - last >= sub.intervalMs - 5) {
        due.set(key, sub);
      }
    }

    for (const target of due.values()) {
      this.pollOne(target, now);
    }
  };

  private reschedule(): void {
    const intervals = Array.from(this.subscriptions.values(), s => s.intervalMs);
    const period = intervals.length > 0 ? Math.min(...intervals) : 0;

    if (!this.enabled || period === 0) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.currentPeriod = 0;
      return;
    }

    if (this.timer && period === this.currentPeriod) return;

    if (this.timer) clearInterval(this.timer);
    this.currentPeriod = period;
    this.timer = setInterval(this.tick, period);
  }
}

/** Process-wide registry. One device connection, one poller. */
export const pollRegistry = new PollRegistry();
