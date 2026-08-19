/**
 * Records what reaches the port's per-address poll subscription mechanism
 * (`subscribeAddress`/`unsubscribeAddress`, `.scratch/rust-owned-polling` issue
 * 03), for a fake wired to a Pane under test.
 *
 * Mirrors `writeRecorder.ts`'s shape for the same reason: the recorder only
 * observes, forwarding to the same fake browser development runs against
 * rather than replacing it, so a subscription asserted through this is one the
 * interface really made.
 */

import type { BackendPort } from '../../services/backendPort';
import type { FakeBackendPort } from '../../services/fakeBackendPort';
import type { DataSource } from '../../types/dashboard';

export interface RecordedSubscription {
  readonly source: DataSource;
  readonly address: number;
  readonly name: string;
  readonly intervalMs: number;
}

export interface SubscriptionRecorder {
  /** The port to render a Pane against; every subscribe/unsubscribe it forwards is recorded. */
  readonly port: BackendPort;
  readonly subscriptions: RecordedSubscription[];
  readonly unsubscribedIds: number[];
}

export function recordSubscriptions(fake: FakeBackendPort): SubscriptionRecorder {
  const subscriptions: RecordedSubscription[] = [];
  const unsubscribedIds: number[] = [];

  const port: BackendPort = {
    ...fake,
    device: {
      ...fake.device,
      subscribeAddress: async (source, address, name, intervalMs) => {
        subscriptions.push({ source, address, name, intervalMs });
        return fake.device.subscribeAddress(source, address, name, intervalMs);
      },
      unsubscribeAddress: async id => {
        unsubscribedIds.push(id);
        return fake.device.unsubscribeAddress(id);
      },
    },
  };

  return { port, subscriptions, unsubscribedIds };
}
